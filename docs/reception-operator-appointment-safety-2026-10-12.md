# Reception AI — operator appointment safety

Date: 2026-10-12. Baseline: `d3dfe3fc3a461f4796567c2acf40ebd8745b85be`.
Status: repaired and tested in a review branch; not deployed.

## Reproduced problems

The actual `operations-admin` handler checked an appointment before its update,
but the update only filtered by ID and organization. Scheduling, confirming,
completing, or cancelling could therefore overwrite a concurrent change. Even
a newly changed time slot could be confirmed based on the previous slot.

Confirmation checked only whether both time values existed, not whether the
end was after the start. A failed `customer_payments` lookup was ignored, so
completion proceeded despite an unavailable payment check.

Nineteen isolated HTTP-handler cases were executed against a read-only copy of
the active Supabase `operations-admin` v5 source: nine passed, ten failed.
The original GitHub source has the same affected code paths. No live actions
were invoked. Invalid date strings are defensive fixture coverage; the actual
database stores timestamps, not arbitrary date strings.

## Repair

- All four appointment updates match the previously read status, updated_at,
  start_at and end_at, as well as the existing tenant and ID restrictions.
  Nullable times use `IS NULL` filters. An empty update returns HTTP 409 with
  `appointment_changed`; no success audit event or lead update follows.
- Confirmation rejects invalid, equal, or reversed time windows.
- An unavailable payment lookup returns an error before completion.
- The live v5 completion-to-lead-won behavior was missing from GitHub. Its
  tenant-scoped update and audit event are retained in this repair so a future
  deployment does not silently remove existing functionality.

## Reproduce

Install the existing locked dependencies with `npm ci --ignore-scripts`.

```sh
node --test tests/reception-operator-appointment-guard.test.mjs
node --test tests/reception-*.test.mjs tests/hub-typecheck-boundary.test.mjs ai-receptionist-host/tests/*.test.cjs luxwash-ai-os-host/sales/*.test.mjs luxwash-ai-os-host/stripe-webhook/edge-function/*.test.mjs
npm run lint
```

For red/green comparison, retrieve the live function source read-only into an
isolated file and run `RECEPTION_OPERATIONS_SOURCE=/path/to/source.ts node
--test tests/reception-operator-appointment-guard.test.mjs`. Never supply real
tokens or run the fixture against a real database. The fixture transpiles and
executes the actual handler; all auth and database operations are simulated.

Local repaired results: **19/19 new cases**, **156/156 combined cases**,
TypeScript check and `git diff --check` passed. The existing CI workflow now
also triggers on operations-admin and its regression test.

## Remaining acceptance work

These results do not prove live Supabase/PostgREST behavior, real login/RLS,
real browser operator flows, notifications, calendar booking or Stripe payment.
Only a live Stripe account is connected and Reception has no test branch.
An isolated acceptance environment remains necessary before a production release.

Appointment completion, lead conversion and audit insertion are still separate
database operations. A payment created concurrently with the preflight lookup
also requires a separate atomic database contract; this repair does not claim
to solve that race. Workflow retries and payment creation remain separate audit
scope. No migration, release, booking, customer message or payment was performed.
