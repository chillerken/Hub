# Reception AI — read-only herstelbeoordeling van betaalde Checkout

Status: test-only, geen productie-endpoint. De module reconciliation-assessment.js voert GEEN writes uit en bevat geen Stripe- of Supabase-sleutels.

## Operatorworkflow bij een echte mislukte betaalwebhook

1. Zoek event-ID in public.stripe_events met status 'failed' en foutprefix paid_checkout_unlinked.
2. Haal het event en de Checkout Session SERVER-SIDE op via de authentieke Stripe API in het juiste Stripe-account.
3. Controleer status=complete, payment_status=paid, mode=subscription en live-/testomgeving.
4. Vergelijk metadata.app, metadata.plan en payment_link met een actieve planrij in reception_ai_plan_catalog. E-mailadres en customer-ID alleen bewijzen geen tenant-eigendom.
5. Hash de originele client_reference_id uitsluitend server-side als SHA-256; toon het ruwe token niet. Zoek de bijbehorende private.billing_checkout_refs rij op.
6. Vergelijk de originele organisatie-ID, plan, used_at, expires_at en eventuele bestaande customer/subscription-ID's. Bij conflicten nooit automatisch activeren.
7. Laat assessPaidCheckout het bewijs beoordelen. De resultaten blocked, needs_operator_reconciliation, ready_for_authorized_replay en already_active geven NOOIT toestemming om een tenant te wijzigen.
8. Leg in een beveiligd auditdossier event-ID, Stripe-bewijs, gecontroleerde organisatie, beoordelaar en beslissing vast. Event-resend, activatie, refund of klantbericht vergt aparte autorisatie.

## Alleen-lezen SQL-controle

```sql
SELECT id, event_type, status, attempts, updated_at,
       left(coalesce(last_error, ''),160) AS error_code
FROM public.stripe_events
WHERE status='failed' AND last_error LIKE 'paid_checkout_unlinked:%'
ORDER BY updated_at DESC LIMIT 100;
```

## Belangrijke grenzen

- De helper beoordeelt meegegeven data, maar authenticeert niet zelfstandig de Stripe-API of databasebron; voer hem alleen server-side met gecontroleerde bronnen uit.
- Een verlopen of ontbrekende referentie wordt NIET hersteld en geeft geen automatische activatierechten.
- Historische Stripe-event-rijen slaan geen volledige Checkout-payload op. Na cleanup van referenties kan aanvullend bewijs noodzakelijk zijn.
- Bestaande webhook blijft de geautoriseerde verwerker van ondertekende Stripe-events en bijbehorende idempotente controles.
- Een toekomstige write-endpoint moet operatorauthenticatie, directe Stripe-bewijsverificatie, tenantautorisatie, auditlog en atomische verwerking onafhankelijk afdwingen.
- Geen productiecredentials, live betalingen, klantberichten of boekingen gebruikt in deze tests.

## Actuele alleen-lezen bevindingen op 2026-10-11

De gekoppelde Stripe-account Luxdesign heeft 7 Checkout-sessies: één afgeronde betaalproef en zes verlopen, onbetaalde sessies. Supabase registreert 8 verwerkte en 0 mislukte Stripe-events. Er is dus geen bewezen bestaand herstelincident.
Een echte Stripe-testcheckout in een geïsoleerde testomgeving blijft een afzonderlijk open acceptatiecriterium.