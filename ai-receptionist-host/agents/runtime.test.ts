import {strict as a} from "node:assert";import{decide,routeIntent,canTransition,duplicateKey}from"./runtime";
a.equal(routeIntent("fix TLS voor ai.luxwash.online"),"infrastructure");
a.equal(decide({workflow_id:"1",text:"stuur betaling",risk:"high"}).status,"HUMAN_REQUIRED");
a.equal(decide({workflow_id:"1",text:"stuur betaling",risk:"high",approved:true}).status,"PLANNED");
a.equal(decide({workflow_id:"1",text:"fix dns",attempt:3}).status,"HUMAN_REQUIRED");
a.equal(canTransition("EXECUTED","VERIFIED"),true);a.equal(canTransition("PLANNED","VERIFIED"),false);
a.equal(duplicateKey("lead","x"," Hello "),"lead|x|hello");
console.log("agent runtime contract tests: OK");
