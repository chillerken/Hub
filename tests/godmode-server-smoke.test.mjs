import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("private Node API boots, authenticates, rejects cross-origin login and fails closed without Gemini key", async () => {
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, "server.js"), "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      DISABLE_HMR: "true",
      APP_ACCESS_PASSWORD: "smoke-test-private-password",
      SESSION_SECRET: "smoke-test-session-secret-at-least-32-characters",
      GEMINI_API_KEY: ""
    },
    stdio: "ignore"
  });

  try {
    let ready = false;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`GOD MODE server exited early with code ${child.exitCode}`);
      try {
        const response = await fetch(origin + "/api/auth", { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(200);
    }
    assert.equal(ready, true, "server did not become ready within 20 seconds");

    const anonymous = await fetch(origin + "/api/auth");
    assert.deepEqual(await anonymous.json(), { authenticated: false });

    const crossOrigin = await fetch(origin + "/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example"
      },
      body: JSON.stringify({ action: "login", password: "smoke-test-private-password" })
    });
    assert.equal(crossOrigin.status, 403);

    const login = await fetch(origin + "/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin
      },
      body: JSON.stringify({ action: "login", password: "smoke-test-private-password" })
    });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { authenticated: true });
    const setCookie = login.headers.get("set-cookie") || "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Max-Age=28800/i);
    const cookie = setCookie.split(";")[0];
    assert.match(cookie, /^godmode_session=/);

    const authenticated = await fetch(origin + "/api/auth", {
      headers: { Cookie: cookie }
    });
    assert.deepEqual(await authenticated.json(), { authenticated: true });

    const aiWithoutProviderKey = await fetch(origin + "/api/gemini/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie
      },
      body: JSON.stringify({ prompt: "smoke test", model: "gemini-3-flash-preview" })
    });
    assert.equal(aiWithoutProviderKey.status, 503);
    assert.match((await aiWithoutProviderKey.json()).error, /not configured/i);

    const logout = await fetch(origin + "/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie
      },
      body: JSON.stringify({ action: "logout" })
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/i);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(3_000)
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
