import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: 1,
  reporter: IS_CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // In CI: serve the pre-built dist/. Locally: run the dev server.
    command: IS_CI ? `npm run preview -- --port ${new URL(BASE_URL).port || 4173}` : 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    timeout: 20_000,
  },
})
