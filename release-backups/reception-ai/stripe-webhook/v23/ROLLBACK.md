# Reception AI Stripe webhook production v23 rollback

- Project: ndecxbsrxspkuxjsbndq
- Function: stripe-webhook
- Previous live version: 23
- Function status: ACTIVE
- verify_jwt: false (public endpoint verifies Stripe signature internally)
- Supabase deployed bundle SHA-256: 8265012eb81c7763b1852978badbc370640d72540c291d039829d4607cd57b22
- Files: index.ts and billing-event-guard.js from this branch
- Recovery: redeploy ONLY stripe-webhook with both saved files, entrypoint index.ts, verify_jwt false. Recheck ACTIVE and compare both files.
- Backup captured before PR #29 merge / release.
- No secrets included.
