import { defineConfig, devices } from '@playwright/test';

/**
 * The studio is a static Vite build; `npm run build` runs first in CI, then
 * `vite preview` serves dist/ under /PKPilot0015/ for the same base the app
 * uses on GitHub Pages.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4175/PKPilot0015/',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/PKPilot0015/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
