import { test, expect } from '@playwright/test';

const CUSTOM_URL = process.env.RECEPTION_AI_BASE_URL || 'https://ai.luxwash.online/';
const FALLBACK_URL = process.env.RECEPTION_AI_FALLBACK_URL || 'https://reception-ai-luxwash.onrender.com/';

test.describe('Reception AI production verification', () => {
  test('custom domain serves the production landing over HTTPS', async ({ page }) => {
    const response = await page.goto(CUSTOM_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    expect(response, 'Expected an HTTP response from the custom domain').toBeTruthy();
    expect(response!.status(), 'Custom domain must return a successful status').toBeLessThan(400);

    await expect(page).toHaveTitle(/Reception AI/i);
    await expect(page.locator('h1').first()).toContainText(/websitebezoeker|Reception AI/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ai.luxwash.online/');

    const url = new URL(page.url());
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('ai.luxwash.online');
  });

  test('critical public assets are available on the custom domain', async ({ request }) => {
    for (const path of ['/robots.txt', '/sitemap.xml', '/social-card.svg']) {
      const response = await request.get(new URL(path, CUSTOM_URL).toString(), {
        timeout: 30_000,
      });
      expect(response.status(), path).toBeLessThan(400);
      expect((await response.body()).byteLength, path + ' should not be empty').toBeGreaterThan(20);
    }
  });

  test('authentication entry point renders without creating data', async ({ page }) => {
    const response = await page.goto(new URL('/?auth=1', CUSTOM_URL).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: /Welkom bij Reception AI|Start uw Reception AI-onboarding/i })).toBeVisible();
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#signup')).toBeVisible();
  });

  test('Render fallback stays healthy and declares the branded canonical URL', async ({ request }) => {
    const response = await request.get(FALLBACK_URL, { timeout: 30_000 });
    expect(response.status()).toBeLessThan(400);
    const html = await response.text();
    expect(html).toContain('Reception AI');
    expect(html).toContain('<link rel="canonical" href="https://ai.luxwash.online/"/>');
  });

  test('static HTML remains useful to crawlers before JavaScript executes', async ({ request }) => {
    const response = await request.get(FALLBACK_URL, { timeout: 30_000 });
    const html = await response.text();
    expect(html).toContain('<h1>Van websitebezoeker naar opgevolgde lead met Reception AI.</h1>');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('€249/maand');
    expect(html).toContain('€399/maand');
    expect(html).toContain('€599/maand');
    expect(html).toContain('Eenmalige setup &amp; onboarding: €299');
    expect(html).toContain('Eenmalige setup &amp; onboarding: €499');
    expect(html).toContain('Eenmalige setup &amp; onboarding: €750');
  });
});
