# Reception AI — confirmed appointment protection

Baseline: `bd31560f2d58e6bb9159624ae3c772a885d6b9a3`.

## Proven problem

The public chat selected `requested`, `proposed` **and `confirmed`** appointments
for a visitor's lead. A subsequent booking message containing a date updated
`start_at`, `end_at` and `requested_text` on that same confirmed record, leaving its
status confirmed. This bypassed operator confirmation for the changed time.
The same selection was observed in deployed `public-reception-chat` v39.

Reproduction: an isolated fixture with a confirmed appointment on 15 January 2030
at 13:00 Brussels receives `Ik wil een afspraak boeken op 16/01/2030 om 14u30`.
The original handler moved the confirmed appointment to 16 January at 14:30.
No production customer, booking, calendar or message was changed during reproduction.

## Change

Only pending (`requested` / `proposed`) appointments are reused. If the visitor
already has a confirmed appointment, a separate `requested` record is created
for operator review. The original confirmed appointment remains intact.
Updates also constrain organization, lead and pending status in the write query.
If an operator confirmed the selected request in the meantime, the handler
returns HTTP 409 and leaves that appointment unchanged.

## Evidence and limits

`node --test tests/reception-public-appointment-guard.test.mjs` exercises the
actual transpiled HTTP handler against isolated persistence: confirmed slot
protection, pending refinement, repeated messages, cross-tenant conversation
rejection and concurrent confirmation. Two tests failed on the baseline;
all six pass after the fix. External fetches are forbidden in this fixture.

This is handler-level integration evidence with mocked persistence, not a
deployed Supabase/PostgreSQL acceptance test. The broader existing Reception AI
Node suite is run separately. No production deployment or migration is authorized
by this change. Existing appointment confirmation, calendar integration and
notifications require acceptance in an isolated tenant before release.

## Reviewable release

1. Review the branch and CI result.
2. Obtain approval for a controlled Edge Function release.
3. Preserve the previous v39 bundle for rollback.
4. Test with an isolated tenant: request -> operator confirmation -> new requested
   time leaves original confirmed slot intact -> operator explicitly decides.
5. Verify the existing confirmation and calendar workflow does not auto-confirm
   the new request. Run desktop/mobile acceptance and monitor errors.

The date parser's DST and midnight handling and concurrent duplicate inserts
remain separate audit items; this PR does not claim to solve them.
