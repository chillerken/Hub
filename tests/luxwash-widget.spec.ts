import { test, expect } from '@playwright/test';

const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const CHAT_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-reception-chat';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';

test('LuxWash gebruikt één Reception AI launcher en opent de echte widget', async ({ page, request }) => {
  // Validate real production widget configuration.
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  expect(config?.error).toBeFalsy();
  expect(config?.business_name).toBeTruthy();

  // Prevent a synthetic CI test from creating a real CRM lead.
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

  const directLauncher = page.locator('#reception-ai-direct-launcher');
  await expect(directLauncher).toHaveCount(1, { timeout: 30_000 });
  await expect(directLauncher).toBeVisible();

  // No competing legacy/native assistant may remain customer-facing.
  await expect(page.locator('.lux-chat-launcher')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.lux-chat')).toHaveCount(0, { timeout: 10_000 });

  await directLauncher.click();

  const host = page.locator('#reception-ai-widget');
  await expect(host).toHaveCount(1, { timeout: 30_000 });

  const panel = host.locator('.rai-panel');
  await expect(panel).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  await expect(panel).toBeVisible();

  await expect(page.locator('#reception-ai-direct-launcher')).toHaveCount(0);

  const input = host.locator('.rai-input');
  await expect(input).toBeEnabled();

  await input.fill('E2E test: werkt Reception AI?');
  await host.locator('.rai-send').click();

  await expect(
    host.getByText('E2E OK — Reception AI antwoordt correct.')
  ).toBeVisible({ timeout: 15_000 });
});
