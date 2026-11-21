import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostDir = resolve(scriptDir, "..");
const repoRoot = resolve(hostDir, "..");
const localRoot = join(hostDir, "local-supabase");
const supabaseDir = join(localRoot, "supabase");
const cli = process.platform === "win32" ? "npx.cmd" : "npx";
const spawnOptions = { shell: process.platform === "win32", stdio: "inherit" };

function runSupabase(args) {
  const result = spawnSync(cli, ["-y", "supabase@3.2.0", ...args], {
    cwd: localRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: process.platform === "win32"
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Supabase CLI faalde: supabase ${args.join(" ")}`);
  return result.stdout || "";
}

function parseEnv(output, name) {
  const match = output.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) throw new Error(`Supabase status gaf ${name} niet terug.`);
  return match[1].trim().replace(/^["']|["']$/g, "");
}

async function waitFor(url, label, timeoutMs = 90000) {
  const until = Date.now() + timeoutMs;
  let lastError = "nog niet bereikbaar";
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} startte niet tijdig: ${lastError}`);
}

console.log("\n[1/4] Controleer volledige lokale Reception AI-broncode…");
const functionDirs = [
  "marketing-plan-action", "stripe-webhook", "google-calendar-oauth-callback",
  "public-widget-config", "sales-sequence-action", "integration-admin",
  "public-receipt-link", "commercial-agent-runner", "jarvis-orchestrator",
  "operations-admin", "marketing-agent-action", "billing-link", "tenant-health",
  "billing-return", "public-creator-site", "sales-batch-action", "creator-hub-action",
  "sales-agent-action", "platform-admin", "billing-readiness", "google-calendar-oauth-start",
  "review-agent-action", "reception-chat", "workflow-runner", "lead-agent-action",
  "sales-onboarding-context", "team-management", "ai-provider-health", "production-e2e-check",
  "public-contact-capture", "agent-admin", "public-demo-chat", "customer-payment-webhook",
  "onboarding-quickstart", "public-reception-chat", "sales-conversion-draft",
  "sales-lead-capture", "claim-sales-onboarding", "onboarding-status", "lead-outcome-action"
];
const fsPromises = await import("node:fs/promises");
for (const name of functionDirs) {
  const entry = join(supabaseDir, "functions", name, "index.ts");
  try { await fsPromises.access(entry); }
  catch { throw new Error(`Lokale Edge Function ontbreekt: ${name}. Herstel de repositorybestanden voordat je start.`); }
}

console.log("\n[2/4] Start geïsoleerde Supabase Local-stack…");
runSupabase(["start"]);

console.log("\n[3/4] Lees alleen lokale API-keys en configureer de browserclient…");
const status = runSupabase(["status", "-o", "env"]);
const supabaseUrl = parseEnv(status, "API_URL");
const anonKey = parseEnv(status, "ANON_KEY");
const parsedHost = new URL(supabaseUrl).hostname;
if (!["127.0.0.1", "localhost"].includes(parsedHost)) {
  throw new Error("Veiligheidsstop: Supabase Local gaf geen localhost API-URL terug.");
}
writeFileSync(join(hostDir, "runtime-config.local.json"), JSON.stringify({
  supabaseUrl,
  supabaseAnonKey: anonKey
}, null, 2) + "\n");
const envFile = join(supabaseDir, ".env.local");
const existingEnv = await fsPromises.readFile(envFile, "utf8").catch(() => "");
const values = new Map(existingEnv.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
  const i = line.indexOf("=");
  return [line.slice(0, i), line.slice(i + 1)];
}));
if (!values.has("GEMINI_API_KEY")) values.set("GEMINI_API_KEY", "replace-with-a-separate-development-key");
if (!values.has("STRIPE_WEBHOOK_SECRET")) values.set("STRIPE_WEBHOOK_SECRET", "whsec_local_test_only");
writeFileSync(envFile, [...values].map(([key, value]) => `${key}=${value}`).join("\n") + "\n");


console.log("\n[4/4] Start lokale Edge Function en Reception AI-webapp…");
const children = [];
const fn = spawn(cli, ["-y", "supabase@3.2.0", "functions", "serve", "--env-file", "supabase/.env.local"], {
  cwd: localRoot, ...spawnOptions
});
children.push(fn);
const web = spawn(cli, ["vite", "ai-receptionist-host", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  cwd: repoRoot, ...spawnOptions
});
children.push(web);

let stopping = false;
const stopChildren = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
};
process.on("SIGINT", () => { stopChildren(); process.exit(0); });
process.on("SIGTERM", () => { stopChildren(); process.exit(0); });

await waitFor("http://127.0.0.1:54321/auth/v1/health", "Supabase Auth");
await waitFor("http://127.0.0.1:54321/functions/v1/team-management", "team-management Edge Function");
async function waitForAllFunctions(timeoutMs = 90000) {
  const until = Date.now() + timeoutMs;
  let missing = functionDirs;
  while (Date.now() < until) {
    const checks = await Promise.all(functionDirs.map(async name => {
      try {
        const response = await fetch(`http://127.0.0.1:54321/functions/v1/${name}`, { signal: AbortSignal.timeout(3000) });
        return { name, status: response.status };
      } catch { return { name, status: 0 }; }
    }));
    missing = checks.filter(x => x.status === 0 || x.status === 404 || x.status >= 500);
    if (missing.length === 0) return;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error("Niet alle lokale Edge Functions starten correct: " + missing.map(x => `${x.name} (HTTP ${x.status})`).join(", "));
}
await waitForAllFunctions();
await waitFor("http://127.0.0.1:4173/", "Reception AI frontend");

console.log("\nLokale omgeving is klaar:");
console.log("  Reception AI: http://127.0.0.1:4173");
console.log("  Supabase Studio: http://127.0.0.1:54323");
console.log("  Supabase API: " + supabaseUrl);
console.log("  Testen: npm run reception:test:local");
console.log("  Stoppen: npm run reception:local:stop");
console.log("\nDeze browserconfiguratie weigert bewust elke niet-lokale Supabase-URL.");
await new Promise(() => {});
