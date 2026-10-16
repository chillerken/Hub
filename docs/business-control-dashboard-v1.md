# Business Control Dashboard Contract

Shadow mode is mandatory for v1. No recommendation can execute customer communication, payments, calendar changes or destructive actions.

## Executive view
- North Star: profitable completed jobs + contribution profit/job
- CFO: revenue, costs, contribution margin, payment/refund exceptions
- CMO: leads, qualified leads, conversion, acquisition/customer-journey leaks
- COO: capacity, appointment flow, automation failures, handoffs
- CEO: ranked DecisionEngine queue across all functions

## Decision queue
Rank by expected impact × confidence × (1-risk) / effort. Every card must expose evidence, owner, confidence, risk and verification status.

## ExceptionOnly
Surface only material deviations with sufficient confidence. Missing/weak evidence remains advisory and must not trigger Autopilot.

## Autopilot
Disabled in v1. Enabling it later requires explicit per-action allowlists, idempotency, ActionReceipt persistence, rollback/recovery and independent verification.
