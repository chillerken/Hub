# LuxWash — actuele activatie

Gecontroleerd op 12 september 2026. De volledige telefonische acceptatietest is nog niet geslaagd. Een deployment met status live bewijst alleen dat de nieuwe serverversie is gestart.

## Openen

- [Beheer](https://ai-business-automation-production-gj.onrender.com/cockpit)
- [Centrale Render-service](https://dashboard.render.com/web/srv-dai8bqek1f9s73col51g)
- [Lina op Render](https://dashboard.render.com/web/srv-dah5iae1egvs73cmkqt0)
- [Gepubliceerde website, versie 26](https://luxwash-online.redant-gj.chatgpt.site)
- Bestaand Supabase-project: nahwlhptgdkwhjcfkhkt, Frankfurt. De domeinroutering van www.luxwash.online is niet gewijzigd.

## Gerepareerd

- De 24/7-instelling en alle Belgische postcodes worden correct herkend. Grenzen blijven 12 uur vooraf, 90 dagen vooruit en maximaal vier afspraken per dag. Duur, verplaatsingsbuffer, blokkades en dubbele boekingen blijven gecontroleerd.
- Goedgekeurde offertes kunnen via Offertes → Afspraak plannen worden geboekt met een afgesproken duur, adres en expliciet klantakkoord. De database bepaalt de definitieve offerteprijs en slaat afspraak, boeking en bevestigings-/herinneringstaken in één transactie op.
- Goedgekeurde offertes zijn vergrendeld tegen prijswijzigingen. Eén offerte kan één afspraak opleveren; een herhaald verzoek heropent nooit een geannuleerde afspraak.
- Verplaatsen van maatwerk gebruikt de duur van de bestaande afspraak. Alle invoer gebruikt Europe/Brussels, ook op een toestel in een andere tijdzone. Onduidelijke of niet-bestaande uren bij de zomer-/wintertijdwissel worden geweigerd.
- Offerteaanvragen bewaren adres, postcode, voorkeursdatum, object, oppervlakte en materiaal. Een herhaalde verzending verandert de oorspronkelijke aanvraag niet.
- Een AI-storing laat het oorspronkelijke chatbericht staan en maakt een echte opvolgtaak. Diagnostiek bewaart vaste foutcodes, geen sleutels of onbewerkte providerfouten. Tegoed- en sleutelfouten worden niet zinloos automatisch herhaald.
- Lina accepteert een actief gesprek niet opnieuw na een vertraagde webhook. Een fout bij het afsluiten van de webhookregistratie markeert een al aangenomen gesprek niet als geweigerd. Ontbrekende transcript-ID's veroorzaken geen crash.
- De persoonlijke managementlink wordt vóór e-mailverzending veilig voorbereid; een bestaande beheercode wordt nooit stil vervangen.

## Bewijs

- 26 Node-tests en 14 Python-telefonietests geslaagd. Eerder slaagden 56 websitetests; drie Androidcontroles waren overgeslagen omdat de app niet beschikbaar was.
- Nieuwe tests op echte PostgreSQL: offerteprijs, klantakkoord, duur en buffer, overlap, idempotentie, verplaatsen, annuleren, bevestigings-/herinneringstaken, private rechten en behoud van aanvraagdetails. Elke suite voert expliciet BEGIN en ROLLBACK uit.
- Nieuwe migraties: 20260912131349_luxwash_quote_booking_and_planning en 20260912132008_luxwash_preserve_request_details.
- Centrale AI: modeltoegang HTTP 200; daadwerkelijke antwoordgeneratie op 13:15 UTC HTTP 429. De actuele controle staat in Render onder LuxWash provider checks en in het beheer bij Lina & koppelingen.
- De bestaande security-advisormeldingen over twee met servergeheim beveiligde RPC-gateways en gesloten legacy-tabellen blijven zichtbaar. Nieuwe private functies zijn niet uitvoerbaar voor anon of authenticated. Er is geen externe security- of privacycertificering uitgevoerd.
- De browsercontrole van de Render-backend werd door het browser-URL-beleid geblokkeerd. Gecontroleerd via lokale applicatietests, echte databasecontroles, deployments en serverlogs; geen volledige live browseracceptatie geclaimd.

## Bestaande terrasaanvraag

De opgegeven aanvraag voor 14 september 2026, 09:00–10:30 Belgische tijd, 20 m² betonnen tegels met groene aanslag, is opgeslagen. De conceptprijs was €90 (20 × €4,50/m²), nog niet goedgekeurd.

De afspraak staat inmiddels als geannuleerd in de database. Deze status is behouden. Er is geen vervangende afspraak geboekt en de offerte is niet goedgekeurd. Afspraak-ID: 9e84438d-35f3-465e-b570-f6720cbdffbe.

Een eerdere ontvangstbevestiging is door Resend geaccepteerd: provider-ID 5d0a4d9c-837c-4219-bbf0-e895c7689ef7. Dat bewijst nog geen ontvangst in de mailbox. Het betrof een aanvraagbericht, geen bevestiging van een definitieve afspraak.

## Noodzakelijke eigenaarshandelingen

| Onderdeel | Blokkade | Concrete handeling |
|---|---|---|
| OpenAI | Antwoordgeneratie geeft HTTP 429; modeltoegang werkt. | Controleer het project achter de serverkey bij OpenAI Billing en Limits. Tegoed toevoegen of budget verhogen alleen met akkoord. Geen sleutels in chat plaatsen. |
| Permanente werking | Beide bestaande Render-services staan op Free. Lina stopte eerder na 15 minuten zonder verkeer. | Keur een budget en niet-slapend computeplan voor beide services goed. De huidige toestemming is €0/maand; er is niets betaald of opgewaardeerd. |
| Telefoon | Rinkel 053 896 400 en Zadarma +32 2 886 21 34 bestaan; doorschakeling naar het juiste OpenAI-project is niet gecontroleerd. Geen echte oproepen in CRM. | Toegang tot actuele routering en het juiste OpenAI-project is nodig. Controleer SIP-doel en ondertekende webhook op https://luxwash-lina-phone-agent.onrender.com/openai/realtime-webhook. Daarna een echte oproep en boeking testen. Een oude project-ID is niet als actueel aangenomen. |
| Beheerwachtwoord | Connector kan bestaand servergeheim niet uitlezen. | Open de centrale Render-service → Environment → ADMIN_PASSWORD. Bewaar of vervang daar een sterk wachtwoord van minstens 12 tekens, sla de omgeving op en log in bij Beheer. Deel het wachtwoord niet in chat. |
| Inkomende e-mail | Resend-key heeft alleen verzendrechten; RESEND_WEBHOOK_SECRET ontbreekt. | Ontvangstrechten en ondertekende webhook naar /api/webhooks/resend instellen, met afgesproken mailboxroutering. De bestaande mailboxroutering is behouden. |

De Rinkel-browserlogin gaf na verificatie opnieuw een loginpagina. Er is geen bevestigde sessie of gewijzigde doorschakeling; dezelfde mislukte login is niet opnieuw herhaald.

## Grenzen en laatste acceptatie

Volledige gebruikersprovisioning, Google Calendar, WhatsApp/SMS, factuur-PDF's, automatische herkenning van geplaatste Google-reviews en de volledige oorspronkelijke functielijst zijn nog niet allemaal afgerond. De planning gebruikt een ingestelde verplaatsingsbuffer, geen routeberekening op basis van verkeersgegevens. Operationele back-up/herstelproeven en privacyafspraken zijn nog niet afgerond.

Na activatie: bel het bestaande nummer, laat Lina echte diensten/prijzen en beschikbaarheid opvragen, geef akkoord op een moment en controleer de geslaagde boeking, klant, agenda, transcript, opvolging en daadwerkelijk ontvangen e-mail. Tot die test slaagt, blijft telefonie ongeaccepteerd voor productie.

Bronnen: [Render Free: slapen na 15 minuten](https://render.com/docs/free), [OpenAI SIP-telefonie](https://developers.openai.com/api/docs/guides/voice-sip).
