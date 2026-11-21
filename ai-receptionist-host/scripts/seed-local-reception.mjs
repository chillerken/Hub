import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostDir = resolve(scriptDir, "..");
const config = JSON.parse(await (await import("node:fs/promises")).readFile(join(hostDir, "runtime-config.local.json"), "utf8"));
const envFile = await (await import("node:fs/promises")).readFile(join(hostDir, "local-supabase", "supabase", ".env.local"), "utf8");
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
  const i = line.indexOf("=");
  return [line.slice(0, i), line.slice(i + 1)];
}));
const base = String(config.supabaseUrl).replace(/\/$/, "");
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) {
  throw new Error("Veiligheidsstop: demo seed mag uitsluitend naar localhost schrijven.");
}
if (!service) throw new Error("Lokale service-role key ontbreekt. Start eerst npm run reception:local.");

const runId = Date.now().toString(36);
const password = process.env.LOCAL_DEMO_PASSWORD || "LocalOnly!2026";
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`${method} ${path} faalde (HTTP ${response.status}): ${JSON.stringify(data)}`);
  return data;
}
async function createOwner(label, company) {
  const email = `${label}-${runId}@example.test`;
  const user = await request("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email, password, email_confirm: true,
      user_metadata: { business_name: company, local_demo: true }
    }
  });
  const userId = user.id || user.user?.id;
  const membership = await request(`/rest/v1/memberships?user_id=eq.${userId}&role=eq.owner&select=organization_id`);
  const organizationId = membership?.[0]?.organization_id;
  if (!organizationId) throw new Error(`Auth provisioning heeft geen bedrijf aangemaakt voor ${email}`);
  return { userId, email, organizationId, company };
}
async function setActive(userId, organizationId) {
  await request("/rest/v1/user_org_context?on_conflict=user_id", {
    method: "POST",
    body: { user_id: userId, organization_id: organizationId, updated_at: new Date().toISOString() },
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
  });
}

console.log("Maak twee volledig fictieve lokale demo-bedrijven aan…");
const [ownerA, ownerB] = await Promise.all([
  createOwner("demo-owner-a", "Demo Garage Noord"),
  createOwner("demo-owner-b", "Demo Beauty Studio")
]);

await request("/rest/v1/memberships", {
  method: "POST",
  body: { organization_id: ownerA.organizationId, user_id: ownerB.userId, role: "agent", active: true },
  headers: { Prefer: "return=minimal" }
});
await Promise.all([
  setActive(ownerA.userId, ownerA.organizationId),
  setActive(ownerB.userId, ownerA.organizationId)
]);

const leadRows = await request("/rest/v1/leads", {
  method: "POST",
  body: [{
    organization_id: ownerA.organizationId,
    name: "Alex Demo",
    email: "alex@example.test",
    phone: "+32000000000",
    source: "local_demo",
    status: "new",
    score: 65,
    summary: "Fictieve demo-aanvraag voor een nieuwe website en automatische afspraken.",
    qualification: { service: "Demo service", budget: "test", notes: "Fictieve lokale seeddata." },
    dedupe_key: `local-demo-${runId}`
  }],
  headers: { Prefer: "return=representation" }
});
const lead = leadRows[0];
const conversations = await request("/rest/v1/conversations", {
  method: "POST",
  body: [{
    organization_id: ownerA.organizationId,
    lead_id: lead.id,
    channel: "web",
    status: "open"
  }],
  headers: { Prefer: "return=representation" }
});
await request("/rest/v1/messages", {
  method: "POST",
  body: [{
    organization_id: ownerA.organizationId,
    conversation_id: conversations[0].id,
    role: "customer",
    content: "Hallo, ik wil graag meer informatie over jullie diensten. (Lokale demo)"
  }],
  headers: { Prefer: "return=minimal" }
});
await request("/rest/v1/tasks", {
  method: "POST",
  body: [{
    organization_id: ownerA.organizationId,
    lead_id: lead.id,
    title: "Demo-lead opvolgen",
    status: "open",
    priority: "high",
    due_at: new Date(Date.now() + 86400000).toISOString()
  }],
  headers: { Prefer: "return=minimal" }
});

const accounts = {
  generated_at: new Date().toISOString(),
  note: "Fictieve accounts en gegevens voor Supabase Local. Nooit gebruiken in productie.",
  password,
  accounts: [
    { email: ownerA.email, company: ownerA.company, organization_id: ownerA.organizationId, role: "owner" },
    { email: ownerB.email, company: ownerB.company, organization_id: ownerB.organizationId, role: "owner" },
    { email: ownerB.email, company: ownerA.company, organization_id: ownerA.organizationId, role: "agent" }
  ],
  demo_lead: { id: lead.id, name: lead.name, organization_id: ownerA.organizationId }
};
writeFileSync(join(hostDir, "local-demo-accounts.json"), JSON.stringify(accounts, null, 2) + "\n");
console.log(JSON.stringify({
  ok: true,
  companies: [ownerA.company, ownerB.company],
  users: accounts.accounts,
  seeded: ["1 CRM-lead", "1 open gesprek", "1 klantbericht", "1 opvolgtaak"],
  credentials_file: "ai-receptionist-host/local-demo-accounts.json",
  password,
  note: "Alle gegevens zijn fictief en uitsluitend aangemaakt in Supabase Local."
}, null, 2));
