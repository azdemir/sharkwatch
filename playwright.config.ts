import { defineConfig, devices } from '@playwright/test';

/* Playwright for the SharkWatch homepage. Run with `npm run test:e2e`.
 * If you already have `npm run dev` on localhost:3000, the tests reuse it;
 * otherwise they start a dev server themselves. Set PLAYWRIGHT_BASE_URL to
 * test a different port, e.g. http://localhost:3101. */

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
