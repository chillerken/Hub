# Agent Architecture v1

Production orchestration contract for Reception AI and future LuxWash automations.

## Flow
Event -> IntentRouter -> Supervisor -> Planner -> Executor/ToolRouter -> Critic -> Verifier -> final status.

## Roles
- **Supervisor** owns workflow state and dynamic routing. It never treats execution as verification.
- **Planner** creates the smallest reversible plan and its acceptance tests.
- **Executor** alone performs tool mutations after gates pass.
- **Critic** searches for unsupported assumptions, duplicate actions, unsafe side effects and cheaper alternatives.
- **Verifier** independently checks observable evidence against acceptance criteria.
- **HumanHandoff** receives blocked, low-confidence or approval-required work.

## Gates
1. **ConfidenceGate**: low confidence routes to research or human handoff.
2. **RiskGate**: classify read-only, reversible write, external communication, financial/destructive/security-sensitive.
3. **ApprovalGate**: require explicit approval whenever policy/tool contract requires it.
4. **DuplicateActionGuard**: every mutation uses an idempotency key derived from intent + target + normalized payload.
5. **LoopGuard**: max 3 recovery attempts per failure signature; then BLOCKED/HUMAN_REQUIRED.
6. **HumanOverride**: operator can stop, reroute, approve or reject before a pending mutation.

## Status machine
PLANNED -> APPROVED -> EXECUTED -> VERIFIED

Exceptional terminal/intermediate states:
BLOCKED | FAILED | HUMAN_REQUIRED

EXECUTED is never equivalent to VERIFIED.

## ActionReceipt
```ts
export type ActionReceipt = {
  action_id: string;
  workflow_id: string;
  intent: string;
  agent: "supervisor"|"planner"|"executor"|"critic"|"verifier"|"human";
  tool?: string;
  target?: string;
  input_hash: string;
  idempotency_key?: string;
  risk_level: "read"|"low"|"medium"|"high"|"critical";
  approval_required: boolean;
  started_at: string;
  completed_at?: string;
  status: "PLANNED"|"APPROVED"|"EXECUTED"|"VERIFIED"|"BLOCKED"|"FAILED"|"HUMAN_REQUIRED";
  result_summary?: string;
  evidence?: string[];
  confidence: number;
  error?: string;
  fallback_used?: string;
};
```

## Routing contract
IntentRouter emits one primary class:
`customer_question | lead | appointment | quote | follow_up | payment | review | marketing | infrastructure | unknown`.

ToolRouter selects only tools authorized for that intent and organization. Missing permissions invoke ToolFallback; they never become fabricated success.

## Memory and context
ContextEngine builds a minimal execution context from current request, organization configuration, conversation state and verified tool outputs. MemoryArchitect stores durable decisions/configuration separately from ephemeral run state. Secrets are never written to receipts or long-term memory.

## Observability
Every mutation must emit an ActionReceipt. A workflow trace links parent/child actions by `workflow_id`. Log failure signatures, retries, handoffs, latency and verification outcome.

## Recovery
AgentRecovery may retry only when the failure is plausibly transient and the action is idempotent. Configuration, permission, DNS/TLS and schema failures route to diagnosis rather than blind retry.

## Evaluation
Track: task success, independently verified success, duplicate-action rate, false-success rate, handoff precision, tool-error recovery, latency and cost.

## Reception AI production rule
For `ai.luxwash.online`, route TLS/DNS/custom-domain failures to `infrastructure`. Do not redeploy application code merely to hide infrastructure failure. Verification requires working HTTPS plus the production gate.
