# Reception AI

Verkoopdemo voor de AI Receptionist + Lead Agent. Backend: Supabase Edge Function + multi-tenant RLS-tabellen. Deze demo bewijst intake, deduplicatie, gesprek, follow-up en human handoff. Externe telefonie/WhatsApp worden bewust niet als verbonden voorgesteld.

## Hosting
Static files; deploy de map `ai-receptionist-host` naar een statische host.

## Website embed

Elke tenant heeft een eigen publieke `widget_token`. Plaats `widget.js` op de klantwebsite met `data-widget-token`; dezelfde frontend en backend worden voor alle bedrijven hergebruikt. Zie `docs/embed.md`.
