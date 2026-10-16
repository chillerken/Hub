export const STATUSES=["PLANNED","APPROVED","EXECUTED","VERIFIED","BLOCKED","FAILED","HUMAN_REQUIRED"] as const;
export type Status=typeof STATUSES[number];
export type Risk="read"|"low"|"medium"|"high"|"critical";
export type Intent="customer_question"|"lead"|"appointment"|"quote"|"follow_up"|"payment"|"review"|"marketing"|"infrastructure"|"unknown";
export type Agent="supervisor"|"planner"|"executor"|"critic"|"verifier"|"human";
export type Receipt={action_id:string;workflow_id:string;intent:Intent;agent:Agent;tool?:string;target?:string;input_hash:string;idempotency_key?:string;risk_level:Risk;approval_required:boolean;started_at:string;completed_at?:string;status:Status;result_summary?:string;evidence:string[];confidence:number;error?:string;fallback_used?:string};
export type Request={workflow_id:string;text:string;target?:string;risk?:Risk;approved?:boolean;attempt?:number;failure_signature?:string};
export type Decision={intent:Intent;route:Agent[];status:Status;risk:Risk;approval_required:boolean;reason:string};
const rules:[Intent,RegExp][]=[
["infrastructure",/dns|tls|ssl|domain|deploy|hosting|server|certificate|certificaat/i],
["payment",/betaal|payment|stripe|factuur/i],["appointment",/afspraak|boek|planning|tijdslot/i],
["quote",/offerte|prijsaanvraag/i],["review",/review|beoordeling/i],["follow_up",/opvolg|follow.?up|herinner/i],
["lead",/lead|prospect|contact/i],["marketing",/marketing|campagne|social|post/i],["customer_question",/vraag|klant|informatie/i]];
export function routeIntent(text:string):Intent{return rules.find(([,r])=>r.test(text))?.[0]??"unknown"}
export function approvalRequired(r:Risk){return r==="high"||r==="critical"}
export function decide(q:Request):Decision{
 const intent=routeIntent(q.text),risk=q.risk??"low",needs=approvalRequired(risk);
 if((q.attempt??0)>=3)return{intent,route:["supervisor","human"],status:"HUMAN_REQUIRED",risk,approval_required:needs,reason:"LoopGuard: retry budget exhausted"};
 if(needs&&!q.approved)return{intent,route:["supervisor","planner","critic","human"],status:"HUMAN_REQUIRED",risk,approval_required:true,reason:"ApprovalGate"};
 return{intent,route:["supervisor","planner","critic","executor","verifier"],status:"PLANNED",risk,approval_required:needs,reason:"Ready for guarded execution"};
}
export function canTransition(from:Status,to:Status){
 const ok:Record<Status,Status[]>={PLANNED:["APPROVED","BLOCKED","FAILED","HUMAN_REQUIRED"],APPROVED:["EXECUTED","BLOCKED","FAILED"],EXECUTED:["VERIFIED","FAILED","BLOCKED","HUMAN_REQUIRED"],VERIFIED:[],BLOCKED:["PLANNED","HUMAN_REQUIRED"],FAILED:["PLANNED","HUMAN_REQUIRED"],HUMAN_REQUIRED:["APPROVED","BLOCKED"]};
 return ok[from].includes(to);
}
export function duplicateKey(intent:Intent,target:string,payload:string){return [intent,target,payload.trim().toLowerCase()].join("|")}
