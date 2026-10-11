# Reception AI — gecontroleerde Stripe-incidentreview (alleen lezen)

## Wat daadwerkelijk is gebouwd

De nieuwe, **standaard uitgeschakelde** Edge Function `billing-reconciliation-review` kan na expliciete deployment en configuratie een bestaand mislukte betaalincident evalueren. Ze doet **uitsluitend GET-verzoeken bij Stripe** en SELECT/RPC-lezingen in Supabase. Ze voert nooit abonnementactivatie, refunds, nieuwe betalingen, klantberichten, boekingen of webhook-resends uit.

De endpoint verwacht een POST-body met `event_id` en `session_id`. Ze geeft uitsluitend beperkte statuscodes en een beoordeling terug; geen e-mails, Stripe-geheimen, ruwe referenties, klant-ID's, abonnements-ID's of onbeperkte Stripe-responses.

## Beveiliging

- Alleen geauthenticeerde JWT-gebruiker die actieve `owner` of `admin` is van een **intern platformaccount** (`organizations.is_internal=true`). Een betalende tenant-owner krijgt geen toegang.
- `verify_jwt=true` moet bij een eventuele deployment behouden blijven; daarnaast verifieert de functie het token opnieuw bij Supabase Auth.
- Geen open CORS. De functie is bedoeld voor een beveiligde, server-side operatorinterface.
- Extra kill-switch `BILLING_REVIEW_ENABLED=true`, standaard uitgeschakeld.
- Stripe REST via `STRIPE_SECRET_KEY` (nooit aan de browser geven). Alleen server-side Stripe GET: originele event, originele Checkout-sessie en bijbehorend abonnement.
- Session-ID en event-ID strikt gevalideerd. Stripe live/testomgeving moet passen bij de sleutel en bij beide Stripe-responses.
- Alleen al geregistreerde `stripe_events.status=failed` met `last_error` dat begint met `paid_checkout_unlinked:` komen in aanmerking.
- `reconciliation-assessment.js` vergelijkt plan, ingeschakelde catalogus-Stripe-link, cryptografische tokenhash, oorspronkelijke organisatie, vervaldatum en eventuele bestaande abonnementsconflicten.
- Een canceled, incomplete of elders gekoppeld Stripe-abonnement wordt **niet** geschikt voor herverwerking genoemd.
- Het nieuwe SQL-RPC `lookup_billing_checkout_reference_for_review` is read-only en alleen toegankelijk voor `service_role`; `anon` en `authenticated` hebben geen EXECUTE.
- Iedere beoordeling retourneert `can_auto_activate=false`, zelfs bij een geldig bewijs.

## Isolatietests

`tests/reception-billing-reconciliation-review.test.mjs` voert alle controles met synthetische data uit. `tests/reception-billing-reconciliation-review.pg.sql` draait de werkelijke SQL-migratie in een tijdelijke PostgreSQL 16-container en controleert beveiliging en geen writes.

Dit zijn **géén** live Stripe-checkouts of geverifieerde transacties.

## Belangrijke deploymentvoorwaarden (niet automatisch uitvoeren)

1. Er is een aparte, veilige Stripe-testomgeving en geïsoleerde Supabase-database nodig voor het volledige acceptance-traject.
2. De migratie `20261011060000_readonly_checkout_reference_review.sql` moet eerst expliciet beoordeeld en veilig toegepast worden. Noteer rollback/ACL.
3. Vereiste Stripe read-only API-scope: events, checkout sessions, subscriptions. Gebruik bij voorkeur een beperkt sleuteltype (`rk_test_` in staging) en configureer `STRIPE_SECRET_KEY` via Edge Function-secrets. Geen sleutels in Git.
4. Deploy pas na afzonderlijke goedkeuring, met `index.ts`, `review-core.js`, `reconciliation-assessment.js` en `verify_jwt=true`. Initieel `BILLING_REVIEW_ENABLED=false`.
5. Test met een expliciet geautoriseerde interne testoperator en controleer 401, 403, 404 en veilige response zonder PII.
6. Een aparte atomische, auditbare **write-reconciliatie** voor een definitief verlopen referentie is nog niet ontworpen voor live gebruik. Een read-only uitkomst mag hier niet rechtstreeks toe leiden.
7. Voor de commerciële eindacceptatie: een Stripe-testcheckout met gekende testprijzen, testwebhook en geïsoleerd Supabase-testtenant, bevestiging van idempotentie, bestaande abonnementen en annulering, en een getekend testverslag.

## Noodzakelijke handelingen buiten de huidige verbindingen

De gekoppelde Stripe-connector is **uitsluitend live** en er is geen Supabase-testbranch. Nieuwe financiële of gefactureerde sandboxbronnen worden niet zonder expliciete toestemming aangemaakt. Vraag een Stripe-testverbinding en akkoord voor een apart Supabase-testproject/branch voordat je de volledige betaal-acceptatietest uitvoert.

## Status

Dit is voorbereid broncodewerk op een GitHub-branch, **geen** live uitgerolde operatorfunctie. De live functies `stripe-webhook` v25, `billing-link` v7 en `public-reception-chat` v39 hoeven hiervoor niet gewijzigd te worden.
