-- Align Reception AI SaaS catalog with the final October 2026 live Stripe pricing.
-- Each live checkout contains one recurring monthly item plus one one-time setup/onboarding item.
-- Automatic Tax, required billing address and tax ID collection are configured on the Stripe Payment Links.

update public.reception_ai_plan_catalog
set monthly_cents=24900,
    setup_cents=29900,
    currency='EUR',
    payment_link_url='https://buy.stripe.com/14AdRa6Rb4xp51QcaW6EU0g',
    updated_at=now()
where plan='starter';

update public.reception_ai_plan_catalog
set monthly_cents=39900,
    setup_cents=49900,
    currency='EUR',
    payment_link_url='https://buy.stripe.com/7sY6oIfnH6Fx3XMcaW6EU0h',
    updated_at=now()
where plan='pro';

update public.reception_ai_plan_catalog
set monthly_cents=59900,
    setup_cents=75000,
    currency='EUR',
    payment_link_url='https://buy.stripe.com/7sY7sM2AV8NF51Q2Am6EU0i',
    updated_at=now()
where plan='business';
