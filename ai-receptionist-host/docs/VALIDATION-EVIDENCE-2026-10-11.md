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


## 5. Additional isolated proof on 2026-10-11 (PostgreSQL + provider adapter)

**CI evidence:** [run 38153611343](https://github.com/chillerken/Hub/actions/runs/38153611343), tested code commit `0d058033951f9c30fd960e15a7a26cb3bed945c8`, both jobs succeeded.

- **21/21 Node tests passed** using real transpiled Reception AI HTTP handlers and the actual Resend adapter, with all Supabase/provider calls routed to synthetic isolated fixtures.
- **16/16 PostgreSQL 16 lifecycle assertions passed** against the staged `enqueue_appointment_lifecycle_actions` PL/pgSQL function. No live Supabase migration occurred.
- The SQL function now queues calendar and confirmation workflow actions **only after appointment status is `confirmed`**, with idempotent reschedules/cancellations and tenant-scoped action keys. A public request with a fully parsed timestamp creates **zero** calendar or confirmation actions.
- Resend processing now requires a non-empty provider message ID before claiming `completed`. Network uncertainty, provider 5xx, or a success response without ID become `blocked` for manual review. Only 429 and explicitly concurrent-idempotency 409 are automatically retryable; a payload-mismatch 409 fails closed.
- Provider idempotency keys are SHA-256 based on the immutable workflow identity **and exact outbound content**, so a new approved appointment time gets a new key while retransmissions of identical content reuse the same key.
- Resend documents that its idempotency protection is **24 hours**; after unknown delivery or the expiry window, a manual provider status check remains required. See https://resend.com/changelog/idempotency-keys
- The real production function definition was checked read-only against the historical migration source; the meaningful trigger body matches, aside from formatting/SQL wrapper.

**Evidence limitations:** The disposable PostgreSQL job and mocked HTTP tests run separately. They do not prove the complete chain in a deployed real Supabase staging project, nor actual provider *delivery*. The mocked Resend response is an **accepted** receipt, not evidence of inbox delivery.

## 6. Outstanding external environment and security blockers

The available Supabase projects are `Reception AI Production` and `AI Business Automation Production`, with no existing development branch. No third non-production environment was available for safely deploying the pending Edge Functions and SQL migration. A new Supabase branch/project may have a charge and must not be created until its cost is checked and explicitly approved.

The current Supabase security advisor still reports:
- `extension_in_public` for `pg_net`: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- `auth_leaked_password_protection`: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

**No-sale gate remains active.** Still required: a disposable real Supabase deployment and complete HTTP-to-SQL-to-worker test; delivery event/receipt from a test mailbox using real provider credentials; confirmation retry/replay inspection; cleanup evidence; advisor remediation/acceptance; operator review and sign-off. No merge, real emails, payment, customer booking or production deployment was performed during this validation.
