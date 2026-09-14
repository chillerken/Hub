# LuxWash flow expansion — 2026-09-14

## Delivered on the existing architecture
- Reuses chillerken/Hub branch ai-business-production, the existing Render Node service, and the existing Supabase database. No new hosting service, duplicate CRM, external paid plan, or new credential was created.
- Exact email/phone matching reuses an unambiguous active contact without overwriting identity, disclosing customer data to a public caller, or granting booking management rights. Conflicting contacts require human review.
- Extends the existing events table with deduplicated, PII-minimized business events.
- Adds editable lead pipeline states and contact/opt-out tracking.
- Newly captured website enquiries receive a queued acknowledgement. Acknowledgements are not booking confirmations. No historical bulk send/backfill is performed.
- Overdue leads create owner tasks. Automatic second/third lead messages remain disabled until inbound reply processing is verified; recorded inbound replies cancel queued follow-up/repeat jobs independently of AI.
- Approved quotes have HMAC-derived, hashed-at-rest capability links; public view/accept/decline use POST and Same-Origin restrictions. Explicit customer acceptance is required, expiry is enforced, and repeated decisions are idempotent. Acceptance creates a planning task, not an unverified booking.
- Accepted quotes reuse the existing atomic quote-booking flow.
- Reviews already recorded and previous review requests suppress further automatic asks; a per-customer reservation prevents concurrent review sends. Marketing suppression is checked again at send time.
- Adds server-authorized ICS calendar export. This is not Google Calendar two-way sync.
- Adds mobile dashboard sections for action-required items, integrations, events, source counts, customer value, social concepts and observed Metricool errors.
- Dashboard uses dark LuxWash styling with yellow accents. Existing auth, core booking pages and records are preserved.
- Social concepts reject exact normalized duplicates. They are drafts, never shown as scheduled/published.
- Existing ChatGPT Social Agent now halts new scheduling on provider quota/permission errors; no paid upgrade is authorized.

## Verification
Migration and new DB flows were executed within explicit BEGIN/ROLLBACK transactions. Passed: customer reuse, event idempotence, acknowledgement dedupe, reply stop, wrong quote-token denial, quote view/accept/decision idempotence, accepted quote booking, existing booking conflict/move/cancel/RLS cases, existing quote regressions, review suppression, social duplicate denial, dashboard queries. No synthetic contacts or deliveries remain.

JavaScript syntax checked before commit. Render installation is gated by the React build and all Node tests (isolated mocks and a local HTTP server with no external provider calls). Deployment evidence is recorded in Render logs.

## Not production-accepted / blockers
- Sites www.luxwash.online remains on version 26: this session has no Sites source-editing skill/runtime. These changes target the existing central backend at https://ai-business-automation-production-gj.onrender.com/cockpit, not the separate Sites /controle page.
- OpenAI inference reports insufficient_quota in the latest available provider check. Model visibility is not inference readiness.
- Metricool account is connected, but the two 2026-09-14 scheduled items report the account limit reached. Imported statuses are explicitly timestamped observations, not continuous synchronization.
- Gmail connector access does not configure runtime inbound email. Follow-up messages must stay disabled until the mailbox-to-backend chain is tested.
- No end-to-end Google Calendar sync, WhatsApp Business conversation integration or live PSTN call has been demonstrated.
- Existing Render Free services may sleep: the in-process scheduler is not a guaranteed 24/7 worker. No paid plan was enabled.
- Browser access to the live domains was refused by the web tool. No access workaround was attempted; visual/mobile browser checks and real mailbox delivery remain unverified.
- Privacy/security controls are implemented but this is not a legal certification of GDPR compliance.
