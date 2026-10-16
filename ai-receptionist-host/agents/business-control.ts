export type ExecRole="CEO"|"CFO"|"CMO"|"COO";
export type BusinessSignal={id:string;kind:"revenue"|"cost"|"lead"|"conversion"|"capacity"|"customer"|"automation";value:number;baseline?:number;confidence:number;evidence:string[]};
export type Recommendation={owner:ExecRole;title:string;reason:string;impact:number;effort:number;risk:number;confidence:number;score:number;autopilot:false;exception:boolean};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function northStar(s:{completed:number;revenue:number;variable_cost:number;refunds:number}){const profit=s.revenue-s.variable_cost-s.refunds;return{profitable_completed_jobs:s.completed,contribution_profit:profit,value:s.completed>0?profit/s.completed:0}}
export function ownerFor(k:BusinessSignal["kind"]):ExecRole{return k==="revenue"||k==="cost"?"CFO":k==="lead"||k==="conversion"||k==="customer"?"CMO":k==="capacity"||k==="automation"?"COO":"CEO"}
export function decisionScore(x:{impact:number;effort:number;risk:number;confidence:number}){return +(clamp(x.impact)*clamp(x.confidence)*(1-clamp(x.risk))/(.25+clamp(x.effort))).toFixed(4)}
export function businessXRay(signals:BusinessSignal[]):Recommendation[]{return signals.map(s=>{const delta=s.baseline===undefined?0:s.value-s.baseline;const bad=(s.kind==="cost"&&delta>0)||(["revenue","lead","conversion","capacity","customer","automation"].includes(s.kind)&&delta<0);const impact=clamp(Math.abs(delta)/(Math.abs(s.baseline??s.value)||1));const risk=s.confidence<.6?.6:.2;return{owner:ownerFor(s.kind),title:`${s.kind} deviation: ${delta}`,reason:s.evidence.join("; ")||"No evidence supplied",impact,effort:.25,risk,confidence:clamp(s.confidence),score:decisionScore({impact,effort:.25,risk,confidence:s.confidence}),autopilot:false,exception:bad&&s.confidence>=.6}}).sort((a,b)=>b.score-a.score)}
export function moneyLeaks(s:BusinessSignal[]){return businessXRay(s.filter(x=>x.kind==="cost"||x.kind==="revenue")).filter(x=>x.exception)}
export function revenueLeaks(s:BusinessSignal[]){return businessXRay(s.filter(x=>["lead","conversion","revenue","customer"].includes(x.kind))).filter(x=>x.exception)}
export function exceptionsOnly(r:Recommendation[]){return r.filter(x=>x.exception)}
export const SHADOW_MODE=true;
