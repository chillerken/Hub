import { chromium } from "playwright";
import fs from "node:fs/promises";

const SITE_URL = process.env.SITE_URL || "https://www.luxwash.online/";
const WIDGET_TOKEN =
  process.env.WIDGET_TOKEN || "597f9789-be65-4ab8-bdbe-276f696991f1";

const CONFIG_URL =
  "https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-widget-config";
const CHAT_URL =
  "https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/public-reception-chat";

await fs.mkdir("test-results", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "nl-BE",
});
const page = await context.newPage();

const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
page.on("console", (msg) => {
  if (msg.type() === "error") browserErrors.push(msg.text());
});

try {
  // 1) Verify the real public widget config API accepts the production token.
  const configResponse = await context.request.post(CONFIG_URL, {
    data: { widget_token: WIDGET_TOKEN },
    headers: { "Content-Type": "application/json" },
  });

  if (!configResponse.ok()) {
    throw new Error(
      `Widget config API failed: ${configResponse.status()} ${await configResponse.text()}`
    );
  }

  const config = await configResponse.json();
  if (!config || config.error || !config.business_name) {
    throw new Error(
      `Widget config invalid: ${JSON.stringify(config).slice(0, 1000)}`
    );
  }

  // 2) Mock only the chat reply so CI never creates real CRM leads.
  await page.route(CHAT_URL, async (route) => {
    if (route.request().method() !== "POST") return route.continue();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply:
          "E2E OK — Reception AI kan berichten ontvangen en antwoorden tonen.",
        business_name: config.business_name,
        receptionist_name: config.receptionist_name || "AI Assistente",
        lead_id: "e2e-smoke-lead",
        conversation_id: "e2e-smoke-conversation",
        contact_capture: { required: false },
      }),
    });
  });

  // 3) Load the real LuxWash production site.
  await page.goto(SITE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  // Give Wix/custom embeds time to hydrate.
  await page.waitForTimeout(2500);

  const host = page.locator("#reception-ai-widget");
  await host.waitFor({ state: "attached", timeout: 30_000 });

  const launcher = host.locator(".rai-launcher");
  await launcher.waitFor({ state: "visible", timeout: 15_000 });
  await launcher.click();

  const panel = host.locator(".rai-panel");
  await panel.waitFor({ state: "visible", timeout: 10_000 });

  // 4) Confirm real config was rendered into the widget.
  const title = await host.locator(".rai-title strong").textContent();
  if (!title || !title.trim()) {
    throw new Error("Reception AI title did not render.");
  }

  // 5) Exercise the full send/render UI safely with the mocked reply.
  const input = host.locator(".rai-input");
  await input.fill("E2E test: werkt de Reception AI-widget?");
  await host.locator(".rai-send").click();

  const expectedReply = host.getByText(
    "E2E OK — Reception AI kan berichten ontvangen en antwoorden tonen."
  );
  await expectedReply.waitFor({ state: "visible", timeout: 15_000 });

  await page.screenshot({
    path: "test-results/reception-ai-e2e.png",
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        site: SITE_URL,
        business: config.business_name,
        receptionist: config.receptionist_name || null,
        widgetMounted: true,
        launcherVisible: true,
        panelOpened: true,
        messageRendered: true,
        browserErrors,
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({
      path: "test-results/reception-ai-e2e-failure.png",
      fullPage: true,
    })
    .catch(() => {});

  console.error("Reception AI E2E FAILED");
  console.error(error);
  if (browserErrors.length) {
    console.error("Browser errors:", browserErrors);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
