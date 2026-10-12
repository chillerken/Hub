# Reception AI server date context

On 12 October 2026 the public browser demo answered a question containing
"morgen" with "Morgen is het zaterdag". Tomorrow in Europe/Brussels was Tuesday
13 October. The reply did correctly reserve definitive appointment confirmation
for staff, but its day-of-week claim was wrong.

Inspection of deployed public-demo-chat v5 showed no current date or timezone in
its model instructions. Tenant public-reception-chat also lacked date context.
Both now receive the server's full date, including weekday, in Europe/Brussels,
and a rule to interpret relative dates against it. This is grounding, not a
guarantee that a model will never make a calendar mistake or know live availability.

The demo source is copied from the deployed v5 into the existing Hub repository
for review. Its existing rate-limit writes are preserved; it does not create
CRM leads, appointments or customer messages. No live function was changed.

Actual transpiled-handler tests capture outgoing provider payloads at
2026-12-31 23:30 UTC and require Friday 1 January 2027 in Brussels. The demo
regression failed before the change and passes after it. Tenant tests also
exercise the provider branch without modifying any appointment. AI and database
responses are mocked; no provider request escapes those fixtures.

A controlled release and live relative-date retest remain required. No deployment,
migration, customer message, actual booking or payment was performed.
