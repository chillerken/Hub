import { test, expect, type Page } from '@playwright/test';

const RECEPTION_HOST = '#reception-ai-widget';
const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const CHAT_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-reception-chat';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';

async function acceptCookieBannerIfPresent(page: Page) {
  const names = [
    /alles accepteren/i,
    /accepteer alles/i,
    /^accepteren$/i,
    /accept all/i,
    /^accept$/i,
  ];

  for (const name of names) {
    const button = page.getByRole('button', { name }).first();
    if (await button.isVisible({ timeout: 1200 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(800);
      return;
    }
  }
}

test('Reception AI is de actieve LuxWash website-assistent', async ({ page, request }) => {
  // Validate the real production token/config without creating a CRM lead.
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(configResponse.ok()).toBeTruthy();

  const config = await configResponse.json();
  expect(config?.error).toBeFalsy();
  expect(config?.business_name).toBeTruthy();

  // Intercept only the chat POST. This exercises the real widget UI without
  // creating a synthetic lead/conversation in production.
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
  await acceptCookieBannerIfPresent(page);

  const host = page.locator(RECEPTION_HOST);
  await expect(host).toHaveCount(1, { timeout: 30_000 });

  const launcher = host.locator('.rai-launcher');
  await expect(launcher).toBeVisible({ timeout: 20_000 });

  // Detect duplicate legacy/native assistants. Reception AI must be the
  // single customer-facing assistant, not one of two competing launchers.
  const nativeLegacyLaunchers = page.locator('.lux-chat-launcher');
  const legacyCount = await nativeLegacyLaunchers.count();
  expect(
    legacyCount,
    'Legacy/native LuxWash AI launcher is still present next to Reception AI'
  ).toBe(0);

  await launcher.click();

  const panel = host.locator('.rai-panel');
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(panel).toBeVisible();

  await expect(host.locator('.rai-title strong')).not.toHaveText('');

  const input = host.locator('.rai-input');
  await expect(input).toBeEnabled();
  await input.fill('E2E test: werkt Reception AI?');
  await host.locator('.rai-send').click();

  await expect(
    host.getByText('E2E OK — Reception AI antwoordt correct.')
  ).toBeVisible({ timeout: 15_000 });
});
