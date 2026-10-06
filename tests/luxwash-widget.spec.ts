import { test, expect, type Page } from '@playwright/test';

const WIDGET_HOST = '#reception-ai-widget';
const DEFERRED_LAUNCHER = '#reception-ai-direct-launcher';
const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const CHAT_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-reception-chat';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';

async function acceptCookieBannerIfPresent(page: Page) {
  const candidates = [
    /alles accepteren/i,
    /accepteer alles/i,
    /^accepteren$/i,
    /accept all/i,
    /^accept$/i,
  ];

  for (const name of candidates) {
    const button = page.getByRole('button', { name }).first();
    if (await button.isVisible({ timeout: 800 }).catch(() => false)) {
      await button.click();
      return;
    }
  }
}

test('LuxWash Reception AI opent via deferred launcher zonder CRM-testlead', async ({ page, request }) => {
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  expect(config?.error).toBeFalsy();
  expect(config?.business_name).toBeTruthy();

  await page.route(CHAT_URL, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: 'E2E OK — Reception AI kan berichten ontvangen en antwoorden tonen.',
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

  // The lightweight first-party launcher must be present without loading
  // Reception AI from the third-party host before a visitor explicitly clicks.
  const deferredLauncher = page.locator(DEFERRED_LAUNCHER);
  await expect(deferredLauncher).toBeVisible({ timeout: 30_000 });
  await deferredLauncher.click();

  // Clicking the launcher explicitly loads widget.js and opens the panel.
  const host = page.locator(WIDGET_HOST);
  await expect(host).toHaveCount(1, { timeout: 30_000 });

  const panel = host.locator('.rai-panel');
  await expect(panel).toHaveAttribute('data-open', 'true', { timeout: 20_000 });
  await expect(panel).toBeVisible();

  const title = host.locator('.rai-title strong');
  await expect(title).not.toHaveText('');

  const input = host.locator('.rai-input');
  const send = host.locator('.rai-send');
  await expect(input).toBeEnabled();

  await input.fill('E2E test: werkt de Reception AI-widget?');
  await send.click();

  await expect(
    host.getByText('E2E OK — Reception AI kan berichten ontvangen en antwoorden tonen.')
  ).toBeVisible({ timeout: 15_000 });
});
