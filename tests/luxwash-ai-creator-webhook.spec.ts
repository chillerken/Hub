import { test, expect } from '@playwright/test';

const WEBHOOK = 'https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/ai-creator-stripe-webhook';

test('AI Creator Stripe webhook rejects GET without processing payment', async ({ request }) => {
  const res = await request.get(WEBHOOK, { timeout: 30_000 });
  expect(res.status()).toBe(405);
  expect(await res.text()).toBe('method');
});

test('AI Creator Stripe webhook refuses a request without Stripe-Signature', async ({ request }) => {
  // No signature, no valid event, no payment writes.
  const res = await request.post(WEBHOOK, {
    data: '{}',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toBe('bad signature');
});
