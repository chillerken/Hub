import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const clean = (v: unknown, max = 320) => String(v ?? "").trim().slice(0, max);
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 320;
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
};
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(x => x.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const pub = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, pub, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const admin = createClient(url, sec, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user || !user.email) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40);
    const orgId = clean(body.organization_id, 80);

    if (action === "accept_invite") {
      const token = clean(body.token, 128);
      if (!/^[a-f0-9]{64}$/i.test(token)) return json({ error: "invalid_invitation" }, 400);
      const tokenHash = await sha256(token);
      const { data: invite, error: inviteError } = await admin.from("team_invitations")
        .select("id,organization_id,email,role,status,expires_at")
        .eq("token_hash", tokenHash).maybeSingle();
      if (inviteError) throw inviteError;
      if (!invite) return json({ error: "invitation_not_found" }, 404);
      if (invite.status !== "pending") return json({ error: "invitation_closed", status: invite.status }, 409);
      if (new Date(invite.expires_at).getTime() <= Date.now()) {
        await admin.from("team_invitations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", invite.id).eq("status", "pending");
        return json({ error: "invitation_expired" }, 410);
      }
      if (clean(user.email).toLowerCase() !== String(invite.email).toLowerCase()) {
        return json({ error: "invitation_email_mismatch", invited_email: invite.email }, 403);
      }
      if (!user.email_confirmed_at) return json({ error: "email_confirmation_required" }, 403);

      const { data: existing, error: existingError } = await admin.from("memberships")
        .select("id,active,role").eq("organization_id", invite.organization_id).eq("user_id", user.id).maybeSingle();
      if (existingError) throw existingError;
      if (existing?.active) return json({ error: "already_a_member", role: existing.role }, 409);

      const now = new Date().toISOString();
      const membershipWrite = existing
        ? await admin.from("memberships").update({ role: invite.role, active: true }).eq("id", existing.id).select("id,organization_id,role,active").single()
        : await admin.from("memberships").insert({ organization_id: invite.organization_id, user_id: user.id, role: invite.role, active: true }).select("id,organization_id,role,active").single();
      if (membershipWrite.error) throw membershipWrite.error;

      const { error: acceptedError } = await admin.from("team_invitations")
        .update({ status: "accepted", accepted_at: now, accepted_by: user.id, updated_at: now })
        .eq("id", invite.id).eq("status", "pending");
      if (acceptedError) throw acceptedError;

      const { data: context } = await admin.from("user_org_context").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!context) {
        const { error: contextError } = await admin.from("user_org_context").insert({ user_id: user.id, organization_id: invite.organization_id });
        if (contextError) throw contextError;
      }
      await admin.from("audit_events").insert({
        organization_id: invite.organization_id, actor_user_id: user.id,
        event_type: "team.invitation_accepted", entity_type: "membership", entity_id: membershipWrite.data.id,
        payload: { invitation_id: invite.id, role: invite.role }
      });
      const { data: organization } = await admin.from("organizations").select("id,name").eq("id", invite.organization_id).single();
      return json({ ok: true, membership: membershipWrite.data, organization });
    }

    if (action === "list_organizations") {
      const { data: memberships, error } = await admin.from("memberships")
        .select("organization_id,role,active,created_at").eq("user_id", user.id).eq("active", true);
      if (error) throw error;
      const ids = (memberships || []).map((m: any) => m.organization_id);
      if (!ids.length) return json({ organizations: [], active_organization_id: null });
      const [{ data: organizations, error: orgError }, { data: context, error: contextError }] = await Promise.all([
        admin.from("organizations").select("id,name,status,plan,subscription_status,trial_ends_at,is_internal").in("id", ids),
        admin.from("user_org_context").select("organization_id").eq("user_id", user.id).maybeSingle()
      ]);
      if (orgError) throw orgError;
      if (contextError) throw contextError;
      const activeId = ids.includes(context?.organization_id) ? context.organization_id : (ids.length === 1 ? ids[0] : null);
      return json({ organizations: (organizations || []).map((o: any) => ({ ...o, membership: memberships!.find((m: any) => m.organization_id === o.id) })), active_organization_id: activeId, selection_required: ids.length > 1 && !activeId });
    }

    if (action === "set_active_organization") {
      if (!orgId) return json({ error: "organization_id_required" }, 400);
      const { data: membership, error } = await admin.from("memberships").select("id")
        .eq("user_id", user.id).eq("organization_id", orgId).eq("active", true).maybeSingle();
      if (error) throw error;
      if (!membership) return json({ error: "organization_access_denied" }, 403);
      const { error: saveError } = await admin.from("user_org_context").upsert({ user_id: user.id, organization_id: orgId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (saveError) throw saveError;
      return json({ ok: true, active_organization_id: orgId });
    }

    const { data: pref } = await admin.from("user_org_context").select("organization_id").eq("user_id", user.id).maybeSingle();
    let selectedOrg = orgId || pref?.organization_id || "";
    if (!selectedOrg) {
      const { data: mine, error } = await admin.from("memberships").select("organization_id").eq("user_id", user.id).eq("active", true).limit(2);
      if (error) throw error;
      if ((mine || []).length === 1) selectedOrg = mine![0].organization_id;
      else if ((mine || []).length > 1) return json({ error: "organization_selection_required" }, 409);
    }
    if (!selectedOrg) return json({ error: "membership_not_found" }, 403);

    const { data: membership, error: membershipError } = await admin.from("memberships")
      .select("organization_id,role,active").eq("organization_id", selectedOrg).eq("user_id", user.id).eq("active", true).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: "organization_access_denied" }, 403);
    const isOwner = membership.role === "owner";
    const isAdmin = isOwner || membership.role === "admin";

    if (action === "list_members") {
      if (!isAdmin) return json({ error: "admin_role_required" }, 403);
      const { data: members, error } = await admin.from("memberships")
        .select("id,user_id,role,active,created_at").eq("organization_id", selectedOrg).order("created_at", { ascending: true });
      if (error) throw error;
      const result = await Promise.all((members || []).map(async (m: any) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        return { ...m, email: data?.user?.email || null, last_sign_in_at: data?.user?.last_sign_in_at || null };
      }));
      const { data: invitations, error: inviteError } = await admin.from("team_invitations")
        .select("id,email,role,status,expires_at,created_at,invited_by").eq("organization_id", selectedOrg)
        .eq("status", "pending").order("created_at", { ascending: false });
      if (inviteError) throw inviteError;
      return json({ members: result, invitations: invitations || [], current_user_role: membership.role });
    }

    if (action === "create_invite") {
      if (!isAdmin) return json({ error: "admin_role_required" }, 403);
      const email = clean(body.email).toLowerCase();
      const role = clean(body.role, 20).toLowerCase();
      if (!validEmail(email)) return json({ error: "invalid_email" }, 400);
      if (!["admin", "agent", "viewer"].includes(role)) return json({ error: "invalid_role" }, 400);
      if (role === "admin" && !isOwner) return json({ error: "only_owner_can_invite_admin" }, 403);
      const token = randomToken();
      const tokenHash = await sha256(token);
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error } = await admin.from("team_invitations").insert({
        organization_id: selectedOrg, email, role, invited_by: user.id, token_hash: tokenHash, expires_at: expires
      }).select("id,email,role,status,expires_at,created_at").single();
      if (error?.code === "23505") return json({ error: "pending_invitation_exists" }, 409);
      if (error) throw error;
      await admin.from("audit_events").insert({
        organization_id: selectedOrg, actor_user_id: user.id, event_type: "team.invitation_created",
        entity_type: "team_invitation", entity_id: invitation.id, payload: { email, role, expires_at: expires }
      });
      return json({ ok: true, invitation, invitation_path: "/accept-invite?token=" + token, delivery: "share_link_manually" });
    }

    if (action === "revoke_invite") {
      if (!isAdmin) return json({ error: "admin_role_required" }, 403);
      const invitationId = clean(body.invitation_id, 80);
      const { data: invitation, error } = await admin.from("team_invitations").update({
        status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("id", invitationId).eq("organization_id", selectedOrg).eq("status", "pending")
        .select("id,email,role").maybeSingle();
      if (error) throw error;
      if (!invitation) return json({ error: "pending_invitation_not_found" }, 404);
      await admin.from("audit_events").insert({
        organization_id: selectedOrg, actor_user_id: user.id, event_type: "team.invitation_revoked",
        entity_type: "team_invitation", entity_id: invitation.id, payload: { email: invitation.email }
      });
      return json({ ok: true });
    }

    if (action === "change_member_role") {
      if (!isAdmin) return json({ error: "admin_role_required" }, 403);
      const memberId = clean(body.membership_id, 80);
      const newRole = clean(body.role, 20).toLowerCase();
      if (!["admin", "agent", "viewer"].includes(newRole)) return json({ error: "invalid_role" }, 400);
      const { data: target, error } = await admin.from("memberships").select("id,user_id,role,active")
        .eq("id", memberId).eq("organization_id", selectedOrg).eq("active", true).maybeSingle();
      if (error) throw error;
      if (!target) return json({ error: "member_not_found" }, 404);
      if (target.role === "owner") return json({ error: "owner_role_is_protected" }, 409);
      if ((target.role === "admin" || newRole === "admin") && !isOwner) return json({ error: "only_owner_can_manage_admins" }, 403);
      const { error: updateError } = await admin.from("memberships").update({ role: newRole }).eq("id", memberId).eq("organization_id", selectedOrg);
      if (updateError) throw updateError;
      await admin.from("audit_events").insert({
        organization_id: selectedOrg, actor_user_id: user.id, event_type: "team.member_role_changed",
        entity_type: "membership", entity_id: memberId, payload: { from: target.role, to: newRole }
      });
      return json({ ok: true, membership_id: memberId, role: newRole });
    }

    if (action === "remove_member") {
      if (!isAdmin) return json({ error: "admin_role_required" }, 403);
      const memberId = clean(body.membership_id, 80);
      const { data: target, error } = await admin.from("memberships").select("id,user_id,role,active")
        .eq("id", memberId).eq("organization_id", selectedOrg).eq("active", true).maybeSingle();
      if (error) throw error;
      if (!target) return json({ error: "member_not_found" }, 404);
      if (target.role === "owner") return json({ error: "owner_cannot_be_removed" }, 409);
      if (target.user_id === user.id) return json({ error: "cannot_remove_self" }, 409);
      if (target.role === "admin" && !isOwner) return json({ error: "only_owner_can_remove_admin" }, 403);
      const { error: updateError } = await admin.from("memberships").update({ active: false }).eq("id", memberId).eq("organization_id", selectedOrg);
      if (updateError) throw updateError;
      await admin.from("audit_events").insert({
        organization_id: selectedOrg, actor_user_id: user.id, event_type: "team.member_removed",
        entity_type: "membership", entity_id: memberId, payload: { removed_role: target.role }
      });
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("TEAM_MANAGEMENT", error);
    return json({ error: "internal_error" }, 500);
  }
});
