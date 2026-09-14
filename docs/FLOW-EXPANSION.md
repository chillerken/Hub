# LuxWash flow expansion — 2026-09-14

## Current release — 2026-09-14 18:23 UTC
The existing Render business app is LIVE at https://ai-business-automation-production-gj.onrender.com/cockpit with product revision 45af402373028ed161ceb2301792a9be277eb7b7 (deployment dep-dak3mouq1p3s73cgi8u0). Online booking is available at /boeken. This is separate from the unchanged www.luxwash.online Sites publication.

Render rebuilt successfully and passed all 35 Node tests. The worker completed recorded cycles against the real Supabase database. The previous publication follow-up task was completed after verification. The reason Git-triggered publication did not start was not established; no extra service or paid upgrade was created.

[Browser QA run 34880240357](https://github.com/chillerken/Hub/actions/runs/34880240357) passed 54 checks across 360px, 390px and 1280px. It exercises local HTTP authorization, lead capture with retained area/material and marketing opt-in off, explicit quote acceptance, dashboard navigation and draft-only social saving. Social layout was also tested at 200% text size. Browser fixtures are isolated; requests to external origins are blocked. This is not end-to-end testing of real provider delivery or the separate Sites website.

Fixed dark-mode label and price contrast, small essential status labels, and mobile dashboard heading overflow. Form label contrast changed from approximately 1.93:1 to 12.32:1 on the tested surface. This does not certify complete WCAG or GDPR compliance.

OpenAI still reports insufficient_quota at 18:23 UTC. Metricool's last observed account limit remains unresolved. Inbound email, Google Calendar sync, WhatsApp and guaranteed 24/7 scheduling are not accepted as connected. Sites instructions can now be partially read, but required references and the source-editing execution environment are not available; the existing Sites website remains unchanged.

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
- Sites www.luxwash.online remains on version 26: the complete Sites source-editing workflow is unavailable in this session. These changes target the existing central backend at https://ai-business-automation-production-gj.onrender.com/cockpit, not the separate Sites /controle page.
- OpenAI inference reports insufficient_quota in the latest available provider check. Model visibility is not inference readiness.
- Metricool account is connected, but the two 2026-09-14 scheduled items report the account limit reached. Imported statuses are explicitly timestamped observations, not continuous synchronization.
- Gmail connector access does not configure runtime inbound email. Follow-up messages must stay disabled until the mailbox-to-backend chain is tested.
- No end-to-end Google Calendar sync, WhatsApp Business conversation integration or live PSTN call has been demonstrated.
- Existing Render Free services may sleep: the in-process scheduler is not a guaranteed 24/7 worker. No paid plan was enabled.
- Browser access to the live domains was refused by the web tool. No access workaround was attempted; visual/mobile browser checks and real mailbox delivery remain unverified.
- Privacy/security controls are implemented but this is not a legal certification of GDPR compliance.

## Publication check
The database migration is applied (version 20260914175552) and the post-migration rollback suite passed. Backend source is committed. The initial check found Render still on e19c99f despite autoDeploy=yes. This was subsequently recovered; see the current release section above. GitHub CI independently builds React and runs isolated Node/HTTP tests; no production credentials or real provider sends are used.

The security advisor notes intentional RLS-without-public-policies on server-only tables and the existing shared-secret RPC entry points. Those entry points still require a valid application secret. A mutable search_path warning belongs to the separately added LuxAI app_set_updated_at function; this expansion preserves that unrelated work. See [Supabase security-definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [search_path guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable). No GDPR certification is claimed.

## Verified test result
GitHub Actions run [34878357851](https://github.com/chillerken/Hub/actions/runs/34878357851) completed successfully for code revision 600f30c5c1d4d1ddd50d40afcd42c23ad381f035: React bundle built, 35 Node/HTTP tests passed, 0 failed, backend syntax passed. npm reported 0 vulnerabilities at this check (not a security certification). The original database regression suite also passed again after applying the migration.

Existing open OpenAI tasks were preserved without duplicates. Actual Metricool quota and pending Render publication were recorded as owner follow-up tasks in the current CRM; the publication task was subsequently completed after the successful release. No actual customer message, booking, review or social post was created by the tests. The two imported social rows are genuine external failure observations.

## 2026-09-14: native browser admin login repaired

The user's native HTML login form was reproducibly rejected with HTTP 403 and
"Ongeldige oorsprong". The page's `Referrer-Policy: no-referrer` caused Chromium
to send `Origin: null` on a navigation-mode POST. This was not a password error.
See [MDN's explanation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).

Changed only the referrer policy to `same-origin`. The same-origin comparison,
password validation, rate limit, HttpOnly/SameSite session cookies and cross-site
rejection remain in place. No wildcard origins, trusted-null exception, password
change or signing-key change was introduced. Referrers are not sent to other sites.

Evidence:
- Red regression run [34882424283](https://github.com/chillerken/Hub/actions/runs/34882424283):
  native form reproduced `Origin=null`, HTTP 403 and the exact reported error.
- Green run [34882587209](https://github.com/chillerken/Hub/actions/runs/34882587209):
  36 Node/HTTP tests and 75 browser checks passed. Real HTML form submission with
  test-only credentials accepted the correct password, rejected the wrong password,
  issued the protected cookie and reached the dashboard at 360px, 390px and 1280px.
  Foreign/null/malformed origins were rejected in HTTP tests.
- Verified Render deployment `dep-dak41euq1p3s73chno80` became LIVE at `2026-09-14T18:46:07.520348Z`,
  running `4d1331b994097a88e27a4e5ad000357827bbbe86`.
- Tests were isolated; no real customer data, customer messages or production
  login credentials were used. Successful login with the user's real password
  was not directly tested. A fresh GET of `/admin/login` loads the corrected policy.

## 2026-09-14: basic chat replies independent of AI quota

The website's 21:26 Belgian-time "Hallo" was verified in the real message table,
with the fallback response and an actual follow-up task. The matching AI action
recorded `insufficient_quota`; the 21:24 provider check confirmed inference was
unavailable despite a configured key and accessible model. The Sites `/api/chat`
request returned HTTP 200: HTTP success did not mean successful AI generation.

Added `src/core/basic-replies.js` and integrated it into the existing chat route:
- Narrow greetings/thanks, public contact/work area, and recognized service/price
  questions use current settings/catalog records, with no model request.
- An area such as 35 m² is read from the user's message, and service context can
  carry over from preceding inbound messages. Any arithmetic is explicitly an
  indicative catalog calculation, not a quote or booking.
- Both inbound and outbound messages still use the existing database flow.
  A storage failure cannot produce a successful "saved" reply.
- Basic replies return `mode: basic` and `handoff: false`, without reporting AI as
  live or creating a high-priority incident for a greeting.
- Booking/change/cancellation, complaints, private contact intake, unknown services,
  safety questions and other unsupported questions continue through the existing
  guarded AI tools or explicit human handoff. They are not implemented by keyword
  rules. Existing handoff/database errors still fail closed.
- No new API keys, billing changes, provider subscriptions or customer messages
  were issued as part of validation. The full AI remains blocked by its API quota.

Validation: [CI run 34888271444](https://github.com/chillerken/Hub/actions/runs/34888271444)
passed 43 Node tests and 75 browser checks. New tests cover no-key/no-network
greetings, stored message pairs, catalog changes, context/area preservation,
unknown prices/services, no booking side effects, private/safety boundaries,
database failure and preserved AI error handoff.
The pure reply module was also exercised against a read-only snapshot of the
actual public settings/catalog. Test records were not written to production.

Render release `dep-dak4rtu1egvs7393l9jg` for `a2f98bded78260b1d818a239b55c2dbb16abbe2f` was verified
LIVE at `2026-09-14T19:42:19.57205Z`. A post-release real end-user chat was not directly
tested. The existing Sites proxy remains the frontend integration.

Open: the clipped send button belongs to the Sites frontend, not this repository.
No Sites code was changed: the local source/build executor is unavailable and the
required `sites-hosting/references/publishing.md` resource returned Unknown resource.
Do not report that mobile button or full AI generation as fixed.
