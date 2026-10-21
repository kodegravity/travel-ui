import { defineConfig, devices } from '@playwright/test'

/**
 * The live smoke run against the deployed site (`npm run test:e2e:live`). It opens a visible browser and waits for
 * the operator to sign in with Okta, so no credentials live in tests or CI. It makes a handful of real, capped
 * provider calls (one Google search, one OpenAI selection, one Ticketmaster lookup) and changes no saved data.
 */
export default defineConfig({
  testDir: 'e2e/live',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 5 * 60 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.LIVE_BASE_URL ?? 'https://dpitnqmwb86ju.cloudfront.net',
    headless: false,
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
  },
})
