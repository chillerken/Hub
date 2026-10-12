# Brussels appointment preference parsing

Baseline: a10db28d2c700a289db00449a8e30ed9b0e23dd3.

The existing parser checked a +02:00 instant's UTC date against its local date,
rejecting legitimate 00:30/01:30 preferences. It also used the first dotted
number pair as a clock, so 16.01.2030 became 16:01 even without a time. DST
selection compared a local wall-clock value against a UTC boundary and accepted
nonexistent/ambiguous times without checking the timezone round trip.

Fourteen isolated parser regressions were added first; the baseline failed on
midnight, dotted dates, transition offsets and DST gaps/overlaps. The corrected
parser removes the date before parsing a clock, validates calendar and clock
ranges separately, derives offsets through Intl Europe/Brussels and accepts
only a unique matching instant. Invalid/missing/ambiguous preferences remain
text-only requests for human clarification. No time is guessed or confirmed.

Actual HTTP-handler tests verify that midnight reaches a requested appointment,
and that unclear preferences create requested records without invented start/end
timestamps. Existing confirmed-appointment and tenant protections are retained.
These tests use isolated mocked persistence, not production acceptance evidence.

No deployment, database migration or customer/calendar action performed. A
controlled Deno/Supabase acceptance environment remains necessary before release.
Concurrent duplicate inserts and pending-request date refinements are separate
audit items; this patch does not claim atomic request processing.
