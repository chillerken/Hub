# Reception AI — betaalde Checkout zonder activatie

Status: voorbereid herstelproces. PR #32 is niet in productie.

## Incident

Een ondertekend event met een betaalde Checkout zonder geautoriseerde tenant mag niet als succesvol verwerkt worden gerapporteerd. De voorgestelde handler registreert het event in public.stripe_events als status 'failed' met een marker die begint met 'paid_checkout_unlinked:' en geeft HTTP 503 terug. Daarmee kan Stripe automatisch opnieuw proberen. Er wordt nooit op basis van uitsluitend een e-mailadres aan een tenant gekoppeld.

Stripe documentatie: https://docs.stripe.com/webhooks#automatic-retries
Stripe probeert live webhookleveringen opnieuw gedurende maximaal drie dagen. De huidige verwerking kan een verlopen checkoutreferentie NIET uit zichzelf herstellen.

## Beveiligde, read-only operatorquery

```sql
select
  id as stripe_event_id,
  event_type,
  status,
  attempts,
  updated_at,
  left(coalesce(last_error, ''), 160) as error_code
from public.stripe_events
where status = 'failed'
  and last_error like 'paid_checkout_unlinked:%'
order by updated_at desc
limit 100;
```

## Beslissingscontrole

1. Zoek de event-ID op in Stripe Workbench. Verifieer betaling, product, bedrag, abonnement, klant, status en authenticiteit.
2. Koppel uitsluitend aan de juiste organisatie op basis van eerder geautoriseerde en controleerbare gegevens. Controleer dat geen andere organisatie of abonnement geraakt wordt.
3. Een betaling met verlopen of ontbrekende checkoutreferentie blijft geblokkeerd totdat een afzonderlijk, veilig en geautoriseerd herstelpad is geïmplementeerd.
4. Vraag afzonderlijke goedkeuring voor manuele webhook Resend, tenantactivatie, wijziging van gegevens, klantbericht, terugbetaling of nieuwe betaling.
5. Leg beslissing, operator, Stripe-event-ID, tenant en onderliggend bewijs vast in een beveiligde auditlog. Nooit webhookgeheimen of ruwe referentietokens opnemen in 'last_error'.

## Acceptatiecriteria

- Betaald maar ongekoppeld event: 503 en 'failed' met herkenbare code.
- Dezelfde event-ID wordt bij retry niet stilzwijgend gededupliceerd als succesvol.
- Onbetaald en niet gekoppeld: geen betaling of activatie verzinnen.
- Na een correct geautoriseerde koppeling kan dezelfde event-ID opnieuw worden verwerkt; andere tenants blijven ongemoeid.
- Elke niet-automatisch herstelbare zaak blijft traceerbaar voor menselijke opvolging.
- De tests gebruiken synthetische, ondertekende Stripe-events en een in-memory database. Geen echte Stripe-testcheckout of productie-activatie bewezen.

## Nog te bouwen

Een expliciet operator-reviewed, server-side geverifieerd reconciliatieproces voor verlopen Checkout-referenties en een terugkerende check op mislukte events. Deze PR zelf voert geen manuele reconciliatie uit, maakt geen nieuwe database-tabellen en deployt niets.
