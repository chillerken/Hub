import { test, expect } from '@playwright/test';

const AI_OS = 'https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/luxwash-ai-os';

test('LuxWash AI OS gezondheidsendpoint blijft beschikbaar', async ({ request }) => {
  const response = await request.get(AI_OS + '/health', { timeout: 30_000 });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.service).toBe('luxwash-ai-os');
});

test('LuxWash AI OS dashboard vereist een geldige sessie', async ({ request }) => {
  const response = await request.get(AI_OS + '/', { timeout: 30_000 });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Beveiligde bedrijfscockpit');
  expect(html).not.toContain('id="execk"');
});

test('LuxWash AI OS snapshot geeft anoniem geen klantgegevens prijs', async ({ request }) => {
  const response = await request.get(AI_OS + '/api/snapshot', { timeout: 30_000 });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBe('unauthorized');
});
