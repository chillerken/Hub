# Reception AI: atomic appointment completion

Review branch based on PR #43 (`8aa134070d827f9fb25d63538bc2d2286898a3fb`).
No production migration or function deployment is authorized by this document.

## Reproduction and scope

The prior HTTP handler used separate calls for payment lookup, appointment
completion, lead conversion and audit. A payment can be inserted after the
lookup without changing the appointment version. Appointment CAS therefore
does not prevent this race. An error in the later lead/audit call also leaves
the already committed appointment completed.

The database contract fixture replays the first sequence in real PostgreSQL,
then tests the repair using two independent connections and verifies an actual
database lock wait via pg_stat_activity. Synthetic rows are not production
integration evidence.

## Change

`complete_reception_appointment` is one transaction: verify active owner/admin,
lock the tenant appointment, check the expected version and slot, check unpaid
requests, complete, convert the lead and insert audits. Any statement/trigger
error rolls back the entire RPC. The function is SECURITY INVOKER, has an empty
search_path and is executable only by service_role, not anon/authenticated.

A BEFORE INSERT/UPDATE payment trigger locks associated appointments in UUID
order using FOR NO KEY UPDATE. This serializes payment writers with completion
while remaining compatible with foreign-key KEY SHARE locks. It also rejects
links to another tenant or another appointment lead. Existing payment/appointment
lifecycle triggers remain installed. Production metadata was inspected read-only;
there were zero mismatched existing linked payments.

The handler retains authentication, role checks, response shape, payment-conflict
code and PR #43 snapshot safeguards. Missing RPC returns 503; malformed/empty
RPC results return 500. Neither falls back to separate updates or claims success.

**Existing business behavior retained:** invoices may be intentionally created
after a completed appointment. Payment-first ordering blocks completion;
completion-first ordering makes the later payment write wait, then permits the
post-completion invoice. This is not a blanket invariant that every completed
appointment must forever have no pending invoices.

RPC execution requires READ COMMITTED so the post-lock payment query sees writes
committed while it waited. Older snapshot levels fail closed. This is the normal
Data API isolation setting but must be checked in the isolated release acceptance.

## Verification

- 22 isolated actual-handler tests pass; auth/RPC persistence are fixtures.
- The actual migration compiles in local embedded PostgreSQL (PGlite); this
  proves syntax, not independent-connection locking.
- `tests/reception-atomic-completion.pg.mjs` runs in CI with disposable PostgreSQL
  17. Cases cover the legacy counterexample, atomic success, unpaid/paid requests,
  authorization/tenant separation, stale/repeated actions, audit failure rollback,
  grants/search_path, payment-link validation, snapshot isolation, and both
  two-session orderings. Use CI results to assess this contract.

The runner refuses any host other than loopback and any database name other than
`reception_disposable`. There are no Stripe keys, customer messages or booking calls.

```sh
npm ci --ignore-scripts
node --test tests/reception-operator-appointment-guard.test.mjs
# Only on a new disposable local PostgreSQL database:
npm install --prefix /tmp/reception-pg-runtime --ignore-scripts --package-lock=false pg@8.23.1
PGHOST=127.0.0.1 PGDATABASE=reception_disposable RECEPTION_PG_MODULE_ROOT=/tmp/reception-pg-runtime node --test tests/reception-atomic-completion.pg.mjs
```

## Release boundary

Apply and accept the migration in an isolated environment before deploying the
new handler; otherwise completion deliberately returns 503. Rehearse against
the full schema and existing lifecycle/activation triggers, auth/RLS, REST/RPC,
operator browser flows, webhooks and notification queues. CI's minimal schema
does not prove those production integrations. Publication gates remain active.

Migration was generated with Supabase CLI 2.120.0 `migration new`, not executed
on either connected Supabase project. Rollback code uses the prior handler and
removes only the newly introduced trigger/functions after confirming no active
calls; it must not delete appointments, payments, leads or audits. Production
changes require separate explicit approval.
