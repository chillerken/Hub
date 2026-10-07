-- Align Reception AI SaaS catalog with the live Stripe prices introduced in October 2026.
-- Stripe products remain Start/Growth/Pro and are billed monthly with tax_behavior=exclusive.
-- Live Payment Links use Automatic Tax, required billing address and tax ID collection.

update public.reception_ai_plan_catalog
set monthly_cents=24900,
    currency='EUR',
    payment_link_url='https://buy.stripe.com/fZu00kcbv0h979YcaW6EU0a',
    updated_at=now()
where plan='starter';

update public.reception_ai_plan_catalog
set monthly_cents=39900,
    currency='EUR',
    payment_link_url='https://buy.stripe.com/6oUdRa0sN7JB79Y7UG6EU0b',
    updated_at=now()
where plan='pro';

update public.reception_ai_plan_catalog
set monthly_cents=59900,
    currency='EUR',
    payment_link_url='https://buy.stripe.com/dRmeVegrL1ld8e23Eq6EU0c',
    updated_at=now()
where plan='business';
