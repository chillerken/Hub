# Astra — telefonische aanvraagflow

De actieve instructies staan in `src/core/phone-policy.js`. `/api/lina/bootstrap` levert deze instructies, de begroeting en de toegestane tools via de bestaande ondertekende serververbinding aan de telefoonservice.

- Identiteit Astra; Belgisch-Nederlands, u-vorm en één tot twee korte zinnen.
- Algemene vanafprijzen en bedrijfsvoorwaarden volgen de door de eigenaar aangeleverde kennisbank van 14 september 2026. Specifieke catalogusprijzen blijven via de bestaande leestoepassingen beschikbaar.
- WhatsApp verwijst naar `https://wa.me/3253896400`; dit is geen verzendkoppeling of bewijs van ontvangst.
- Geen definitieve boeking, betaling of automatische WhatsApp-/e-mailverzending door deze telefoonflow. Terugbelnotities vereisen akkoord en een genoteerd telefoonnummer.
- `recordCallDetails` bewaart tussentijdse gegevens in `phone_calls.summary` als gevalideerd JSON. Na ophangen bewaart `/api/lina/summary` hetzelfde object met exact de zes gevraagde velden. Bestaande tabellen, rechten en historische logs blijven behouden; er is geen datamigratie.
- De eindverwerking gebruikt geen aanvullende generatieve AI-aanroep. Bij ontbrekende gestructureerde notities wordt alleen een herkenbaar gespreksfragment bewaard. Onbekende gegevens blijven leeg. Een WhatsApp-doorverwijzing wordt bij afsluiting uitsluitend afgeleid uit de uitgesproken assistenttekst.
- Dubbele callback-toolaanroepen binnen hetzelfde gesprek hergebruiken de bestaande actie. Bij onzekere opslag wordt geen succes geclaimd.
- De telefoonruntime bewaart rollen bij transcripties, verwerkt ook vroegtijdig ophangen en probeert een mislukte eindopslag begrensd opnieuw. Een blijvende fout wordt geëscaleerd. Render Free en uitval van verbinding/database blijven grenzen aan gegarandeerde aflevering.

De bestaande SIP/OpenAI-telefonie blijft afhankelijk van de bestaande provider en diens kosten. Deze wijziging activeert geen nieuwe betaalde dienst en wijzigt geen telefoonnummerroutering. De echte telefoonroute en het WhatsApp-account zijn hiermee niet automatisch geverifieerd.

Rollbackpunten: `checkpoint/astra-phone-before-20260914` en `checkpoint/astra-crm-before-20260914` in `chillerken/Hub`.
Tests: `test/phone-policy.test.js`, `test/database-phone-policy.sql`, en `luxwash-lina/test_central.py` op de telefoonbranch. Databasetests worden volledig teruggedraaid; er worden geen testberichten naar klanten gestuurd.
