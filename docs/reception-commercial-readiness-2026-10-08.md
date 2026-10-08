# Reception AI: commercial readiness

Offer: a guided 14-day pilot followed by a separately accepted monthly subscription. Trial expiry does not trigger a payment. Prices excluding VAT: Start €249/month + €299 installation, Growth €399/month + €499 installation, Pro €599/month + €750 installation.

## Customer launch

1. Customer creates and confirms their own business account.
2. Verify company details, services, prices, opening hours, escalation contact and allowed website domains.
3. Install the tenant's widget using the code from its receptionist settings.
4. Connect integrations only to the customer's own provider accounts. Verify consent, notifications, availability and payment references before enabling related automation.
5. Test a normal question, an unknown question, an appointment request and a human handoff on the customer's website.
6. Review pilot metrics with the customer. Prepare subscription checkout from their authenticated billing screen.

Provider charges are separate. An appointment request does not promise availability or a confirmed booking. Marketing content requires approval before publication.

## Verified in production on 2026-10-08

Runner-authenticated commercial_readiness test returned HTTP 200, ok:true; test ID 96035f55-e3dd-4180-9004-c9893b5e5c38. A fresh isolated customer account passed authentication, tenant isolation, profile configuration, widget configuration and domain restriction, real AI response, appointment request and deduplication, human handoff, CRM persistence, contact consent, authenticated tenant-bound checkout preparation, and expired-trial chat/widget rejection. Test user and organization were removed.

Three local access/escaping tests pass. The prior workflow runner and signed Stripe webhook tests are retained separately. Signup invitations can only be claimed automatically by a confirmed matching email; ordinary signup now initializes the invitation record safely.

## Remaining acceptance boundary

No live charge was made and no external message was sent by the readiness test. Preparing checkout does not prove payment completion. Before advertising fully unattended activation, verify a completed Stripe checkout through its signed webhook and resulting customer subscription state. Validate each customer-specific messaging/calendar integration before promising autonomous delivery.
