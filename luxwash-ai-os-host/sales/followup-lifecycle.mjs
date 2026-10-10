// Pure, side-effect-free follow-up lifecycle. Do not call providers or modify CRM here.
// An action becomes completed ONLY after a provider-confirmed dispatch receipt.
export const STATES=Object.freeze({PENDING:"pending",REVIEW:"review_required",APPROVED:"approved",DISPATCHING:"dispatching",SENT:"sent",FAILED:"failed",BLOCKED:"blocked"});
const VALID=new Set(Object.values(STATES));
export function evaluateFollowup(task,now=new Date()){
  if(!task||typeof task!=="object")return {status:STATES.BLOCKED,reason:"invalid_task"};
  if(task.status===STATES.SENT)return {status:STATES.SENT,reason:"already_sent"};
  if(task.opted_out===true)return {status:STATES.BLOCKED,reason:"opted_out"};
  if(task.consent_confirmed!==true)return {status:STATES.REVIEW,reason:"contact_basis_unverified"};
  if(task.duplicate_found===true)return {status:STATES.REVIEW,reason:"possible_duplicate"};
  if(!task.channel||!["email","whatsapp"].includes(task.channel))return {status:STATES.REVIEW,reason:"unverified_channel"};
  if(!task.recipient||!task.message||!task.approved_by)return {status:STATES.REVIEW,reason:"message_requires_human_approval"};
  if(!task.idempotency_key)return {status:STATES.REVIEW,reason:"missing_idempotency_key"};
  if(task.scheduled_for&&new Date(task.scheduled_for).getTime()>now.getTime())return {status:STATES.PENDING,reason:"scheduled_later"};
  return {status:STATES.APPROVED,reason:"ready_for_dispatch"};
}
export function acknowledgeDispatch(task,receipt){
  if(!task||!receipt||typeof receipt!=="object")return {status:STATES.FAILED,reason:"missing_dispatch_receipt"};
  if(task.status!==STATES.DISPATCHING)return {status:STATES.FAILED,reason:"not_dispatching"};
  if(receipt.idempotency_key!==task.idempotency_key)return {status:STATES.FAILED,reason:"receipt_key_mismatch"};
  if(receipt.confirmed!==true||typeof receipt.provider_message_id!=="string"||!receipt.provider_message_id.trim())return {status:STATES.FAILED,reason:"unconfirmed_delivery"};
  return {status:STATES.SENT,reason:"provider_accepted",provider_message_id:receipt.provider_message_id};
}
