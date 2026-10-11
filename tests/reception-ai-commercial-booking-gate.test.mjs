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
  assert.match(chat, /\.update\(appointmentPatch\)\.eq\("id",appointmentId\)\.eq\("organization_id",p.organization_id\)\.in\("status",VISITOR_EDITABLE_BOOKING_STATUSES\)/);
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
  assert.match(operator, /if\(!current.start_at\|\|!current.end_at\)/);
  assert.match(operator, /event_type:"appointment.confirmed"/);
});

test("isolated REAL-API readiness sequence proves operator approval without external sends", () => {
  assert.match(readiness, /automation_enabled:false/);
  for (const step of [
    "tenant_read_isolation",
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
