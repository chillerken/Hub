# LuxWash status — 12 september 2026

De centrale software en Supabase-migraties zijn gepubliceerd. Het systeem is nog niet volledig geaccepteerd voor productie. Een echte oproep met boeking en ontvangen bevestiging is niet aangetoond. Zie [actuele activatie en bewijs](docs/LIVE_ACTIVATIE.md).

De actieve backend gebruikt het bestaande Supabase-project in Frankfurt via de beveiligde RPC-adapter. DATABASE_URL is geen vereiste voor deze adapter; de oudere Render-blueprint beschrijft niet de huidige live infrastructuur. Geheimen staan uitsluitend in de serveromgeving.

Gebouwd en getest: CRM, databaseprijzen, planning, transactionele boekingen, offertegoedkeuring en offerteboeking, beheerlinks, e-mailwachtrij, opvolging en AI-tools. Ontbrekende providers worden niet gesimuleerd.

Externe blokkades: OpenAI weigert daadwerkelijke antwoordgeneratie met HTTP 429; beide Render-services gebruiken het slapende Free-plan; Rinkel/Zadarma-routering en SIP-oproepen zijn niet geverifieerd. Het laatst toegestane hostingbudget is €0 per maand. Er is niets betaald of opgewaardeerd.

De beheerlogin gebruikt ADMIN_PASSWORD uit de centrale Render-omgeving. De connector kan dat wachtwoord niet uitlezen. Supabase Auth vereist een actief owner/admin-lidmaatschap; er zijn nog geen leden ingericht. Er is geen standaardwachtwoord of toegangsomweg toegevoegd.
