# JARVIS v1.4.1 — MUSE Dagcentrum

Dit is **een Muse-geïnspireerde werkwijze** in de bestaande JARVIS-app.
Het is geen officieel Meta Muse-model en er is geen Meta Muse API verbonden.

## Wat al gebouwd en getest is

- Eén dagcentrum in de bestaande **AI-agent**-weergave, zonder nieuwe website of nieuwe database.
- Reception AI Production + apart LuxWash CRM Production via twee onafhankelijke Supabase-sessies.
- Alleen-lezen dagbriefing met komende, bevestigde afspraken binnen 72 uur,
  vervallen CRM-opvolgdata, fout/blocked-taken en JARVIS-goedkeuringen.
- Persoonlijke lokale taken op het toestel worden als aparte bron geteld en blijven **op dat toestel**.
- Eigen LuxWash/testrecords en uitschrijvingen worden uitgesloten van voorstellen.
- Elk prioriteitsvoorstel heeft een duidelijke bron, reden en concrete controle-stappen.
- In-app bevestiging voor een voor te bereiden plan; nieuw item heeft status
  `pending_approval` en wordt opnieuw uit Reception AI gelezen ter verificatie.
- Dubbel voorstelde actieve taken per CRM-record worden gedetecteerd.
- Alleen na expliciete klik: AI-prioritering met geaggregeerde cijfers / maximaal vijf actiebenamingen.
- Voorlezen via bestaande Android-spraakbrug of browserspraak, indien beschikbaar.
- Stembevel **“Hey JARVIS, Muse”** opent de briefing vanuit de bestaande app
  wanneer spraakherkenning de woorden betrouwbaar doorgeeft.

## Wat nog NIET werkt

- Geen Meta Muse-eigen model, geen autonome e-mails/WhatsApp, geen betalingen,
  geen onbeperkte computerbediening en geen realtime achtergrondbewaking.
- Geen automatische Gmail- of WhatsApp-inbox vanuit JARVIS Web;
  het CRM toont geregistreerde kopieën die achter kunnen lopen.
- Geen nieuwe pushmeldingen, en bestaande Android productie-APK blijft ongewijzigd.
- Browser-E2E met jouw echte Reception/CRM-logins is nog niet uitgevoerd.
- Belangrijk: zolang het genoemde preview-deploygeheim ontbreekt, draait
  de preview-URL **nog de oude versie**. Een geslaagde CI-run is geen live-deploy.

## Testen

```bash
node --check jarvis-personal/live/worker.js
node jarvis-personal/live/test.mjs
node jarvis-personal/live/agent.test.mjs
node jarvis-personal/live/muse.test.mjs
```

Dit zijn offline tests met synthetische fixturedata; ze mogen nooit
als echte klantberichten of werkelijk uitgevoerde acties worden geïnterpreteerd.

## Preview-deployment (alleen met expliciet ingestelde projecttoegang)

- Bestaande preview Worker: `jarvis-gertjan-personal-agent-preview`
- In GitHub `chillerken/Hub`, open **Settings → Secrets and variables → Actions**.
- Voer de door de eigenaar **zelf aangemaakte Cloudflare API Token** in als
  repository secret met de exacte naam **`CLOUDFLARE_API_TOKEN`**.
- Maak bij Cloudflare een beperkt token voor **Workers Scripts: Edit**
  in de eigen Cloudflare-account; deel het token **nooit in chat**.
- De deploymentworkflow `.github/workflows/jarvis-muse-preview-deploy.yml`
  is gelimiteerd tot de featurebranch en de hierboven genoemde preview Worker.
  Ze test eerst alle JARVIS-scripts, controleert of het secret beschikbaar is,
  en stopt expliciet met een fout als het secret ontbreekt (geen schijnbaar geslaagde publicatie).
- Na het instellen van het secret moet de geautoriseerde workflow opnieuw
  worden gestart (GitHub Actions → Deploy JARVIS Muse Preview → Run workflow),
  of moet een nieuwe commit op de featurebranch worden gedaan.
- Controle na deployment: `/api/health` moet `"version":"1.4.1-muse"`
  én `"aiConfigured":true` tonen. De homepage moet `✦ MUSE Dagcentrum` tonen.
- Publiceer niet naar productie, main of `jarvis-gertjan-personal` voordat beide
  accounts via de preview in een echte browser zijn getest.

## Na publicatie op je telefoon

1. Open de bestaande **JARVIS-preview-URL**; herlaad zodat de nieuwe service worker actief wordt.
2. Open **LuxWash** en meld je apart aan bij Reception AI en LuxWash CRM.
3. Ga naar **AI-agent → MUSE Dagcentrum** en kies **Maak mijn dagbriefing**.
4. Controleer of de broncijfers en prioriteiten kloppen.
5. Klik op **Zet deze controle klaar** bij één concreet voorstel;
   bevestig in de app. Pas na databaseverificatie geeft JARVIS succes aan.
6. Keur de aangemaakte taak afzonderlijk goed onder **JARVIS Agent · opdrachten**.

De officiële bron voor LuxWash-prijzen blijft `https://www.luxwash.online/prijzen`.
