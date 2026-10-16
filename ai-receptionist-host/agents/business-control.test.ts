import{strict as a}from"node:assert";import{northStar,decisionScore,businessXRay,moneyLeaks,revenueLeaks,SHADOW_MODE}from"./business-control";
a.equal(SHADOW_MODE,true);a.deepEqual(northStar({completed:2,revenue:300,variable_cost:80,refunds:20}),{profitable_completed_jobs:2,contribution_profit:200,value:100});
a.ok(decisionScore({impact:1,effort:.1,risk:.1,confidence:1})>decisionScore({impact:.2,effort:.8,risk:.8,confidence:.5}));
const s:any=[{id:"1",kind:"cost",value:120,baseline:100,confidence:.9,evidence:["cost up"]},{id:"2",kind:"conversion",value:.2,baseline:.3,confidence:.9,evidence:["conversion down"]}];
a.equal(businessXRay(s).every((x:any)=>x.autopilot===false),true);a.equal(moneyLeaks(s).length,1);a.equal(revenueLeaks(s).length,1);console.log("business control tests: OK");
