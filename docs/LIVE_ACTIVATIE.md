# LuxWash — live activatie

Status: 12 september 2026. De software is gepubliceerd; de volledige telefonische acceptatietest is nog niet geslaagd.

## Openen

- Beheer: https://ai-business-automation-production-gj.onrender.com/cockpit — bestaande beheerderslogin.
- Website versie 26: https://luxwash-online.redant-gj.chatgpt.site
- Telefoniedienst: https://dashboard.render.com/web/srv-dah5iae1egvs73cmkqt0
- Centrale backend: https://dashboard.render.com/web/srv-dai8bqek1f9s73col51g
- Database: bestaand Supabase-project `nahwlhptgdkwhjcfkhkt`, Frankfurt.

## Concreet ontbrekende eigenaarshandelingen

| Onderdeel | Vastgesteld | Nodig |
|---|---|---|
| Lina / OpenAI | CRM-brug werkt. OpenAI geeft HTTP 401, `invalid_api_key`, voor Lina's afzonderlijke sleutel. | Vervang `OPENAI_API_KEY` in de Environment-instellingen van de Lina-dienst door een geldige sleutel van het OpenAI-project waarop het telefoonnummer/SIP en de webhook zijn aangesloten. Deel de sleutel niet in de chat. |
| Planning | Er zijn bewust geen werkuren of toegelaten postcodes ingesteld. | Werkdagen met begin- en einduur, toegelaten postcodes, en controle van duur/buffer per dienst. In te voeren via Instellingen. |
| Telefoonroutering | Bestaande nummers: Rinkel 053 896 400 en Zadarma +32 2 886 21 34. De fysieke routering is niet getest. | Controleer de doorverbinding naar het juiste OpenAI-SIP-project. De webhook voor oproepen blijft `/openai/realtime-webhook` op de Lina-dienst. Daarna één echte testoproep. |
| E-mail ontvangen | Resend-sleutel heeft alleen verzendrechten. `RESEND_WEBHOOK_SECRET` ontbreekt. | Een sleutel met de vereiste ontvangstrechten, een ondertekende Resend-webhook naar `/api/webhooks/resend` op de centrale backend, en mailbox-/domeinroutering. Wijzig de bestaande mailbox niet zonder de gewenste ontvangst/doorsturing vast te leggen. |
| E-mail verzenden | Verzendgegevens zijn ingesteld. De domeinlijst is niet toegankelijk met de beperkte sleutel; dat is op zichzelf geen verzendfout. | Tijdens de echte boeking aantonen dat de bevestiging in de bedoelde mailbox aankomt. Dit is nog niet geverifieerd. |
| Permanente werking | Beide Render-diensten staan op Free en kunnen slapen. | Budgetkeuze en omschakeling van beide diensten naar een niet-slapend computeplan vóór 24/7-gebruik. Dit is nog niet betaald of gewijzigd. |

OpenAI voor de website heeft een geslaagde modeltoegangscontrole: HTTP 200 voor `gpt-5.6-luna`. Geen nieuwe websitesleutel nodig.

## Gebouwd

Centrale CRM-tabellen, beveiligde beheeromgeving, echte formulieren, databaseprijzen voor 24 diensten, transactionele beschikbaarheid en boeking, wijzigingen/annuleringen met een persoonlijke beheerlink, wachtrijen met retries, herinneringen, opvolging, reviewuitnodigingen, herhaaluitnodigingen met toestemming, klantprofielen, inboxclassificatie, AI-conceptoffertes met databaseprijzen, betalingenregistratie en statistieken.

Lina en websitechat gebruiken dezelfde backend-tools. Inkomende SIP-webhooks zijn ondertekend, toolherhalingen worden bijgehouden en transcripties en terugbelacties worden in Supabase opgeslagen. Geen audio-opnames. Database-opschoning draait elk kwartier via pg_cron; de echte run van 10:30 UTC slaagde.

## Bewijs en grenzen

- 19 backendtests, 7 telefonietests en 56 websitetests geslaagd; 3 Androidcontroles overgeslagen omdat die app hier niet aanwezig is.
- PostgreSQL-controles voor boeken, conflictbeveiliging, wijzigen, annuleren, toestemming/beheercode, jobs, offerteprijzen, context, privacy-opschoning en databasepermissies geslaagd.
- Testgegevens zijn verwijderd. De SQL-suite bevat expliciet BEGIN/ROLLBACK. De laatste controle vond nul testklanten, nul testafspraken en een lege verzendwachtrij.
- Live browsercontrole van de Render-backend werd door het browser-URL-beleid geblokkeerd. Opstart- en API-configuratie zijn via productielogs gecontroleerd.
- Geen echte PSTN-oproep, ontvangen klantbevestiging of volledig afgeronde live boeking aangetoond. Zet de telefonische module dus nog niet op gereed.
- Gebruikersbeheer met een volledige rolgebonden interface, optionele Google Calendar/WhatsApp/SMS-koppelingen, factuur-PDF's en automatische detectie van geplaatste Google-reviews zijn nog niet volledig geïmplementeerd. De bestaande owner-login blijft werken; Supabase Auth vereist een expliciet actief owner/admin-lidmaatschap.
- De openbare RPC-gateway blijft beveiligd met het bestaande servergeheim. De Supabase-advisor blijft de bewust toegankelijke SECURITY DEFINER-gateway signaleren. Dit is geen externe security- of GDPR-certificering; verwerkersafspraken, back-up/herstelbeleid en financiële bewaartermijnen moeten nog worden gecontroleerd.

## Laatste acceptatie

Na de bovenstaande instellingen: bel het bestaande nummer, vraag een reiniging, laat Lina echte beschikbaarheid ophalen en een gekozen afspraak opslaan. Controleer daarna klant, agenda, transcript, opvolgtaak en ontvangen bevestigingsmail. Alleen bij een geslaagde controle is de telefonische boekingsflow geaccepteerd.
