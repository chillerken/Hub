import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.RECEPTION_AI_BASE_URL || 'https://ai.luxwash.online/';

test.describe('Reception AI custom-domain production', () => {
  test.use({ baseURL: BASE_URL });

  test('landing page, canonical and public assets are healthy', async ({ page, request }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const response = await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response?.ok()).toBeTruthy();

    await expect(page).toHaveTitle(/Reception AI/i);
    await expect(page.locator('h1').first()).toContainText(/websitebezoeker|Reception AI/i);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', 'https://ai.luxwash.online/');

    await expect(page.getByText('Start', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Growth', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pro', { exact: true }).first()).toBeVisible();

    for (const path of ['/robots.txt', '/sitemap.xml', '/social-card.svg']) {
      const asset = await request.get(new URL(path, BASE_URL).toString());
      expect(asset.ok(), path).toBeTruthy();
    }

    expect(pageErrors).toEqual([]);
  });

  test('auth entry point renders without creating data', async ({ page }) => {
    const response = await page.goto('/?auth=1', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response?.ok()).toBeTruthy();

    await expect(page.getByRole('heading', { name: /Welkom bij Reception AI|Start uw Reception AI-onboarding/i })).toBeVisible();
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#signup')).toBeVisible();
  });
});
