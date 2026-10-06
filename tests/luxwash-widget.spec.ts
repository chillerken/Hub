import { test, expect } from '@playwright/test';

const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';

test('diagnose LuxWash native AI button', async ({ page, request }) => {
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(configResponse.ok()).toBeTruthy();

  const interestingRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/ai|chat|reception|supabase|assistant/i.test(url)) interestingRequests.push(url);
  });

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const nativeButton = page.getByRole('button', { name: /praat met ai assistente/i });
  await expect(nativeButton).toBeVisible({ timeout: 30_000 });

  console.log('NATIVE_AI_BUTTON_HTML', await nativeButton.evaluate((el) => el.outerHTML));

  await nativeButton.click();
  await page.waitForTimeout(2500);

  const snapshot = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };

    return {
      url: location.href,
      dialogs: Array.from(document.querySelectorAll('[role="dialog"]'))
        .filter(visible)
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1500)),
      textareas: Array.from(document.querySelectorAll('textarea'))
        .filter(visible)
        .map((el) => ({
          placeholder: el.getAttribute('placeholder'),
          aria: el.getAttribute('aria-label'),
        })),
      inputs: Array.from(document.querySelectorAll('input'))
        .filter(visible)
        .map((el) => ({
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
          aria: el.getAttribute('aria-label'),
        }))
        .slice(0, 30),
      aiButtons: Array.from(document.querySelectorAll('button,a,[role="button"]'))
        .filter(visible)
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /ai|chat|assistent/i.test(t))
        .slice(0, 30),
      receptionHost: Boolean(document.getElementById('reception-ai-widget')),
      deferredLauncher: Boolean(document.getElementById('reception-ai-direct-launcher')),
    };
  });

  console.log('AFTER_NATIVE_AI_CLICK', JSON.stringify(snapshot, null, 2));
  console.log('INTERESTING_REQUESTS', JSON.stringify([...new Set(interestingRequests)], null, 2));

  await page.screenshot({ path: 'test-results/native-ai-after-click.png', fullPage: true });

  // Diagnostic succeeds once the real button can be clicked; the log tells us
  // what implementation is currently wired to it.
  expect(snapshot.url).toBeTruthy();
});
