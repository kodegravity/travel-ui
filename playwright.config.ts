import { defineConfig, devices } from '@playwright/test'
import { E2E_ORIGIN, E2E_PORT, OKTA_CLIENT_ID, OKTA_ISSUER } from './e2e/support'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'intercepted-mobile',
      testMatch: /intercepted\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'intercepted-desktop',
      testMatch: /intercepted\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // Its own port and plain `vite`, so a developer's running server (real Okta, Maps key) is never reused.
  // Environment variables override .env.local: a fake Okta issuer, no Maps key, and a backend URL the tests stub.
  webServer: {
    command: `npx vite --host localhost --strictPort --port ${E2E_PORT}`,
    url: E2E_ORIGIN,
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: 'http://localhost:8080',
      VITE_OKTA_ISSUER: OKTA_ISSUER,
      VITE_OKTA_CLIENT_ID: OKTA_CLIENT_ID,
      VITE_OKTA_REDIRECT_URI: `${E2E_ORIGIN}/login/callback`,
      VITE_GOOGLE_MAPS_API_KEY: '',
    },
  },
})
