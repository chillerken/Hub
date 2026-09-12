# LuxWash central system — deployment and acceptance

Existing application: Render `ai-business-automation-production-gj`, Supabase EU Frankfurt. Existing phone gateway: Render `luxwash-lina-phone-agent`. Existing site: `www.luxwash.online` (Sites). No new paid services provisioned.

## Owner configuration still required if absent

- Planning: open Settings, enter real working hours and allowed postcodes. Review service duration, travel buffer and fixed/estimate prices. No hours or coverage are invented.
- Voice: existing Zadarma +32 2 886 21 34 must route to the existing OpenAI project's SIP URI. Rinkel 053 896 400 must forward to that number. Verify routing in provider account; neither provider route is assumed live. The existing webhook remains `/openai/realtime-webhook` on the Lina Render service.
- Voice environment: OPENAI_API_KEY, OPENAI_WEBHOOK_SECRET, SUPABASE_APP_SECRET (same existing central secret); optional CENTRAL_API_URL, OPENAI_REALTIME_MODEL, OPENAI_REALTIME_VOICE. Configure through Render secrets, never customer forms or chat.
- Email: RESEND_API_KEY, RESEND_FROM with verified domain. For receipt/delivery events: RESEND_WEBHOOK_SECRET and `/api/webhooks/resend`; inbound DNS/forwarding must be configured by mailbox owner. Existing Gmail OAuth is not silently converted to a Resend mailbox.
- Admin: existing strong admin password remains usable. Supabase password sign-in backend requires an active owner/admin row in public.users. No user is promoted by client metadata.
- Stripe callback verification is implemented at `/api/webhooks/stripe`; checkout creation/charges are not enabled. Manual payment tracking is available.

## Hosting constraint

Both existing Render services use the free plan and can sleep. This cannot meet an always-available phone receptionist or precise reminder SLA. A paid always-on deployment or another non-sleeping runtime requires the owner's budget choice. Do not mark voice production-ready on the free tier.

## Security

New tables have RLS and explicit read policies tied to enabled membership. Privileged writes go through the server's existing high-entropy app-secret RPC guard. Supabase advisors warn about the intentionally callable SECURITY DEFINER gateway; direct private dispatch and tables are not anonymously accessible, and incorrect-secret/RLS tests pass. Migration to a scoped server credential and retirement of the legacy RPC remain hardening work; do not present an all-clear external security audit.

No audio recordings. Transcript TTL 30 days; message TTL 90 days. Cleanup is independently scheduled every 15 minutes with Supabase pg_cron. Reminders still require a non-sleeping runtime for punctual delivery. Owner must verify processor agreements, transfer safeguards, financial retention periods and privacy notice accuracy. This implementation is not a legal compliance certification.

## Verification distinction

- Real PostgreSQL transactional tests run through Supabase, rolling back all synthetic contacts, bookings, quotes and job changes.
- JS and Python unit tests use explicit test doubles only inside tests. Production has no fake integrations.
- Build/syntax tests verify executable code, not a completed PSTN call or email delivery.
- Live acceptance requires a genuine incoming call, stored customer/appointment/transcript, received confirmation email and correct dashboard/agenda. It has not passed until observed.

## Unsupported / incomplete acceptance areas

Optional Google Calendar synchronization, WhatsApp templates, SMS delivery, full role-specific admin UI, provider-side audio recording, invoice PDF generation, automatic external review detection, cohort analysis and employee-specific capacity planning are not yet complete. The database supports them but schema presence is not implementation.

## Release safety

Apply migrations before app deployment. Ship Node backend before the Python phone gateway and Sites proxy. Keep existing provider secrets. On backend failure, leave the current website public form and phone provider fallback available. Do not restore the legacy endpoint that could create appointments without a verified duration.

Migration filenames match the versions actually recorded by Supabase. This repository extends an existing project; earlier remote migrations predate this implementation and include historical secret rotations. Do not run these additions against an empty database or blindly use CLI db push without first reconciling the existing baseline in a secure workspace.
