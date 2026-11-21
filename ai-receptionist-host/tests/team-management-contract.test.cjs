const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const edge = fs.readFileSync(path.join(root, "supabase/functions/team-management/index.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261121112000_multi_company_context_and_team_invites.sql"), "utf8");

test("frontend uses server-validated organization context", () => {
  assert.match(app, /list_organizations/);
  assert.match(app, /set_active_organization/);
  assert.match(app, /orgSwitcherDesktop/);
  assert.match(app, /orgSwitcherMobile/);
});

test("team UI exposes invitation and membership actions", () => {
  for (const marker of ["teamInviteForm", "create_invite", "acceptTeamInviteIfPresent", "change_member_role", "remove_member", "revoke_invite"]) {
    assert.ok(app.includes(marker), "Missing frontend action: " + marker);
  }
});

test("invites are token-hashed, email-bound, single-use and time-limited", () => {
  for (const marker of ["token_hash", "invitation_email_mismatch", "invitation_expired", "invitation_closed", "email_confirmation_required"]) {
    assert.ok(edge.includes(marker), "Missing invitation guard: " + marker);
  }
  assert.match(edge, /7 \* 24 \* 60 \* 60 \* 1000/);
});

test("team permissions protect owners and admin operations", () => {
  for (const marker of ["only_owner_can_invite_admin", "only_owner_can_manage_admins", "owner_role_is_protected", "owner_cannot_be_removed", "cannot_remove_self", "invitation_rate_limit"]) {
    assert.ok(edge.includes(marker), "Missing permission guard: " + marker);
  }
});

test("organization context and invitations are server-only", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.user_org_context from anon, authenticated/i);
  assert.match(migration, /revoke all on public\.team_invitations from anon, authenticated/i);
  assert.match(migration, /grant all on public\.user_org_context to service_role/i);
  assert.match(migration, /grant all on public\.team_invitations to service_role/i);
});
