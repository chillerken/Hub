import { test, expect } from '@playwright/test';

const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const CHAT_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-reception-chat';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';

test('LuxWash laadt uitsluitend de echte Reception AI widget', async ({ page, request }) => {
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(configResponse.ok()).toBeTruthy();

  const config = await configResponse.json();
  expect(config?.error).toBeFalsy();
  expect(config?.business_name).toBeTruthy();

  // Keep CI out of the production CRM while exercising the full widget UI.
  await page.route(CHAT_URL, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: 'E2E OK — Reception AI antwoordt correct.',
        business_name: config.business_name,
        receptionist_name: config.receptionist_name || 'AI Assistente',
        lead_id: 'e2e-smoke-lead',
        conversation_id: 'e2e-smoke-conversation',
        contact_capture: { required: false },
      }),
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // The static LuxWash loader should mount Reception AI directly.
  const host = page.locator('#reception-ai-widget');
  await expect(host).toHaveCount(1, { timeout: 30_000 });

  // There must be no competing old LuxWash chatbot UI.
  await expect(page.locator('.lux-chat-launcher')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.lux-chat')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.lux-chat-entry')).toHaveCount(0, { timeout: 10_000 });

  const launcher = host.locator('.rai-launcher');
  await expect(launcher).toBeVisible({ timeout: 20_000 });
  await launcher.click();

  const panel = host.locator('.rai-panel');
  await expect(panel).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  await expect(panel).toBeVisible();

  const input = host.locator('.rai-input');
  await expect(input).toBeEnabled();
  await input.fill('E2E test: werkt Reception AI?');
  await host.locator('.rai-send').click();

  await expect(
    host.getByText('E2E OK — Reception AI antwoordt correct.')
  ).toBeVisible({ timeout: 15_000 });
});


test('LuxWash echte production AI smoke test zonder CRM-vervuiling', async ({ request }) => {
  const smokeId = 'gha-' + Date.now();
  const response = await request.post(CHAT_URL, {
    data: {
      widget_token: WIDGET_TOKEN,
      message: 'Production smoke test: antwoord uitsluitend kort dat de AI-receptionist bereikbaar is.',
      smoke_test: true,
      smoke_id: smokeId,
    },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body?.smoke_test).toBe(true);
  expect(body?.smoke_id).toBe(smokeId);
  expect(body?.business_name).toBeTruthy();
  expect(body?.reply?.length).toBeGreaterThan(4);
  expect(body?.lead_id).toBeUndefined();
  expect(body?.conversation_id).toBeUndefined();
});
