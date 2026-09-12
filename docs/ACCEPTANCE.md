# Acceptance evidence

2026-09-12

- PostgreSQL schema installation validated in rollback transaction, then applied to the existing Supabase project.
- PostgreSQL scenarios passed: real inserts, availability, work-area rejection, no overlap, idempotency, move, management-token authorization, confirmation/reminder jobs, completed appointment, review request, repeat suggestion, job claim, customer reuse, call/tool deduplication, request limit, anonymous denial and unauthorized authenticated denial.
- Additional SQL checks passed for actual service catalog, quote draft/approval, delivery context, customer export and update after fixing an ambiguous PL/pgSQL variable.
- 17 Node tests passed, including a real local HTTP server test. Production has no test provider; test doubles are explicitly limited to test/core.test.js.
- 4 Python voice tests passed: duplicate tool event, failed booking creates callback, webhook signature rejection, no false live-ready/recording claim.
- React production bundle built with esbuild.
- Existing website: 56 tests passed, 3 Android checks skipped because the Android project is absent; metadata/accessibility fixed for new pages. The obsolete hard-coded-chat assertions were replaced with assertions for backend chat and no hard-coded price.
- Cloud browser's live Render inspection blocked by browser URL security policy. No bypass attempted. This does not prove that the service itself is down.
- No real PSTN call or received confirmation email has been demonstrated in this session. Do not claim full production readiness.

- Atomic intake, retry deduplication, customer linkage and stable email first-attempt timestamp passed in a rolled-back database transaction.
