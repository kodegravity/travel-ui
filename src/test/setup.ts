import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Pin the backend URL to the backend's default so tests do not inherit a developer's
// local .env.local override (for example a custom port). Runs before modules are imported.
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')

// Vitest globals are disabled, so RTL's automatic cleanup is not registered.
afterEach(() => {
  cleanup()
})

// Tests run without an Okta session or Okta configuration: no access token is attached to requests.
vi.mock('../config/okta', () => ({
  OKTA_CONFIGURED: false,
  LOGIN_CALLBACK_PATH: '/login/callback',
  oktaAuth: null,
  getAccessToken: () => Promise.resolve(null),
}))
