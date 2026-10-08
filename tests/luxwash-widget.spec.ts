import { test, expect } from '@playwright/test';

const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const CHAT_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-reception-chat';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';
const WIDGET_URL = 'https://ai.luxwash.online/widget.js';
const FALLBACK_WIDGET_URL = 'https://reception-ai-luxwash.onrender.com/widget.js';

test('LuxWash laadt uitsluitend de echte Reception AI widget', async ({ page, request }) => {
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.luxwash.online',
    },
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
  const legacyLaunchers = page.locator('.lux-chat-launcher');
  if (await legacyLaunchers.count()) {
    console.log('LEGACY_LAUNCHER_HTML', await legacyLaunchers.first().evaluate((el) => el.outerHTML));
  }
  await expect(
    legacyLaunchers,
    'Legacy LuxWash launcher must be removed by the active Reception AI build'
  ).toHaveCount(0, { timeout: 10_000 });
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


test('Publieke smoke-bypass blijft veilig uitgeschakeld', async ({ request }) => {
  const response = await request.post(CHAT_URL, {
    data: {
      widget_token: WIDGET_TOKEN,
      message: 'security regression check',
      smoke_test: true,
      smoke_id: 'gha-security-check',
    },
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.luxwash.online',
    },
  });
  const body = await response.json();
  expect(response.status()).toBe(404);
  expect(body?.error).toBe('Smoke test endpoint disabled');
});


test('Onbekende widget-origin wordt geweigerd', async ({ request }) => {
  const response = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
    },
  });
  const body = await response.json();
  expect(response.status()).toBe(403);
  expect(body?.error).toBe('Deze widget is niet toegestaan op dit domein.');
});

test('Ontbrekende widget-origin wordt geweigerd', async ({ request }) => {
  const response = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(response.status()).toBe(403);
});

test('Chat-endpoint weigert onbekende origin vóór CRM-writes', async ({ request }) => {
  const response = await request.post(CHAT_URL, {
    data: {
      widget_token: WIDGET_TOKEN,
      message: 'boundary test',
    },
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
    },
  });
  const body = await response.json();
  expect(response.status()).toBe(403);
  expect(body?.error).toBe('Deze widget is niet toegestaan op dit domein.');
});


test('Actieve Cloudflare-widget blijft bereikbaar en mount Reception AI', async ({ request }) => {
  const response = await request.get(WIDGET_URL, { timeout: 30_000 });
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toContain('reception-ai-widget');
  expect(source).toContain('/public-widget-config');
  expect(source).toContain('/public-reception-chat');
});


test('Render-failover bevat de geharde LuxWash legacy-cleanup', async ({ request }) => {
  const response = await request.get(FALLBACK_WIDGET_URL, { timeout: 30_000 });
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toContain('shouldRemoveLuxWashLegacy');
  expect(source).toContain('.lux-chat,.lux-chat-launcher,.lux-chat-entry');
  expect(source).toContain('MutationObserver');
});


test('LuxWash boekingspagina mobiel: bereikbaar, canoniek en zonder horizontale overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/boeken', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'Vraag je prijs aan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aanvraag versturen' })).toBeVisible();

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBe('https://www.luxwash.online/boeken');

  const sharingImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(sharingImage).toMatch(/^https:\/\/www\.luxwash\.online\//);

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, 'De mobiele boekingspagina mag niet horizontaal scrollen')
    .toBeLessThanOrEqual(dimensions.viewport + 2);

  // This test intentionally does not submit a booking or touch customer/CRM data.
});

test('LuxWash kernpagina’s zijn live en hebben hun eigen canonical en OpenGraph image', async ({ request }) => {
  for (const route of ['/prijzen', '/mobiele-carwash', '/meubelreiniging', '/regio-aalst', '/regio-lede', '/regio-erpe-mere']) {
    const response = await request.get(route, { timeout: 30_000 });
    expect(response.status(), `${route} moet HTTP 200 geven`).toBe(200);
    const html = await response.text();
    expect(html).toContain(`https://www.luxwash.online${route}`);
    expect(html).toMatch(/property=["']og:image["']/);
    expect(html).toMatch(/rel=["']canonical["']/);
  }
});
