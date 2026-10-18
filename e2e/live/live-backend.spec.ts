import { expect, test, type Response as PlaywrightResponse } from '@playwright/test'

/**
 * LIVE BACKEND INTEGRATION TESTS.
 * These run against the real Spring Boot API on http://localhost:8080 with its
 * mock attraction provider and AI disabled, confirmed by the operator.
 * Explicit opt-in prevents accidentally invoking paid providers on an unknown server.
 */
const BACKEND_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
const ROME = { latitude: 41.8902, longitude: 12.4922 }

async function backendReachable(): Promise<boolean> {
  try {
    await fetch(BACKEND_URL, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

test.beforeAll(async () => {
  test.skip(process.env.RUN_LIVE_BACKEND_TESTS !== '1',
    'Live integration requires RUN_LIVE_BACKEND_TESTS=1 after confirming mock provider and AI-disabled mode.')
  test.skip(!(await backendReachable()), `Spring Boot backend is not reachable at ${BACKEND_URL}`)
})

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:5173' })
  await context.setGeolocation(ROME)
})

test('live: start, receive recommendations, and stop terminates the backend session', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('checkbox', { name: 'History' }).check()
  await page.getByRole('checkbox', { name: 'Art' }).check()
  await page.getByLabel('Maximum budget').fill('50')
  await page.getByLabel('Currency').selectOption('EUR')
  await page.getByRole('radio', { name: '180 min', exact: true }).check()
  const createPromise = page.waitForResponse(
    (response: PlaywrightResponse) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/v1/travel-sessions'),
  )
  const recommendationsPromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/recommendations'),
  )
  await page.getByRole('button', { name: 'Start Exploring' }).click()

  const createResponse = await createPromise
  expect(createResponse.status()).toBe(201)
  const { sessionId } = (await createResponse.json()) as { sessionId: string }

  const recommendationsResponse = await recommendationsPromise
  expect(recommendationsResponse.status()).toBe(200)
  expect(recommendationsResponse.request().postDataJSON()).toEqual({ location: ROME })
  const result = await recommendationsResponse.json()
  expect(result.refreshStatus).toBe('UPDATED')
  expect(result.recommendations.length).toBeGreaterThan(0)
  for (const recommendation of result.recommendations) {
    await expect(page.getByRole('heading', { name: recommendation.name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Stop Exploring' })).toBeEnabled()

  await page.getByRole('button', { name: 'Stop Exploring' }).click()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()

  const check = await fetch(`${BACKEND_URL}/api/v1/travel-sessions/${sessionId}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: ROME }),
  })
  expect([404, 409]).toContain(check.status)
})
