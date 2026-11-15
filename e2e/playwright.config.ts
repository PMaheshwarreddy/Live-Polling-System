import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests drive real browsers (a teacher and several students) against the running app.
 * Start everything first with `npm run dev` (plus Postgres, Redis and Ollama), then `npm run e2e` from the repo root.
 * Uses the locally installed Chrome, so no browser download is needed.
 */
export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    channel: process.env.E2E_CHANNEL ?? "chrome",
    headless: true,
    viewport: { width: 1360, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
