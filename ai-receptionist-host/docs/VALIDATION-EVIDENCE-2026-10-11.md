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


## 7. Disposable PostgreSQL-backed integrated chain and real RLS tests

**Evidence:** [GitHub Actions run 38154989384](https://github.com/chillerken/Hub/actions/runs/38154989384), commit a814f9845d3d255c25ccc42ad3e93ac8286130c4. All three CI jobs succeeded. No production changes, external sends, actual recipients or payment activity.

New PostgreSQL 16 local integration, one joined end-to-end test:
1. Actual public-reception-chat TypeScript HTTP handler stores a synthetic lead, conversation, visitor and assistant messages, requested appointment and one follow-up task in real PostgreSQL. The actual SQL trigger creates zero calendar/confirmation actions before approval.
2. Actual operations-admin HTTP handler enforces mocked user identity, real tenant-scoped database lookups and explicit approval. Foreign tenant and non-admin viewer are rejected. Correct owner confirmation persists an audit event and causes the real SQL trigger to enqueue exactly one calendar action and one confirmation action.
3. Actual workflow-runner HTTP handler validates a synthetic runner secret and claims actual PostgreSQL workflow actions. It executes the genuine Resend adapter against an in-process transport sink, persists a synthetic message reference and reports provider-accepted status; the absent Google Calendar integration is blocked. Repeated worker invocations do not resend.
4. Both independent synthetic tenants execute the booking workflow; widget origin isolation, cross-tenant conversation isolation, and operator tenant isolation pass.
5. A lead without consent is denied an outbound confirmation. A subsequent approved reschedule generates a new content-specific provider idempotency key and one updated message with no repeat send.

The same ephemeral PostgreSQL environment then executes 15 passing SQL RLS assertions: reads stay within the tenant, unauthorized lead and company-profile writes affect zero rows, a tenant owner may change only their own settings, a viewer cannot change tenant settings, and authenticated clients cannot update appointments or enqueue outbound provider actions directly. RLS policies and membership functions were reconstructed from read-only production metadata.

**Non-proven boundaries:** These tests use actual PostgreSQL triggers and actual HTTP handler code, but Supabase Auth, the PostgREST Data API and the Edge runtime are represented by an isolated adapter; the provider sink only simulates Resend API acceptance, never external delivery. The test does not prove a full hosted Supabase or real customer communication chain.

Commercial release remains **BLOCKED**. A fully isolated actual Supabase stack with Auth/PostgREST/Edge, provider delivery event/receipt, retry/replay review, real rights verification, Supabase adviser remediation and operator sign-off are still mandatory. Keep PR #37 draft, unmerged and undeployed to production.


## 8. Actual local Supabase Auth + PostgREST + Edge (2026-10-11)

**Successful CI proof:** [GitHub Actions run 38156146579](https://github.com/chillerken/Hub/actions/runs/38156146579), code commit acacab6c5f752f32c9b31be1bdac03d869fd0a3c. **4/4 jobs passed**, including the previously absent local Supabase real Auth/API/Edge integration.

GitHub Actions launched an isolated, disposable local Supabase CLI stack with authentic GoTrue/Auth, PostgREST, Kong, Edge runtime and PostgreSQL containers. This job downloaded the local CLI, initialized a new *unlinked* project and generated credentials locally. It did not create or access an additional Supabase cloud project.

It then provisioned three synthetic local Auth users belonging to two distinct organizations, with separate owner and viewer roles. Using real Supabase Auth signup/admin creation and password sign-in, it proved that:
- Tenant A and B only read their own organizations and business profiles through actual authenticated PostgREST; anonymous access receives a PostgreSQL permission error or zero rows.
- Cross-tenant business profile updates are rejected and an ordinary viewer cannot change business settings, while the actual owner can change their own settings.
- Regular authenticated users cannot directly update appointments or insert outbound workflow actions.
- The real locally hosted public-reception-chat Edge Function enforces origin allowlists and persists lead, messages, task and requested appointment using the actual Supabase Data API. A requested appointment generates no outbound workflow actions.
- The real locally hosted operations-admin Edge Function denies a different tenant and a viewer from confirming the appointment. It permits the correct authorized owner to confirm, records one operator audit event, and creates one calendar plus one confirmation action using the actual PostgreSQL trigger.
- A second public request creates a new pending appointment without modifying the confirmed slot. A second organization's widget remains correctly isolated, including cross-tenant conversation hijack prevention.

All associated Node assertions passed. After the test, GitHub Actions stopped the temporary Supabase containers with --no-backup. The first two development iterations failed due to inaccurate test-fixture expectations, not the production code: the fresh local schema carried broader default write grants than production, and anonymous access correctly returned HTTP/SQL permission denied rather than an empty list. These were fixed in the test-only RLS setup and test assertions; the successful last run is the evidence.

**Important limitations**: Supabase was running the actual services locally, rather than being a production-hosted Supabase project. The booking Edge Functions, Auth and Data API are now authentically exercised. The workflow-runner + Resend connector + Calendar integration path remains proven only with a separate real PostgreSQL and simulated transport sink. No actual email was sent or delivered in this exercise; an accepted fake-provider receipt is not an inbox delivery event. Real provider integration, delivery event/receipt, end-to-end replay, production hardening and release sign-off remain mandatory.

The two previously reported production Supabase security advisor warnings remain open. Production remains unchanged, PR #37 stays draft and NOT APPROVED FOR SALE.
