const { test, expect } = require("@playwright/test");

test("public landing page loads and exposes the main navigation", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Reception AI/i);
  await expect(page.locator("#app h1").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /inloggen/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /prijzen/i }).first()).toBeVisible();
  expect(pageErrors, "Uncaught browser JavaScript errors").toEqual([]);
});

test("login and company signup forms render without submitting data", async ({ page }) => {
  await page.goto("/?auth=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#lemail")).toHaveAttribute("type", "email");
  await expect(page.locator("#lpass")).toHaveAttribute("type", "password");
  await expect(page.locator("#signup")).toBeVisible();
  await expect(page.locator("#business")).toBeVisible();
  await expect(page.locator("#semail")).toHaveAttribute("type", "email");
  await expect(page.locator("#spass")).toHaveAttribute("type", "password");
  await expect(page.locator("#signupTerms")).toBeVisible();

  // Deliberately do not submit either form: no account or production data is created.
});

test("mobile landing page remains readable and login is reachable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-specific viewport test");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app h1").first()).toBeVisible();
  const login = page.getByRole("link", { name: /inloggen/i });
  await expect(login).toBeVisible();
  await login.click();
  await expect(page.locator("#login")).toBeVisible();
});
