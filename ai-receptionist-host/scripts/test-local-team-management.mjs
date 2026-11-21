import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostDir = resolve(scriptDir, "..");
const config = JSON.parse(readFileSync(join(hostDir, "runtime-config.local.json"), "utf8"));
const localRoot = join(hostDir, "local-supabase");
const cli = process.platform === "win32" ? "npx.cmd" : "npx";
const status = spawnSync(cli, ["-y", "supabase@3.2.0", "status", "-o", "env"], {
  cwd: localRoot, encoding: "utf8", shell: process.platform === "win32"
});
if (status.status !== 0) throw new Error("Kan lokale Supabase-keys niet ophalen: " + status.stderr);
const serviceMatch = status.stdout.match(/^SERVICE_ROLE_KEY=(.*)$/m);
const base = String(config.supabaseUrl).replace(/\/$/, "");
const anon = config.supabaseAnonKey;
const service = serviceMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Tests mogen alleen localhost aanspreken.");
assert.ok(anon && service, "Lokale anon- of service-role-key ontbreekt.");

const runId = Date.now().toString(36);
const password = "LocalOnly!2026";
let passed = 0;
const results = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  passed++;
  results.push(name);
};
const json = async response => {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
};
async function request(path, { method = "GET", body, key = service, bearer = key, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  return { status: response.status, data: await json(response) };
}
async function createUser(label) {
  const email = `${label}-${runId}@example.test`;
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { local_test: true, business_name: `Testbedrijf ${label} ${runId}` } }
  });
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Lokale testgebruiker kon niet worden aangemaakt (${result.status}): ${JSON.stringify(result.data)}`);
  }
  const id = result.data.id || result.data.user?.id;
  const memberships = await request(`/rest/v1/memberships?user_id=eq.${id}&select=organization_id,role`);
  const ownerMembership = memberships.data?.find(row => row.role === "owner");
  if (memberships.status !== 200 || !ownerMembership) {
    throw new Error(`Auth signup-trigger heeft geen owner-lidmaatschap aangemaakt: ${JSON.stringify(memberships.data)}`);
  }
  const profile = await request(`/rest/v1/business_profiles?organization_id=eq.${ownerMembership.organization_id}&select=organization_id,business_name`);
  return {
    id, email, organizationId: ownerMembership.organization_id,
    profileCreated: profile.status === 200 && profile.data?.length === 1
  };
}
async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST", key: anon, bearer: anon, body: { email, password }
  });
  if (result.status !== 200 || !result.data.access_token) {
    throw new Error(`Aanmelden mislukt voor ${email}: ${JSON.stringify(result.data)}`);
  }
  return result.data.access_token;
}
async function addMembership(orgId, userId, role) {
  const result = await request("/rest/v1/memberships", {
    method: "POST",
    body: { organization_id: orgId, user_id: userId, role, active: true },
    headers: { Prefer: "return=representation" }
  });
  if (result.status !== 201 || !result.data?.[0]?.id) {
    throw new Error(`Testlidmaatschap kon niet worden aangemaakt: ${JSON.stringify(result.data)}`);
  }
  return result.data[0];
}
async function setContext(userId, orgId) {
  const result = await request("/rest/v1/user_org_context?on_conflict=user_id", {
    method: "POST",
    body: { user_id: userId, organization_id: orgId, updated_at: new Date().toISOString() },
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
  });
  if (result.status !== 201 && result.status !== 204) {
    throw new Error(`Actieve organisatie kon niet worden ingesteld: ${JSON.stringify(result.data)}`);
  }
}
async function callTeam(token, body) {
  return request("/functions/v1/team-management", {
    method: "POST", key: anon, bearer: token, body
  });
}

const functionNames = ["marketing-plan-action","stripe-webhook","google-calendar-oauth-callback","public-widget-config","sales-sequence-action","integration-admin","public-receipt-link","commercial-agent-runner","jarvis-orchestrator","operations-admin","marketing-agent-action","billing-link","tenant-health","billing-return","public-creator-site","sales-batch-action","creator-hub-action","sales-agent-action","platform-admin","billing-readiness","google-calendar-oauth-start","review-agent-action","reception-chat","workflow-runner","lead-agent-action","sales-onboarding-context","team-management","ai-provider-health","production-e2e-check","public-contact-capture","agent-admin","public-demo-chat","customer-payment-webhook","onboarding-quickstart","public-reception-chat","sales-conversion-draft","sales-lead-capture","claim-sales-onboarding","onboarding-status","lead-outcome-action"];
const functionChecks = [];
for (let i = 0; i < functionNames.length; i += 5) {
  const batch = functionNames.slice(i, i + 5);
  const results = await Promise.all(batch.map(async name => {
    const response = await fetch(`${base}/functions/v1/${name}`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(20000)
    });
    return { name, status: response.status };
  }));
  functionChecks.push(...results);
}
const brokenFunctions = functionChecks.filter(x => (x.status === 404 && x.name !== "public-creator-site") || x.status >= 500);
console.log("Edge Function smoke results:", JSON.stringify(functionChecks));
if (brokenFunctions.length) throw new Error(`Edge Function bootfouten: ${JSON.stringify(brokenFunctions)}`);
const creatorSiteProbe = await fetch(`${base}/functions/v1/public-creator-site?token=00000000-0000-4000-8000-000000000000`, { headers: { apikey: anon } });
check("Public creator-site route start en geeft veilig HTML-404 voor een onbekende publicatietoken", creatorSiteProbe.status === 404 && creatorSiteProbe.headers.get("content-type")?.includes("text/html"));
check("Alle repository-Edge-Functions zijn lokaal beschikbaar zonder live credentials", true);

console.log("Lokale Supabase-integratietests starten…");
const signupEmail = `signup-${runId}@example.test`;
const signup = await request("/auth/v1/signup", {
  method: "POST", key: anon, bearer: anon,
  body: { email: signupEmail, password, data: { business_name: "Lokale registratiecontrole" } }
});
check("Auth-registratie accepteert een nieuwe lokale gebruiker", signup.status === 200 && Boolean(signup.data.user?.id || signup.data.id));

const [owner, invitee, outsider, target] = await Promise.all([
  createUser("owner"), createUser("invitee"), createUser("outsider"), createUser("target")
]);
const orgA = { id: owner.organizationId };
const orgB = { id: outsider.organizationId };
check("Auth signup-trigger maakt bedrijf, owner-lidmaatschap en bedrijfsprofiel aan", Boolean(owner.organizationId && owner.profileCreated));
const targetMembership = await addMembership(orgB.id, target.id, "viewer");
await Promise.all([setContext(owner.id, orgA.id), setContext(outsider.id, orgB.id)]);
const [ownerToken, inviteeToken, outsiderToken] = await Promise.all([
  signIn(owner.email), signIn(invitee.email), signIn(outsider.email)
]);

const orgs = await callTeam(ownerToken, { action: "list_organizations" });
check("Gebruiker ziet zijn eigen organisatiecontext", orgs.status === 200 && orgs.data.organizations?.some(o => o.id === orgA.id));

const invite = await callTeam(ownerToken, { action: "create_invite", email: invitee.email, role: "agent" });
check("Owner kan een teamuitnodiging aanmaken", invite.status === 200 && invite.data.invitation?.status === "pending");
const inviteToken = new URL(invite.data.invitation_path, "http://localhost").searchParams.get("token");
check("Uitnodiging geeft een eenmalige tokenlink terug", /^[a-f0-9]{64}$/i.test(inviteToken || ""));

const accepted = await callTeam(inviteeToken, { action: "accept_invite", token: inviteToken });
check("Uitgenodigde gebruiker kan met bevestigd e-mailadres toetreden", accepted.status === 200 && accepted.data.membership?.role === "agent");
const invitedMembershipId = accepted.data.membership.id;

const changed = await callTeam(ownerToken, { action: "change_member_role", membership_id: invitedMembershipId, role: "viewer" });
check("Owner kan rol van eigen teamlid wijzigen", changed.status === 200 && changed.data.role === "viewer");

const replay = await callTeam(inviteeToken, { action: "accept_invite", token: inviteToken });
check("Een geaccepteerde uitnodiging kan niet opnieuw gebruikt worden", replay.status === 409);

const mismatchInvite = await callTeam(ownerToken, { action: "create_invite", email: `mismatch-${runId}@example.test`, role: "agent" });
const mismatchToken = new URL(mismatchInvite.data.invitation_path, "http://localhost").searchParams.get("token");
const mismatch = await callTeam(outsiderToken, { action: "accept_invite", token: mismatchToken });
check("Uitnodiging is gebonden aan het bedoelde e-mailadres", mismatch.status === 403 && mismatch.data.error === "invitation_email_mismatch");

const crossTenant = await callTeam(ownerToken, {
  action: "change_member_role", membership_id: targetMembership.id, role: "agent", organization_id: orgA.id
});
check("Bedrijf A kan geen lidmaatschap van bedrijf B wijzigen", crossTenant.status === 404 && crossTenant.data.error === "member_not_found");

const selectOtherOrg = await callTeam(ownerToken, { action: "set_active_organization", organization_id: orgB.id });
check("Gebruiker kan geen vreemde organisatie als actief instellen", selectOtherOrg.status === 403);

const viewerInvite = await callTeam(inviteeToken, { action: "create_invite", email: `blocked-${runId}@example.test`, role: "agent" });
check("Viewer kan geen teamuitnodigingen beheren", viewerInvite.status === 403 && viewerInvite.data.error === "admin_role_required");

const stillViewer = await request(`/rest/v1/memberships?id=eq.${targetMembership.id}&select=role,organization_id`);
check("Cross-tenant test laat het lidmaatschap in bedrijf B ongewijzigd", stillViewer.status === 200 && stillViewer.data?.[0]?.role === "viewer" && stillViewer.data?.[0]?.organization_id === orgB.id);

console.log(JSON.stringify({ ok: true, passed, total: results.length, tests: results, note: "Alle records zijn uitsluitend aangemaakt in Supabase Local." }, null, 2));
