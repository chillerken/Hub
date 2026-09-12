# LuxWash central runtime

Existing Render Node HTTP server is retained to preserve its active deployment and secrets. The central CRM uses the existing Frankfurt Supabase project. Public chat and OpenAI SIP share the same server-side tool dispatcher. All state is persisted; missing providers return errors. Scheduling is atomic in PostgreSQL and cannot infer owner availability. Availability must be explicitly opened by the owner.

The legacy app-secret hash is reused through its existing validation function; the secret is never exposed to clients. The new database dispatch function is private. Admin routes verify signed HttpOnly sessions or Supabase Auth plus an enabled CRM membership. Public sessions cannot read customer profiles. Existing-booking modifications require a booking capability token.
