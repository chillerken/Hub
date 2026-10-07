# Google Calendar production setup

Reception AI has a tenant-safe Google Calendar OAuth implementation. Each organization authorizes its own Google account. Tenant refresh tokens are encrypted in Supabase Vault via `private.integration_credentials`.

## 1. Google Cloud project

Create or select the production Google Cloud project for Reception AI / mijn.ai Business.

Enable:

- Google Calendar API

Configure the OAuth consent screen for the production app name and support/contact details.

The runtime requests only:

`https://www.googleapis.com/auth/calendar.events`

This scope lets the app view and edit events on the calendars authorized by the user. Public production use may require Google OAuth verification.

## 2. OAuth 2.0 client

Create an OAuth 2.0 Client ID of type **Web application**.

Authorized redirect URI — it must match exactly:

`https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/google-calendar-oauth-callback`

Do not add a trailing slash unless the Edge Function URL itself changes.

## 3. Store platform credentials in Supabase Vault

Never commit the client secret to GitHub or expose it to the browser.

Create these Vault secrets:

- `reception_ai_google_client_id` → Google OAuth client ID
- `reception_ai_google_client_secret` → Google OAuth client secret
- `reception_ai_app_url` → `https://YOUR-RECEPTION-AI-DOMAIN`

The production database already has `reception_ai_app_url`; the OAuth client ID and secret still need real Google values.

## 4. Tenant connection flow

The signed-in owner/admin opens **Integraties → Google Calendar → Google Agenda koppelen**.

Flow:

1. `google-calendar-oauth-start` verifies the Supabase user and owner/admin membership.
2. A single-use SHA-256 OAuth state is stored for 10 minutes.
3. Google receives an authorization request with:
   - `access_type=offline`
   - `include_granted_scopes=true`
   - `prompt=consent`
   - Calendar events scope.
4. Google redirects to `google-calendar-oauth-callback`.
5. The callback consumes the state once, exchanges the code, requires the Calendar scope and requires a refresh token.
6. The tenant refresh/access token object is encrypted in Vault.
7. The tenant calendar integration becomes `active`.
8. Previously blocked Calendar authorization jobs are requeued automatically.

## 5. Runtime behavior

`workflow-runner`:

- refreshes expired Google access tokens using the tenant refresh token;
- creates events in the tenant's configured calendar (default `primary`);
- uses the appointment UUID without dashes as deterministic Google event ID;
- updates the same event when an appointment is rescheduled;
- deletes the event when the appointment is cancelled;
- never adds the lead as an attendee automatically, so Calendar itself does not send unsolicited invitation emails;
- marks the integration `error` if Google authorization is revoked and requires OAuth reconnection.

## 6. Verification checklist

Before public launch:

- [ ] Calendar API enabled
- [ ] OAuth consent screen configured
- [ ] Production domain / privacy policy / terms are available
- [ ] OAuth web client created
- [ ] Redirect URI matches exactly
- [ ] Client ID stored in Vault
- [ ] Client secret stored in Vault
- [ ] Test tenant completes OAuth
- [ ] Create appointment → one Calendar event
- [ ] Retry → no duplicate event
- [ ] Reschedule → same event updated
- [ ] Cancel → same event deleted
- [ ] Revoke Google access → integration becomes error
- [ ] Reconnect → blocked authorization job resumes
- [ ] Submit OAuth verification if Google requires it for public use
