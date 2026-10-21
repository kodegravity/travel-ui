import type { BrowserContext, Page, Route } from '@playwright/test'

/**
 * Shared setup for the intercepted suites. The dev server for these runs (playwright.config.ts) points Okta at
 * OKTA_ISSUER, a host that cannot resolve, and disables Google Maps, so no test reaches a real or paid service.
 */
export const E2E_PORT = 5174
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`
export const OKTA_ISSUER = 'https://okta.e2e.invalid/oauth2/default'
export const OKTA_CLIENT_ID = 'e2e-client'

/**
 * Signs a fake traveler in: unexpired tokens in okta-auth-js session storage are all the app checks. Every request
 * to the fake issuer is refused, so user info and token renewal fail quietly as they would offline.
 */
export async function signIn(context: BrowserContext, subject = 'e2e-traveler') {
  await context.route('https://okta.e2e.invalid/**', (route: Route) => route.abort())
  await context.addInitScript(
    ({ issuer, clientId, sub }) => {
      const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
      const claims = { sub, name: 'E2E Traveler', email: 'traveler@e2e.invalid', iss: issuer, aud: clientId }
      const urls = { authorizeUrl: `${issuer}/v1/authorize`, userinfoUrl: `${issuer}/v1/userinfo` }
      window.sessionStorage.setItem('okta-token-storage', JSON.stringify({
        accessToken: { accessToken: `e2e-access-${sub}`, tokenType: 'Bearer', expiresAt, claims, scopes: ['openid'], ...urls },
        idToken: { idToken: `e2e-id-${sub}`, expiresAt, claims, issuer, clientId, scopes: ['openid'], ...urls },
      }))
    },
    { issuer: OKTA_ISSUER, clientId: OKTA_CLIENT_ID, sub: subject },
  )
}

/**
 * Answers every API call no test has stubbed: an empty travel plan, and 503 for anything else, so an unexpected
 * call fails visibly instead of reaching a real backend. Routes added later take precedence over these.
 */
export async function stubApiFallbacks(page: Page) {
  await page.route('**/api/v1/**', (route: Route) =>
    route.fulfill({ status: 503, json: { title: 'Not stubbed in this test', status: 503 } }),
  )
  await page.route('**/api/v1/travel-plan', (route: Route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { ownerRef: 'e'.repeat(64), version: 0, entries: {} } })
      : route.fulfill({ json: { ownerRef: 'e'.repeat(64), version: 1, entries: route.request().postDataJSON().entries } }),
  )
}
