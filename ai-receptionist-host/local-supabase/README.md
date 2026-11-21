# Reception AI — geïsoleerde lokale testomgeving

Deze omgeving is bewust een **afzonderlijke Supabase Local-stack**. Ze gebruikt geen productieproject, geen productiegegevens en geen Supabase Cloud Branch.

## Vereisten

- Node.js 20 of nieuwer
- Docker Desktop met Linux-containers (op Windows ARM: WSL2-backend)
- Internetverbinding voor de eerste download van Supabase CLI-images

## Starten

Voer vanuit de repository-root uit:

```bash
npm run reception:local
```

Het script:
1. Kopieert de actuele `team-management` Edge Function en bijhorende migratie naar deze lokale stack.
2. Start een lokale Supabase-database, Auth, API en Studio.
3. Haalt uitsluitend de lokale keys op met `supabase status`.
4. Schrijft `ai-receptionist-host/runtime-config.local.json` en een lokale function-envfile.
5. Start alleen de lokale `team-management` Edge Function en de Reception AI-frontend.

Open daarna http://127.0.0.1:4173. Studio staat op http://127.0.0.1:54323.

## Geautomatiseerde integratietest

Met de lokale stack actief:

```bash
npm run reception:test:local
```

De test maakt tijdelijke accounts met het domein `example.test`, twee testbedrijven, een uitnodiging en lidmaatschappen. Ze controleert:
- Auth-registratie en aanmelden;
- uitnodiging aanmaken en aanvaarden;
- e-mailbinding en eenmalig gebruik van uitnodigingen;
- rolwijziging en rolbeperkingen;
- cross-tenant blokkering;
- dat een lid van bedrijf A geen lidmaatschap van bedrijf B kan wijzigen.

Alle testrecords staan uitsluitend in de lokale Docker-database. De test gebruikt geen echte e-mailprovider en verstuurt geen uitnodigingen.

## Stoppen

```bash
npm run reception:local:stop
```

Dit stopt en verwijdert de lokale containers. Lokale databasegegevens blijven volgens Supabase CLI-gedrag behouden tenzij u expliciet `--no-backup` of een reset gebruikt. Gebruik voor een volledige reset:

```bash
npm run reception:local:reset
```

Een reset verwijdert **alle lokale testdata**.

## Belangrijke afbakening

Dit profiel bootst alleen de tabellen na die nodig zijn voor teambeheer en tenant-isolatie. Het is geen volledige kopie van de productie-Supabase-database. De huidige repository bevat niet de volledige historische productiemigraties. De lokale omgeving voert daarom alleen een minimale, expliciet testgerichte basismigratie uit plus de actuele teambeheer-migratie.

Gebruik in deze lokale map nooit `supabase link`, `supabase db push`, `supabase migration repair` of een productie-connection string. De lokale scripts bevatten bewust geen commando dat naar Supabase Cloud kan schrijven.
