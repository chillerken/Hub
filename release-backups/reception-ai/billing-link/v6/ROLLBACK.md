# Reception AI billing-link v6 rollback

Captured: 2026-10-11 (before PR #31 merge and release)

- Supabase project: ndecxbsrxspkuxjsbndq
- Function: billing-link
- Previous function version: 6
- Previous status: ACTIVE
- Important: verify_jwt **true** (do not switch off)
- Previously deployed bundle SHA-256: 2cb180e720edb12b4ebe0285f0ad1f43e1ea27c99bef29eedc3d7886b9c7cf1a
- Entrypoint: index.ts
- Files: index.ts only
- Rollback: deploy the exact saved index.ts alone as billing-link, entrypoint index.ts, verify_jwt true. Re-read live function and confirm exact file bytes and ACTIVE. Redeployment creates a new numeric version; it does not restore version number 6.
- No database changes, payments, messages or bookings are part of this rollback.
