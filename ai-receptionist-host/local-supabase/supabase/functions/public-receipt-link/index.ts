import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CENTRAL_URL = "https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/luxwash-site-api/receipt-link";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method" }, 405);

  try {
    const origin = req.headers.get("origin") || "";
    let host = "";
    try { host = new URL(origin).hostname.toLowerCase().replace(/^www\./, ""); } catch {}
    if (host !== "luxwash.online") return json({ error: "Domein niet toegestaan" }, 403);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.widget_token || "").trim();
    const publicReceiptId = String(body?.public_receipt_id || "").trim().toLowerCase();
    const intakeKey = String(body?.intake_key || "").trim().toLowerCase();

    if (!token || !uuidRe.test(publicReceiptId) || !uuidRe.test(intakeKey)) {
      return json({ error: "Ongeldige receipt-koppeling" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const secret =
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, secret, { auth: { persistSession: false } });

    const { data: profile, error } = await db
      .from("business_profiles")
      .select("organization_id,widget_enabled,widget_allowed_domains")
      .eq("widget_token", token)
      .eq("widget_enabled", true)
      .single();

    if (error || !profile) return json({ error: "Widget niet gevonden" }, 404);

    const allowed = Array.isArray(profile.widget_allowed_domains)
      ? profile.widget_allowed_domains.map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean)
      : [];
    if (allowed.length) {
      const ok = allowed.some((d: string) => {
        const normalized = d
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "")
          .replace(/^www\./, "");
        return host === normalized;
      });
      if (!ok) return json({ error: "Domein niet toegestaan" }, 403);
    }

    const { data: org } = await db
      .from("organizations")
      .select("plan,trial_ends_at,subscription_status,status,is_internal")
      .eq("id", profile.organization_id)
      .single();

    const trialExpired =
      org?.is_internal !== true &&
      org?.plan === "trial" &&
      org?.trial_ends_at &&
      new Date(org.trial_ends_at).getTime() < Date.now();
    const paidInactive =
      org?.is_internal !== true &&
      ["starter", "pro", "business"].includes(String(org?.plan || "")) &&
      !["active", "trialing"].includes(String(org?.subscription_status || ""));
    if (!org || org.status === "suspended" || trialExpired || paidInactive) {
      return json({ error: "Widget niet actief" }, 402);
    }

    const upstream = await fetch(CENTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://www.luxwash.online"
      },
      body: JSON.stringify({
        public_receipt_id: publicReceiptId,
        intake_key: intakeKey
      })
    });

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data?.ok) {
      return json({ ok: false, status: "pending" }, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502);
    }

    return json({ ok: true, status: data.status === "resolved" ? "resolved" : "pending" }, 200);
  } catch (error) {
    console.error("PUBLIC_RECEIPT_LINK", error);
    return json({ ok: false, error: "Tijdelijk niet beschikbaar" }, 500);
  }
});