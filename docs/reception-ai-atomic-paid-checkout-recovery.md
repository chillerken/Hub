# Reception AI — atomisch herstel van betaalde, verlopen Checkout (releaseplan)

## Status: NIET GEDEPLOYD / NIET GOEDGEKEURD VOOR PRODUCTIE
Deze PR bevat voorlopig uitsluitend een **database-commitmechanisme** voor een later afzonderlijk geautoriseerd herstel. Een Stripe-betaling, klantactivatie en webhook-resend worden door deze PR NIET uitgevoerd.

## Waarom dit nodig is
De normale webhook weigert verlopen betaalreferenties. De betaalde sessie kan daardoor als `failed` geregistreerd blijven, ondanks geslaagde Stripe-betaling. De nieuwe `commit_paid_checkout_recovery`-functie accepteert een **verlopen maar nog opgeslagen en ongebruikte** oorspronkelijke checkoutreferentie onder strikte voorwaarden.

**Beperking:** `create_billing_checkout_ref` ruimt referenties op zodra zij meer dan 24 uur verlopen zijn. Als de originele referentie verwijderd is, kan dit herstelpad geen betrouwbare organisatie meer bewijzen. Dan is onafhankelijk, gedocumenteerd klant-/eigenaarsbewijs nodig; nooit automatisch op e-mailadres matchen.

## Veilige toepassing
1. Een toekomstige authentieke server-side operatoractie moet de oorspronkelijke Stripe Event en Checkout Session vers bij Stripe ophalen en onafhankelijk bevestigen dat de Checkout volledig **paid** is, bij het juiste live-/testaccount en de actieve commerciële betaallink/plan hoort.
2. Controleer dat het **huidige** Stripe Subscription-object bij dezelfde klant hoort en nog `active` (of, volgens vastgesteld betaalbeleid, een uitdrukkelijk goedgekeurde andere status) is. Deze PR staat herstel alleen naar `active` toe.
3. De originele `client_reference_id` mag uitsluitend server-side worden gehasht; het ruwe token mag niet via browser of logs circuleren. Zoek de oorspronkelijke niet-gebruikte en traceerbare referentie op.
4. Authenticeer de operator via Supabase Auth; controleer een actieve owner/admin-rol bij een **interne** platformorganisatie. Eis expliciete actiebevestiging én apart getypte of gecontroleerde verwachte klantorganisatie.
5. Roep dan, **en alleen dan**, de server-only databasefunctie aan. Deze vergrendelt eerst referentie, dan organisatie, dan Stripe-event, controleert de Stripe-klant- en abonnementbinding en wijzigt alles in één PostgreSQL-transactie.
6. Bij succes: gebruiksmarkering op referentie, actieve tenant, `stripe_events.status='processed'` en één uniek auditrecord met actor en Stripe-event. Bij een fout rolt PostgreSQL **alles** terug.
7. Een ander abonnement, andere klantorganisatie, onbekend event, ongeldige status of onbetrouwbare referentie wordt geweigerd. Een identieke herhaling van een eerder geslaagd herstel wordt herkend.

## Belangrijke beveiligingsgrenzen
- SQL zelf kan een live Stripe-betaling niet onafhankelijk controleren. Het toekomstige operator-API **moet** dit dus opnieuw uitvoeren vóór de transactie. Dit blijft een vertrouwensgrens.
- De SQL is standaard uitsluitend voor `service_role` uitvoerbaar; de migratie staat momenteel alleen in GitHub, dus NIET in de productie-DB.
- Het toevoegen van een SQL-functie is **niet** gelijk aan een geteste Stripe-testcheckout of een beveiligde, gedeployde operatorinterface.
- Stripe kan zijn abonnementsstatus wijzigen tussen Stripe-GET en PostgreSQL-commit. Aparte risicobeperking, monitoring en een procedure voor annuleringen blijven noodzakelijk.
- De operator mag geen klant koppelen op basis van een e-mailadres of alleen een Stripe-klant-ID.

## Verificatie en rollback
De test `tests/reception-atomic-recovery.pg.sql` voert de **werkelijke SQL** uit in een wegwerp-PostgreSQL 16-container. Hij test verlopen referentie, juiste organisatie, onbevoegde gebruikers, verkeerde eventtypen, geannuleerde abonnementen, idempotentie, uniek auditrecord, andere tenants en mislukte updates zonder gedeeltelijke writes.

**Voor een toekomstige productie-migratie:** maak eerst een backup van de SQL-functies, audit-/tabelgrants en relevante schema; test initieel in een afzonderlijke Supabase-omgeving. Rollback vergt het uitsluitend terugdraaien van de nieuwe RPC/auditstructuur nadat is gecontroleerd of er al echte auditrecords bestaan. Verwijder nooit echte auditbewijzen zonder afzonderlijke toestemming.

## Wat nog ontbreekt vóór commerciële eindacceptatie
- Een geteste, expliciet door een platformoperator goedgekeurde HTTP-trigger die Stripe-bewijs verifieert en deze SQL-functie veilig aanroept.
- Een echte Stripe-testcheckout in testmodus, verbonden met een geïsoleerde Supabase-testomgeving.
- Eenduidig incidentonderzoek en opvolging wanneer de originele referentie is gewist.

**Geen echte betalingen, activaties, boekingen of berichten uitgevoerd in deze ontwikkelfase.**

## Aanvulling: afzonderlijke operator-HTTP-functie in dezelfde PR

De functie `billing-reconciliation-commit` is intussen toegevoegd als **standaard uitgeschakelde broncode**. Zij hergebruikt de geteste Stripe-bewijscontrole van PR #35 en voert uitsluitend na onderstaande beveiligingspoorten de nieuwe PostgreSQL-RPC uit:

- `verify_jwt=true` bij eventuele deployment, aanvullende server-side `auth.getUser` controle en actieve owner-/adminrol van een interne platformorganisatie;
- `BILLING_RECOVERY_ENABLED=true` als afzonderlijke kill-switch, standaard afwezig/uit;
- expliciete aanvraagwaarde `I_APPROVE_PAID_CHECKOUT_RECOVERY` én een opgegeven, overeenkomende `expected_organization_id`;
- originele Stripe Event, betaalde Checkout Session, actieve commerciële Payment Link en actuele Stripe Subscription van dezelfde customer, opnieuw server-side opgehaald via Stripe GET;
- verlopen, nog aanwezige en ongebruikte oorspronkelijke referentie waarvan de SHA-256-hash en de organisatietoewijzing volledig kloppen;
- atomische SQL-commit met aparte operatorcontrole, exact incident, abonnementconflicten, audit en idempotentie.

De HTTP-functie kan bij een eventuele release alleen worden gedeployed met **alle vier bestanden**: `index.ts`, `commit-core.js`, `review-core.js` en `reconciliation-assessment.js`. De lookup-RPC uit PR #35 en de recovery-RPC uit deze PR zijn beide vereiste databaseafhankelijkheden. Geen enkele SQL-migratie of Edge Function in deze PR is in productie toegepast.

**Cruciaal:** een deploy naar productie is pas verantwoord na een geslaagde test in Stripe-testmodus met een geïsoleerde Supabase-omgeving, een verificatie van operatorrechten en afzonderlijke expliciete vrijgave van de schrijffunctie. De huidige geïsoleerde CI bewijst niet dat de echte Stripe-integratie end-to-end werkt.
