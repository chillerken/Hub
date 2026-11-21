# Reception AI — volledige lokale ontwikkelomgeving

Deze omgeving bouwt een afzonderlijke Supabase Local-stack met een schema-only snapshot van de huidige Reception AI-productiedatabase en de huidige lokale broncode van alle 40 actieve Reception AI Edge Functions.

## Wat is opgenomen

- 40 applicatietabellen uit de schemas `public` en `private`.
- 51 PostgreSQL-functies, inclusief de twee gebruikte `jarvis_private`-hulpfuncties.
- 26 triggers, waaronder de Auth signup-provisioningtrigger.
- 44 RLS-policies en de tabelrechten die bij de productie-appschema's horen.
- De gebruikte database-extensies die Supabase Local ondersteunt.
- 40 Edge Functions met hun productieversie van de TypeScript/JavaScript-broncode en hun JWT-instellingen.
- Een lokale Auth-, REST-, Storage-, Edge Runtime- en Studio-stack.
- Synthetische demo-organisaties, CRM-leads, gesprekken, berichten en opvolgtaken.

## Wat bewust NIET wordt gekopieerd

- Geen productieklanten, gebruikers, leads, gesprekken, berichten, afspraken of betalingen.
- Geen service-role keys, API-sleutels, Stripe secrets, OAuth tokens, WhatsApp-tokens of Vault-inhoud.
- Geen productiecronjobs of automatische dispatch-schema's die externe acties zouden kunnen uitvoeren.
- Geen Omega-producttabellen of Omega Edge Functions. De Auth-trigger bevat enkel een lokale stub voor de aparte Omega-signuprouter, zodat Reception AI-signups onafhankelijk werken.
- Geen volledige historische migratiegeschiedenis. De lokale database wordt vanuit één reproduceerbare schema-only baseline opgebouwd.

De schema-baseline is een snapshot van de actuele catalogus, niet een export van productiegegevens. Ze maakt de lokale omgeving onafhankelijk van ontbrekende historische migratiebestanden.

## Vereisten

- Node.js 20 of nieuwer.
- Docker Desktop met Linux-containers; op Windows ARM64 gebruik je de WSL2-backend.
- Minstens 8 GB vrij geheugen aanbevolen voor de volledige Supabase-stack.
- Eerste start vereist internet om de Supabase CLI en Docker-images op te halen.

## Starten

Voer vanuit de repository-root uit:

```bash
npm install
npm run reception:local
```

De launcher:
1. Controleert of alle 40 Edge Function entrypoints aanwezig zijn.
2. Start Supabase CLI v3.2.0 met een eigen lokale project-ID.
3. Bouwt de volledige schema-baseline op in een nieuwe lokale database.
4. Haalt alleen localhost API-keys uit `supabase status`.
5. Schrijft `ai-receptionist-host/runtime-config.local.json`; de frontend weigert elke niet-lokale URL op localhost.
6. Start alle 40 Edge Functions met lokale JWT-instellingen.
7. Start de Reception AI-frontend.

Open:
- Reception AI: http://127.0.0.1:4173
- Supabase Studio: http://127.0.0.1:54323
- Supabase API: http://127.0.0.1:54321

## Demo-organisaties en testdata

Start eerst de lokale stack en voer daarna uit:

```bash
npm run reception:local:seed
```

De seed maakt twee fictieve bedrijven en twee fictieve gebruikers aan. Eén gebruiker krijgt ook de rol agent in het andere bedrijf. Daarnaast maakt de seed één CRM-lead, een open gesprek, een klantbericht en een opvolgtaak.

Loginaccounts en wachtwoord worden uitsluitend lokaal opgeslagen in:
`ai-receptionist-host/local-demo-accounts.json`

Dit bestand wordt door Git genegeerd. Het standaardwachtwoord is uitsluitend voor lokale demo's; wijzig het met de omgevingsvariabele `LOCAL_DEMO_PASSWORD` als je dat wenst.

## Integraties en AI

De Edge Functions zijn lokaal beschikbaar, maar productiecredentials worden nooit overgenomen.

- Gemini: voeg een afzonderlijke ontwikkelkey toe als `GEMINI_API_KEY` in `ai-receptionist-host/local-supabase/supabase/.env.local`.
- Stripe: gebruik uitsluitend Stripe testmodus en een eigen lokale test-webhooksecret.
- Google Calendar, WhatsApp, e-mail en andere Vault-gebaseerde koppelingen: configureer eigen testcredentials in de lokale omgeving. Productie-Vault secrets worden niet geëxporteerd.
- Zonder die testcredentials blijven de betrokken externe acties niet actief; de database, Auth, UI en Edge Function routes blijven lokaal testbaar.

De launcher maakt automatisch een lokaal `.env.local` aan met veilige placeholders. Je kan die lokaal aanvullen. Het bestand staat in Git ignore.

## Tests

Met de stack actief:

```bash
npm run reception:test:local
```

De tests controleren:
- Alle 40 Edge Function routes starten zonder 404- of bootfouten.
- Supabase Auth signup en login.
- De echte Auth-trigger die een organisatie, owner-lidmaatschap en bedrijfsprofiel aanmaakt.
- Teamuitnodigingen, e-mailbinding en eenmalige acceptatie.
- Rollen en viewerbeperkingen.
- Tenantisolatie en blokkering van cross-company toegang.

De tests gebruiken uitsluitend lokale API-keys en synthetische `example.test`-accounts.

## Stoppen en resetten

```bash
npm run reception:local:stop
```

De containers stoppen; de lokale databasevolume blijft bewaard.

Volledig opnieuw beginnen (verwijdert alle lokale testdata):

```bash
npm run reception:local:reset
```

Start daarna opnieuw met `npm run reception:local`.

## Veiligheidsgrenzen

- De lokale runtime accepteert op localhost alleen een Supabase-URL met hostname `localhost` of `127.0.0.1`.
- Er staat geen `supabase link` of `--remote`-commando in de scripts.
- Geen lokale opdracht voert `db push`, `functions deploy`, `secrets set` of andere hosted mutations uit.
- Vercel preview-hosts krijgen geen automatische fallback naar de productiebackend.
- Productie Supabase wordt alleen gelezen voor het genereren van deze schema-only bronbestanden; er worden geen productietabellen, users, secrets of data gewijzigd.

## Bekende beperking

De productieomgeving bevat aanvullende schemas en 47 actieve Edge Functions, waaronder 7 Omega-functies. Deze lokale Reception AI-profielkopie bevat bewust alleen de 40 Reception AI-functies en de `public/private`-applicatieschema's. De externe providerkoppelingen vereisen aparte testcredentials en zijn niet automatisch nagebootst.
