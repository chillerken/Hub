import { test, expect, type Page } from '@playwright/test';

const WIDGET_HOST = '#reception-ai-widget';

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

test('LuxWash Reception AI is zichtbaar en beantwoordt een echte prijs-vraag', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await acceptCookieBannerIfPresent(page);

  const host = page.locator(WIDGET_HOST);
  await expect(host).toHaveCount(1, { timeout: 30_000 });

  const launcher = host.locator('.rai-launcher');
  await expect(launcher).toBeVisible({ timeout: 20_000 });
  await launcher.click();

  const panel = host.locator('.rai-panel');
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(panel).toBeVisible();

  const input = host.locator('.rai-input');
  const send = host.locator('.rai-send');
  await expect(input).toBeEnabled();

  await input.fill('Wat kost een mobiele carwash voor een sedan?');
  await send.click();

  const aiReplies = host.locator('.rai-row.ai .rai-bubble');
  await expect.poll(
    async () => aiReplies.count(),
    { timeout: 45_000, message: 'Reception AI gaf geen antwoord binnen 45 seconden.' }
  ).toBeGreaterThan(1);

  const reply = aiReplies.last();
  await expect(reply).not.toContainText(/dat lukte even niet|verbinding mislukt|tijdelijk niet beschikbaar/i);
  await expect(reply).toContainText(/(?:€\s*)?49|49\s*euro/i);
});
