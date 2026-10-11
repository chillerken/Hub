# Reception AI Stripe webhook — production rollback v24

Captured before PR #32 merge and release on 2026-10-11.

- Supabase project ID: ndecxbsrxspkuxjsbndq
- Function slug: stripe-webhook
- Previous deployment version: 24
- Previous status: ACTIVE
- `verify_jwt`: false; Stripe signature authentication is implemented in the webhook body
- Prior deployment bundle SHA-256: ce67519e05bdb23ba68fdd60c1fc7df44437b6f46bbd3b25825949094ed5e7d1
- Entrypoint: `index.ts`
- Files: `index.ts`, `billing-event-guard.js`
- Restore: deploy ONLY `stripe-webhook` with BOTH saved files, entrypoint `index.ts`, `verify_jwt=false`. Re-read live function and compare both files exactly. A new deployment will have a new version number, not 24.
- No database migration, real Stripe charge, customer message or booking is part of this backup.
