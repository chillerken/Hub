# Reception AI production runbook

Last reviewed: 2026-10-07

## Production topology

- Source: `chillerken/Hub` → `main`
- Primary static deployment candidate: `https://ai.luxwash.online/`
- Render fallback: `https://reception-ai-luxwash.onrender.com/`
- Proven auth callback origin: `https://reception-ai-luxwash.vercel.app/`
- Backend/Auth/DB/Edge Functions: Supabase project `ndecxbsrxspkuxjsbndq`

Do not treat a DNS record as proof that the custom domain is production-ready. The hostname is ready only when TLS, HTTP, the auth entry point and critical assets pass the independent production gate.

## Cutover gate

All conditions must be true before making `ai.luxwash.online` the central app/auth/billing URL:

1. Public DNS for `ai.luxwash.online` resolves to `reception-ai-luxwash.onrender.com`.
2. HTTPS handshake succeeds without certificate or cipher errors.
3. `/`, `/robots.txt`, `/sitemap.xml` and `/social-card.svg` return successful responses.
4. `/?auth=1` renders the login/signup shell.
5. GitHub Actions workflow **Reception AI Production Gate** is green.
6. Supabase Auth URL Configuration explicitly allows the exact production redirect URLs needed for signup confirmation and password reset.
7. Only after 1–6: change central application URLs and campaign landing URLs to `https://ai.luxwash.online/`.

## Current safety rule

Until Supabase Auth explicitly allows the custom domain, confirmation and password-reset email callbacks stay on the previously proven Vercel production origin. This prevents a domain cutover from breaking account creation or recovery.

## Verification

Workflow: `.github/workflows/reception-ai-production-gate.yml`

Test: `tests/reception-ai-production.spec.ts`

It runs:
- on relevant pushes;
- manually;
- every six hours.

The gate verifies the branded custom hostname, HTTPS, auth shell, public assets, Render fallback, canonical URL and crawler-visible static content.

## Failure scenarios

### Custom domain DNS resolves, TLS fails

Do not change Wix DNS again when the CNAME is already correct. Check Render → Reception AI static site → Settings → Custom Domains. The hostname must be added and show a verified certificate. Re-run verification after certificate issuance.

### Render custom hostname fails but Render fallback works

Keep acquisition links on the Render fallback or proven Vercel URL. Do not promote the custom hostname until the production gate is green.

### Render service outage

Use the proven Vercel URL as the direct emergency landing/auth endpoint while Render is investigated. Do not repoint DNS to Vercel unless the custom hostname has first been configured and verified on the Vercel project.

### Supabase outage or Edge Function failure

Do not claim the product is operational based on the landing page alone. Verify public chat/config endpoints and authenticated health functions independently.

### Sales automation failure

External outreach remains human-controlled. Failed/blocked workflow actions must stay visible instead of being silently marked successful.

## Security notes

- Public browser code may contain publishable identifiers; service-role keys and private provider secrets must never be committed.
- The production repository is currently public, so treat every committed file as internet-readable.
- Supabase leaked-password protection should be enabled in Auth settings.
- The `pg_net` extension is non-relocatable in the current project; do not attempt a blind schema move merely to silence the linter.
- Tables intentionally accessible only through service-role code can legitimately have RLS enabled with no user-facing policy.

## Definition of production-ready

Reception AI is **production-ready at the custom domain** only when the independent production gate is green and auth redirect configuration has been verified. A successful Render deploy by itself is not sufficient.
