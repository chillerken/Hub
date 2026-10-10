import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { parseStripeSignature, verifyStripeSignature } from "./verify.mjs";
import { assessCreatorBetaPayment } from "./entitlement-policy.mjs";

// Production deployment requires the service-role-only RPCs in the companion SQL migration.
// Do not grant authenticated/anon access to these methods.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method", { status: 405 });

  const header = request.headers.get("stripe-signature") || "";
  const parsed = parseStripeSignature(header);
  if (!parsed) return new Response("bad signature", { status: 400 });
  if (Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp) > 300) {
    return new Response("stale", { status: 400 });
  }

  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("too large", { status: 413 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("not configured", { status: 503 });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Direct PostgREST access to private.* caused the verified HTTP 503 outage.
  // The only supported database access here is through service_role-only RPCs.
  const { data: webhookSecret, error: configError } = await admin.rpc("ai_creator_webhook_secret");
  if (configError || typeof webhookSecret !== "string" || !webhookSecret) {
    console.error("AI Creator webhook secret RPC unavailable", configError?.code || "missing");
    return new Response("not configured", { status: 503 });
  }

  if (!(await verifyStripeSignature(raw, header, webhookSecret))) {
    return new Response("invalid", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("json", { status: 400 });
  }

  // Verified against the live Luxdesign AI Creator Founding Beta payment link.
  // Other signed Stripe events are acknowledged but NEVER grant this product.
  const assessment = assessCreatorBetaPayment(event);
  if (!assessment.eligible) {
    return new Response("ok", { status: 200 });
  }
  const session = assessment.session;

  const receipt = {
    email: assessment.email,
    stripe_event_id: String(event.id || ""),
    stripe_checkout_session_id: String(session.id || ""),
    stripe_payment_intent_id: session.payment_intent ? String(session.payment_intent) : null,
    stripe_customer_id: session.customer ? String(session.customer) : null,
    payment_link_id: session.payment_link ? String(session.payment_link) : null,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
  };
  if (!receipt.email) return new Response("missing email", { status: 400 });

  // Atomic insert; duplicate events/sessions cannot re-activate refunded access.
  const { error: recordError } = await admin.rpc("ai_creator_webhook_record_paid", {
    p_receipt: receipt,
  });
  if (recordError) {
    console.error("AI Creator entitlement RPC failed", recordError.code || "db");
    return new Response("db", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
