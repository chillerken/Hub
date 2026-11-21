import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "jsr:@supabase/supabase-js@2.95.0/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid request body" }, 400);
    }
    const message = String((body as any).message || "").trim().slice(0, 2000);
    if (!message) return json({ error: "Message required" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const pub = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default
      || Deno.env.get("SUPABASE_ANON_KEY");
    const sec = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default
      || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !pub || !sec) return json({ error: "Server configuration incomplete" }, 500);

    const token = auth.slice(7);
    const userClient = createClient(url, pub, {
      auth: { persistSession: false },
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const requestedOrg = String((body as any).organization_id || "").trim();
    const { data: activeContext } = requestedOrg ? { data: null } : await admin.from("user_org_context")
      .select("organization_id").eq("user_id", user.id).maybeSingle();
    const targetOrg = requestedOrg || activeContext?.organization_id || "";
    let membershipQuery = userClient.from("memberships")
      .select("organization_id,role")
      .eq("user_id", user.id)
      .eq("active", true);
    if (targetOrg) membershipQuery = membershipQuery.eq("organization_id", targetOrg);
    const { data: memberships, error: membershipError } = await membershipQuery;
    if (membershipError) throw membershipError;
    if (!memberships?.length) return json({ error: "No active organization membership" }, 403);
    if (!targetOrg && memberships.length !== 1) {
      return json({ error: "Organization context required", code: "organization_context_required" }, 409);
    }
    const membership = memberships[0];
    if (!["owner", "admin", "agent"].includes(membership.role)) {
      return json({ error: "Insufficient role. Viewer access is read-only." }, 403);
    }
    const org = membership.organization_id;

    const admin = createClient(url, sec, { auth: { persistSession: false } });
    const { data: orgrow, error: orgError } = await admin.from("organizations")
      .select("plan,subscription_status,trial_ends_at,status,is_internal")
      .eq("id", org).single();
    if (orgError || !orgrow) return json({ error: "Organization not found" }, 404);
    const trialOk = orgrow.is_internal === true
      || (orgrow.plan === "trial" && orgrow.trial_ends_at
        && new Date(orgrow.trial_ends_at).getTime() > Date.now());
    const paidOk = ["starter", "pro", "business"].includes(orgrow.plan || "")
      && ["active", "trialing"].includes(orgrow.subscription_status || "");
    if (orgrow.status === "suspended" || (!trialOk && !paidOk)) {
      return json({ error: "Subscription required" }, 402);
    }

    const { data: profile, error: profileError } = await admin.from("business_profiles")
      .select("business_name,receptionist_name,description,services,opening_hours,qualification_questions,escalation_rules")
      .eq("organization_id", org).maybeSingle();
    if (profileError) throw profileError;

    const lower = message.toLowerCase();
    const wantsHuman = /mens|medewerker|bellen|bel mij|klacht|dringend|urgent/.test(lower);
    const wantsAppointment = /afspraak|boeken|inplannen|wanneer|beschikbaar/.test(lower);

    const effectivePlan = orgrow.is_internal === true ? "business"
      : (["starter", "pro", "business"].includes(String(orgrow.plan || ""))
        ? String(orgrow.plan) : "trial");
    let dailyLimit = 500;
    if (effectivePlan !== "trial") {
      const { data: planRow, error: planError } = await admin.from("reception_ai_plan_catalog")
        .select("daily_ai_limit").eq("plan", effectivePlan).eq("active", true).maybeSingle();
      if (planError) throw planError;
      dailyLimit = Math.max(1, Number(planRow?.daily_ai_limit || 500));
    }
    if (!wantsHuman && !wantsAppointment) {
      const { data: quotaOk, error: quotaError } = await admin.rpc("consume_ai_daily_quota", {
        p_organization_id: org, p_limit: dailyLimit,
      });
      if (quotaError) throw quotaError;
      if (quotaOk !== true) return json({ error: "Daglimiet voor AI-verwerking bereikt." }, 429);
    }

    let leadId = String((body as any).lead_id || "").trim() || null;
    let conversationId = String((body as any).conversation_id || "").trim() || null;

    if (leadId) {
      const { data: lead, error } = await admin.from("leads").select("id")
        .eq("id", leadId).eq("organization_id", org).maybeSingle();
      if (error) throw error;
      if (!lead) return json({ error: "Lead not found in the selected organization" }, 404);
    }

    if (conversationId) {
      const { data: conversation, error } = await admin.from("conversations")
        .select("id,organization_id,lead_id")
        .eq("id", conversationId).eq("organization_id", org).maybeSingle();
      if (error) throw error;
      if (!conversation) return json({ error: "Conversation not found in the selected organization" }, 404);
      if (leadId && conversation.lead_id && conversation.lead_id !== leadId) {
        return json({ error: "Conversation and lead do not match" }, 409);
      }
      if (!leadId && conversation.lead_id) leadId = conversation.lead_id;
    }

    if (!leadId) {
      const email = String((body as any).email || "").trim().toLowerCase().slice(0, 255) || null;
      const phone = String((body as any).phone || "").trim().slice(0, 50) || null;
      const name = String((body as any).name || "").trim().slice(0, 120) || "Websitebezoeker";
      const dedupe = email ? "email:" + email : phone ? "phone:" + phone : "web:" + crypto.randomUUID();
      const { data: lead, error } = await admin.from("leads").upsert({
        organization_id: org, name, email, phone, source: "web_chat",
        status: "qualifying", score: 20, summary: message.slice(0, 240), dedupe_key: dedupe,
      }, { onConflict: "organization_id,dedupe_key" }).select("id").single();
      if (error) throw error;
      leadId = lead.id;
    }

    if (!conversationId) {
      const { data: conv, error } = await admin.from("conversations").insert({
        organization_id: org, lead_id: leadId, channel: "web", status: "open",
      }).select("id").single();
      if (error) throw error;
      conversationId = conv.id;
    } else {
      const { data: conv, error } = await admin.from("conversations")
        .select("lead_id").eq("id", conversationId).eq("organization_id", org).single();
      if (error) throw error;
      if (!conv.lead_id && leadId) {
        const { error: linkError } = await admin.from("conversations")
          .update({ lead_id: leadId }).eq("id", conversationId).eq("organization_id", org);
        if (linkError) throw linkError;
      }
    }

    const { error: customerMessageError } = await admin.from("messages").insert({
      organization_id: org, conversation_id: conversationId, role: "customer", content: message,
    });
    if (customerMessageError) throw customerMessageError;

    const { data: hist, error: historyError } = await admin.from("messages")
      .select("role,content").eq("organization_id", org).eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(10);
    if (historyError) throw historyError;
    const history = (hist || []).reverse().map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user", content: m.content,
    }));

    const services = Array.isArray(profile?.services) ? profile.services : [];
    let reply = "";
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (apiKey && !wantsHuman && !wantsAppointment) {
      const instructions = [
        "Je bent " + (profile?.receptionist_name || "Ava") + ", de AI-receptionist van " + (profile?.business_name || "dit bedrijf") + ".",
        "Antwoord natuurlijk, vriendelijk, compact en professioneel in de taal van de klant.",
        "Gebruik uitsluitend bedrijfsinformatie die hieronder staat. Verzin geen prijzen, openingsuren, beschikbaarheid, beleid of diensten.",
        "Als informatie ontbreekt, zeg dat je dit laat bevestigen door een medewerker.",
        "Een aanvraag is nooit automatisch een bevestigde afspraak.",
        "Vraag maximaal één nuttige vervolgvraag tegelijk.",
        "Bedrijfsbeschrijving: " + (profile?.description || "niet ingevuld"),
        "Diensten: " + (services.length ? services.join(", ") : "niet ingevuld"),
        "Openingsuren: " + JSON.stringify(profile?.opening_hours || {}),
        "Kwalificatievragen: " + JSON.stringify(profile?.qualification_questions || []),
        "Escalatieregels: " + JSON.stringify(profile?.escalation_rules || {}),
      ].join("\n");
      const contents = history.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }],
      }));
      for (const model of ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        try {
          const ai = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
            method: "POST", signal: controller.signal,
            headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: instructions }] }, contents,
              generationConfig: { maxOutputTokens: 700, temperature: 0.35 },
            }),
          });
          if (ai.ok) {
            const result = await ai.json();
            reply = String(result?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "").trim();
            if (reply) break;
          } else {
            console.error("Gemini", model, ai.status);
            if (!([404, 408, 429].includes(ai.status) || ai.status >= 500)) break;
          }
        } catch (e) {
          console.error("Gemini request", model, e instanceof Error ? e.message : String(e));
        } finally {
          clearTimeout(timer);
        }
      }
    }

    if (wantsHuman) {
      reply = "Natuurlijk. Ik geef dit door aan een medewerker van " + (profile?.business_name || "het bedrijf")
        + " voor persoonlijke opvolging. Laat eventueel uw telefoonnummer achter zodat we u kunnen bereiken.";
    } else if (wantsAppointment) {
      reply = "Graag. Ik kan hier geen live beschikbaarheid bevestigen. Welke dag of periode past voor u het best? Een medewerker bevestigt daarna de afspraak.";
    } else if (!reply) {
      reply = services.length
        ? "Hallo, ik ben " + (profile?.receptionist_name || "Ava") + " van " + (profile?.business_name || "het bedrijf")
          + ". Onze diensten zijn " + services.slice(0, 6).join(", ") + ". Waarmee kan ik u precies helpen?"
        : "Hallo, ik ben " + (profile?.receptionist_name || "Ava") + ". Vertel kort waarvoor u contact opneemt, dan registreer ik uw aanvraag.";
    }

    if (wantsHuman) {
      const { error: handoffError } = await admin.from("handoffs").insert({
        organization_id: org, lead_id: leadId, conversation_id: conversationId,
        reason: "Bezoeker vraagt menselijke opvolging", status: "open",
      });
      if (handoffError) throw handoffError;
      const { error } = await admin.from("leads").update({ status: "handoff", score: 80 })
        .eq("id", leadId).eq("organization_id", org);
      if (error) throw error;
    } else if (wantsAppointment) {
      const { error: taskError } = await admin.from("tasks").insert({
        organization_id: org, lead_id: leadId, title: "Afspraakaanvraag opvolgen",
        status: "open", priority: "high",
      });
      if (taskError) throw taskError;
      const { error } = await admin.from("leads").update({ status: "qualified", score: 70 })
        .eq("id", leadId).eq("organization_id", org);
      if (error) throw error;
    }

    const { error: assistantMessageError } = await admin.from("messages").insert({
      organization_id: org, conversation_id: conversationId, role: "assistant", content: reply,
    });
    if (assistantMessageError) throw assistantMessageError;

    const { error: auditError } = await admin.from("audit_events").insert({
      organization_id: org, actor_user_id: user.id, event_type: "conversation.message",
      entity_type: "conversation", entity_id: conversationId, payload: { channel: "web" },
    });
    if (auditError) console.error("Audit event insert failed", auditError);

    return json({ reply, lead_id: leadId, conversation_id: conversationId, organization_id: org });
  } catch (e) {
    console.error("reception-chat failed", e);
    return json({ error: "Chat request failed" }, 500);
  }
});