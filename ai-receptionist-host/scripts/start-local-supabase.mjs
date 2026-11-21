import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
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
  const result = spawnSync(cli, ["-y", "supabase@latest", ...args], {
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

console.log("\n[1/4] Synchroniseer uitsluitend de lokale teambeheerbestanden…");
const functionSource = join(hostDir, "supabase", "functions", "team-management", "index.ts");
const migrationSource = join(hostDir, "supabase", "migrations", "20261121112000_multi_company_context_and_team_invites.sql");
const localFunction = join(supabaseDir, "functions", "team-management", "index.ts");
const localMigration = join(supabaseDir, "migrations", "20261121112000_multi_company_context_and_team_invites.sql");
mkdirSync(dirname(localFunction), { recursive: true });
mkdirSync(dirname(localMigration), { recursive: true });
copyFileSync(functionSource, localFunction);
copyFileSync(migrationSource, localMigration);

console.log("\n[2/4] Start geïsoleerde Supabase Local-stack…");
runSupabase(["start"]);

console.log("\n[3/4] Lees alleen lokale API-keys en configureer de browserclient…");
const status = runSupabase(["status", "-o", "env"]);
const supabaseUrl = parseEnv(status, "API_URL");
const anonKey = parseEnv(status, "ANON_KEY");
const serviceRoleKey = parseEnv(status, "SERVICE_ROLE_KEY");
const parsedHost = new URL(supabaseUrl).hostname;
if (!["127.0.0.1", "localhost"].includes(parsedHost)) {
  throw new Error("Veiligheidsstop: Supabase Local gaf geen localhost API-URL terug.");
}
writeFileSync(join(hostDir, "runtime-config.local.json"), JSON.stringify({
  supabaseUrl,
  supabaseAnonKey: anonKey
}, null, 2) + "\n");
writeFileSync(join(supabaseDir, ".env.local"), [
  `SUPABASE_URL=${supabaseUrl}`,
  `SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
  `SUPABASE_PUBLISHABLE_KEYS=${JSON.stringify({ default: anonKey })}`,
  `SUPABASE_SECRET_KEYS=${JSON.stringify({ default: serviceRoleKey })}`,
  ""
].join("\n"));

console.log("\n[4/4] Start lokale Edge Function en Reception AI-webapp…");
const children = [];
const fn = spawn(cli, ["-y", "supabase@latest", "functions", "serve", "team-management", "--env-file", "supabase/.env.local"], {
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
await waitFor("http://127.0.0.1:4173/", "Reception AI frontend");

console.log("\nLokale omgeving is klaar:");
console.log("  Reception AI: http://127.0.0.1:4173");
console.log("  Supabase Studio: http://127.0.0.1:54323");
console.log("  Supabase API: " + supabaseUrl);
console.log("  Testen: npm run reception:test:local");
console.log("  Stoppen: npm run reception:local:stop");
console.log("\nDeze browserconfiguratie weigert bewust elke niet-lokale Supabase-URL.");
await new Promise(() => {});
