import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  VISITOR_EDITABLE_BOOKING_STATUSES,
  visitorMayReviseBooking,
  appointmentRequestReply,
} from "../ai-receptionist-host/supabase/functions/public-reception-chat/booking-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const chat = read("ai-receptionist-host/supabase/functions/public-reception-chat/index.ts");
const operator = read("ai-receptionist-host/supabase/functions/operations-admin/index.ts");
const readiness = read("ai-receptionist-host/supabase/functions/production-e2e-check/index.ts");
const runner = read("ai-receptionist-host/supabase/functions/workflow-runner/index.ts");

test("public booking is always a REQUEST, never an operator confirmation", () => {
  assert.deepEqual([...VISITOR_EDITABLE_BOOKING_STATUSES], ["requested", "proposed"]);
  for (const status of ["confirmed", "completed", "cancelled", "", "unknown"])
    assert.equal(visitorMayReviseBooking(status), false, status);
  for (const status of ["requested", "proposed"])
    assert.equal(visitorMayReviseBooking(status), true, status);
  assert.match(chat, /status:"requested",requested_text:message/);
  assert.doesNotMatch(chat, /status:"confirmed",requested_text:message/);
});

test("both PUBLIC query and PUBLIC update exclude confirmed appointments", () => {
  assert.match(chat, /\.in\("status",VISITOR_EDITABLE_BOOKING_STATUSES\)\.order\("created_at"/);
  assert.ok(chat.includes('.update(appointmentPatch)'), "Visitor update present");
  assert.ok(chat.includes('.eq("id",appointmentId)'), "Visitor appointment identity guarded");
  assert.ok(chat.includes('.eq("organization_id",p.organization_id).in("status",VISITOR_EDITABLE_BOOKING_STATUSES)'), "Visitor tenant and status guards present");
  assert.ok(chat.includes('if(!updatedAppointments?.length)return json('), "Concurrent approval must fail closed");
  assert.ok(chat.includes('.select("id");'), "Guarded update must return affected row IDs");
  assert.equal((chat.match(/\.in\("status",VISITOR_EDITABLE_BOOKING_STATUSES\)/g) || []).length, 2);
  assert.doesNotMatch(chat, /\["requested","proposed","confirmed"\]/);
});

test("booking intake clearly collects contact details and does not promise availability", () => {
  assert.match(appointmentRequestReply(false), /telefoonnummer of e-mailadres/i);
  assert.match(appointmentRequestReply(false), /nog niet/i);
  assert.match(appointmentRequestReply(true), /nog niet bevestigd/i);
  assert.match(appointmentRequestReply(true), /bevoegde medewerker/i);
  assert.match(chat, /reply=appointmentRequestReply\(hasContact\)/);
});

test("tenant identity is required for all public booking reads and writes", () => {
  assert.match(chat, /\.eq\("widget_token",token\)\.eq\("widget_enabled",true\)/);
  assert.match(chat, /\.eq\("id",leadId\)\.eq\("organization_id",p.organization_id\)/);
  assert.match(chat, /\.eq\("organization_id",p.organization_id\)\.maybeSingle\(\)/);
  assert.match(chat, /organization_id:p.organization_id,lead_id:leadId,status:"requested"/);
});

test("only an authenticated tenant owner/admin can confirm with exact times", () => {
  assert.match(operator, /userDb.auth.getUser\(token\)/);
  assert.match(operator, /\["owner","admin"\]\.includes\(mem.role\)/);
  assert.match(operator, /if\(action==="confirm_appointment"\)/);
  assert.match(operator, /\.eq\("id",appointmentId\)\.eq\("organization_id",org\)\.single\(\)/);
  assert.ok(operator.includes("if(!current.start_at||!current.end_at || !(Date.parse(current.end_at)>Date.parse(current.start_at)))"));
  assert.match(operator, /event_type:"appointment.confirmed"/);
});

test("source declares isolated API readiness checks; this test does not execute them", () => {
  assert.match(readiness, /automation_enabled:false/);
  for (const step of [
    "tenant_read_isolation",
    "second_independent_tenant_created",
    "two_tenant_read_isolation",
    "cross_tenant_lead_read_denied",
    "cross_tenant_configuration_update_denied",
    "per_tenant_settings_distinct",
    "public_widget_cross_tenant_conversation_denied",
    "confirmed_appointment_immutable_to_visitor",
    "confirmed_slot_unchanged_after_new_request",
    "new_public_request_needs_separate_human_approval",
    "appointment_request_created",
    "appointment_deduped_without_invented_confirmation",
    "operator_cannot_confirm_unknown_appointment",
    "human_proposal_saved",
    "human_confirmation_saved",
    "confirmed_state_visible_to_tenant",
    "operator_confirmation_audited",
    "internal_followup_task_present",
  ]) assert.ok(readiness.includes(step), "missing live-readiness assertion " + step);
  assert.match(readiness, /external_messages_sent:false/);
  assert.match(readiness, /if\(orgId\)\{/);
});

test("Calendar dispatch is blocked until explicit human confirmation", () => {
  assert.ok(runner.includes('if(type==="calendar_request" && appointment?.status!=="confirmed")'));
  assert.ok(runner.includes('human_confirmation_required'));
  assert.ok(operator.includes('releaseCalendarAfterOperatorConfirmation(db,org,updated)'));
  assert.ok(operator.includes('status==="confirmed"'));
  assert.ok(operator.includes('["blocked","failed","skipped"]'));
  assert.ok(operator.includes('.eq("organization_id",org).eq("idempotency_key",key)'));
});
