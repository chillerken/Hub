# Reception AI — independently verifiable validation evidence

Date: 2026-10-11 (Europe/Brussels)
Source: draft PR #37 on GitHub `chillerken/Hub`. **Release status: BLOCKED.**
No live customer booking, payment, message, database migration or deployment was initiated by this check.

## 1. Real Postgres read-isolation check (existing Reception AI Production, read-only)

A transaction set the authenticated database role and simulated each of two existing, distinct membership users using JWT claims. Each scoped read returned exactly one visible membership, organization and business profile. Queries for cross-organization leads, appointments, conversations, messages and workflow actions each returned **zero leaked rows**, for *both* principals.

This checks live RLS SELECT behavior, not cross-tenant writes or an actual browser session. Transaction rolled back.

## 2. Executable HTTP endpoint regression (disposable in-memory adapter)

GitHub Actions `Reception AI Commercial Booking Gate`: [run 38152797963](https://github.com/chillerken/Hub/actions/runs/38152797963), head `b1e92259f013e7e87221990ce103fca613c7d926`.

**11 passed, 0 failed.** Tests include actual TypeScript Deno handler execution against synthetic, isolated Supabase responses rather than just matching source text:

- Two independently configured tenants, public origin and conversation scoping.
- Customer name, email, phone and consent captured; incoming and reply messages persisted.
- Request remains unconfirmed, repeated request deduplicated, task created.
- Authenticated owner confirms, cross-tenant owner and viewer denied.
- Calendar work queued only in the operator-approval path in this mock; duplicate approval does not requeue.
- Confirmed booking cannot be overwritten by a subsequent visitor request.
- Concurrent operator approval between public SELECT/UPDATE results in HTTP 409, not false success.
- Missing reply channel causes a useful contact question.
- Unauthenticated and missing-time confirmations rejected.

**Important limitation:** This is a *handler + mocked database* test. The Postgres trigger behavior and real Resend/Calendar delivery were not executed in that test.

## 3. Existing provider evidence, not proof of the new chain

- The production `workflow_actions` table showed five `lead_follow_up` actions with `provider=resend`, `status=completed` and a `provider_reference`.
- Connected Resend showed delivered transactional messages in its prior history.
- The appointment-confirmation action observed in the database was **skipped**, without a provider reference.
- Some historical attempts targeting `.invalid` addresses **bounced**; these are not successful provider-delivery tests.
- One WhatsApp integration was degraded and the second tenant's integrations required setup.

This does not establish delivery of a newly confirmed appointment for both tenants.

## 4. Explicit remaining release gates

- [ ] Run the changed build against an isolated real Supabase test environment using two disposable tenants with complete cleanup.
- [ ] Test real RLS write rejection and compare exact tenant-scoped records (without customer data).
- [ ] Test the complete SQL trigger -> workflow runner -> sandbox provider delivery path, with provider delivery receipt.
- [ ] Verify duplicate webhook / retry / timeout behavior, no duplicate external sends, and visible manual-review states.
- [ ] Review Supabase security advisor warnings: `pg_net` extension in public schema and disabled leaked-password protection.
- [ ] Re-run CI on the final, reviewed commit; operator sign-off before merge or deployment.

Until these pass, do **not** merge PR #37, deploy it into live client traffic, claim a proven end-to-end delivery chain, or market Reception AI as commercially validated.
