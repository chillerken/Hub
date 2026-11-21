const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.cjs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.RECEPTION_AI_BASE_URL || "https://reception-i56l2e18d-luxwash.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10000,
    navigationTimeout: 30000
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } }
  ]
});
