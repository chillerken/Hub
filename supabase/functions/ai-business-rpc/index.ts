// Runs inside Supabase, where the legacy service-role key is injected by the platform.
// The caller must know the existing SUPABASE_APP_SECRET; the database RPC checks it again.
const secretHash = '635ca414b3806ccfe2b329590540f8253c93bcc150996832ad4bd25b7a00580e';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 65536) return json({ error: 'payload_too_large' }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || typeof input.p_secret !== 'string' ||
        typeof input.p_action !== 'string' || !/^[a-z_]{1,40}$/.test(input.p_action) ||
        !input.p_payload || typeof input.p_payload !== 'object' || Array.isArray(input.p_payload)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.p_secret));
    const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== secretHash) return json({ error: 'unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'upstream_unavailable' }, 503);
    const upstream = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/ai_business_rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ p_secret: input.p_secret, p_action: input.p_action, p_payload: input.p_payload }),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
});
