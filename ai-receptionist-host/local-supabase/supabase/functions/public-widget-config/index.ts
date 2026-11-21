import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(data: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "public, max-age=120" : "no-store",
      ...extra
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.widget_token || "").trim();
    if (!token) return json({ error: "Ongeldige widget" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const secret =
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const db = createClient(url, secret, { auth: { persistSession: false } });

    const { data: profile, error } = await db
      .from("business_profiles")
      .select("organization_id,business_name,receptionist_name,widget_greeting,widget_accent,locale,widget_enabled,widget_allowed_domains")
      .eq("widget_token", token)
      .eq("widget_enabled", true)
      .single();

    if (error || !profile) return json({ error: "Widget niet gevonden" }, 404);

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
      return json({ error: "Deze receptionist is momenteel niet actief." }, 402);
    }

    const allowed=Array.isArray(profile.widget_allowed_domains)?profile.widget_allowed_domains.map((x:string)=>String(x).trim().toLowerCase()).filter(Boolean):[];
    const origin=req.headers.get("origin");
    if(allowed.length){
      if(!origin)return json({error:"Deze widget is niet toegestaan op dit domein."},403);
      let host="";
      try{host=new URL(origin).hostname.toLowerCase()}catch{}
      const h=host.replace(/^www\./,"");
      const trusted=["reception-ai-luxwash.vercel.app","reception-ai-rho.vercel.app"];
      const ok=trusted.includes(h)||allowed.some((d:string)=>{
        const normalized=d.replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/^www\./,"");
        return h===normalized;
      });
      if(!ok)return json({error:"Deze widget is niet toegestaan op dit domein."},403);
    }

    return json({
      active: true,
      business_name: profile.business_name,
      receptionist_name: profile.receptionist_name || "AI Assistent",
      greeting: profile.widget_greeting || "Hallo! Waarmee kan ik helpen?",
      accent: /^#[0-9a-f]{6}$/i.test(String(profile.widget_accent || ""))
        ? profile.widget_accent
        : "#6d5dfc",
      locale: profile.locale || "nl-BE"
    });
  } catch (error) {
    console.error("PUBLIC_WIDGET_CONFIG", error);
    return json({ error: "Widgetconfiguratie tijdelijk niet beschikbaar." }, 500);
  }
});