# Reception AI — Commercial product / no-sale gate

Status: **NOT APPROVED FOR SALE** (2026-10-11). This is a release checklist, not proof of a deployed feature.

## One reusable service, separate customers

Reuse one Reception AI application and backend. Each company receives its own:
- `organizations.id` and membership-based owner/admin access;
- `business_profiles` settings: company name, receptionist, language, services, opening hours, qualification questions, greeting, colors, widget token, allowed domains and notification address;
- conversations, leads, messages, appointment requests and workflow tasks scoped by `organization_id`;
- integration configuration/credentials scoped by `organization_id`, with credentials remaining server-only.

Never let a client select an arbitrary organization ID to authorize privileged operations.
A public widget token is public identification, **not** an admin credential.
Do not reuse LuxWash branding, pricing or provider secrets for another tenant.

## Required customer journey

1. Website visitor sends a message (record incoming message, scoped conversation).
2. Extract name + at least one reply channel (email or telephone) and register contact consent separately from marketing consent. Missing fields prompt one relevant question.
3. Create `appointments.status=requested` and one internal follow-up task. No invented availability, confirmation or calendar booking. Repeated messages must not create duplicate active requests.
4. Only authenticated tenant owner/admin can propose, schedule and explicitly confirm. Require a valid start and end; write operator audit event. A public visitor must not alter any confirmed appointment.
5. Once operator confirms, a tenant-scoped workflow may enqueue calendar sync and an appointment-confirmation message. Only send with valid contact consent and configured, verified providers. Require an actual delivery or accepted-provider receipt; `queued` does not mean `delivered`. Track retry, idempotency and manual exception handling.

## Non-negotiable acceptance tests

- [x] Existing multi-tenant schema and separate per-tenant settings are present (read-only production inspection).
- [x] Contract-level CI regression for public mutable statuses, operator rights, tenant scoping and human-before-calendar rule, in draft PR.
- [ ] Verify clean CI for the **latest** PR commit (evidence: exact SHA + GitHub Actions run).
- [ ] Execute isolated live API test on a safe non-customer environment; retain run timestamp, receipt, test ID and evidence of cleanup. Check all five workflow phases, including human audit.
- [ ] Prove **two real disposable tenants** cannot read or update each other's data or link a conversation from the other tenant.
- [ ] Prove a second public booking request cannot mutate the already confirmed slot.
- [ ] With sandbox/test integrations, prove consented follow-up is accepted by the provider, logged with its external message ID and not duplicated on retries/webhook replay.
- [ ] Prove failures and disconnections surface a blocked/manual-review state, not false success.
- [ ] Verify calendar writes happen only after confirmed status, and all actions are idempotent on retries/races.
- [ ] Security review: no public service-role keys, RLS cross-tenant access tests, dependency review and review open Supabase security advisors (including compromised-password protection).
- [ ] Operator sign-off on explicit test evidence and production release candidate; verify deployed version and smoke test without messaging real customers.

## Proof boundaries / release control

Source/CI tests establish code contracts, **not** end-to-end production behavior. The `production-e2e-check` readiness routine is staged in this PR but is not proof until deployed to an isolated environment, invoked with test-run credentials and backed by a successful receipt. It intentionally disables outbound automations, so it **cannot** prove a real provider delivery. Outbound follow-up must be separately exercised using sandbox sinks and synthetic recipients.

**DO NOT** merge, deploy to existing customer production, activate billing/subscriptions, send real customer communications, or market Reception AI as working/commercially ready until every unchecked item is independently verified. Preserve rollback for any future authorized release.
