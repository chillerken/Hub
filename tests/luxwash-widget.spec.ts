import { test, expect } from '@playwright/test';

const CONFIG_URL =
  'https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config';
const WIDGET_TOKEN = '597f9789-be65-4ab8-bdbe-276f696991f1';

test('diagnose LuxWash native AI button and chatbot backend', async ({ page, request }) => {
  const configResponse = await request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(configResponse.ok()).toBeTruthy();

  const chatbotResponse = await request.get('/chatbot.js');
  expect(chatbotResponse.ok()).toBeTruthy();
  const chatbotJs = await chatbotResponse.text();

  const absoluteUrls = [...new Set(
    chatbotJs.match(/https?:\/\/[^"'\x60\s)]+/g) || []
  )];

  const backendLines = chatbotJs
    .split('\n')
    .map((line, index) => ({ n: index + 1, line: line.trim() }))
    .filter(({ line }) =>
      /fetch\s*\(|supabase|functions\/v1|endpoint|api\b|chat\b|assistant|bot/i.test(line)
    )
    .slice(0, 160);

  console.log('CHATBOT_JS_LENGTH', chatbotJs.length);
  console.log('CHATBOT_ABSOLUTE_URLS', JSON.stringify(absoluteUrls, null, 2));
  console.log('CHATBOT_BACKEND_LINES', JSON.stringify(backendLines, null, 2));

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
  await page.waitForTimeout(1500);

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
      visibleInputs: Array.from(document.querySelectorAll('input,textarea'))
        .filter(visible)
        .map((el) => ({
          tag: el.tagName,
          placeholder: el.getAttribute('placeholder'),
          aria: el.getAttribute('aria-label'),
        })),
      receptionHost: Boolean(document.getElementById('reception-ai-widget')),
    };
  });

  console.log('AFTER_NATIVE_AI_CLICK', JSON.stringify(snapshot, null, 2));
  console.log('INTERESTING_REQUESTS', JSON.stringify([...new Set(interestingRequests)], null, 2));

  expect(snapshot.dialogs.some((t) => /AI Assistente · LuxWash/i.test(t))).toBeTruthy();
});
