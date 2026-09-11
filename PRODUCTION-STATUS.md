# Production status

Deze versie bevat geen demo- of simulatiepaden.

## Productie-eisen
- PostgreSQL via `DATABASE_URL`
- sterke `ADMIN_PASSWORD`, `COOKIE_SECRET`, `CRON_SECRET`
- OpenAI API-key voor de AI-assistent
- Resend API-key + geverifieerde afzender voor transactionele e-mail
- optioneel Meta WhatsApp Cloud API voor WhatsApp

## Gedrag bij ontbrekende provider
De app simuleert niets. Ontbrekende of falende providers worden als `unconfigured` of `error` gelogd en automatiseringen blijven retrybaar.

## Render
`render.yaml` koppelt `DATABASE_URL` veilig via `fromDatabase.connectionString` aan `ai-business-automation-db`.
