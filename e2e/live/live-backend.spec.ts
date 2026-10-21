import { expect, test, type Page } from '@playwright/test'

/**
 * LIVE SMOKE TEST against the deployed site, API Gateway, and ECS services. Run with `npm run test:e2e:live`, then
 * sign in with Okta in the browser window that opens. One sign-in covers every step, because Okta keeps tokens in
 * session storage, which a new page would not have.
 */
const MADRID = { latitude: 40.4168, longitude: -3.7038 }

async function signInByHand(page: Page) {
  await page.goto('/travel-mode')
  if (/\/login/.test(page.url()) || (await page.getByRole('button', { name: /sign in/i }).count()) > 0) {
    console.log('Sign in with Okta in the browser window. Waiting up to 4 minutes...')
  }
  await page.waitForURL('**/travel-mode', { timeout: 4 * 60 * 1000 })
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeVisible({ timeout: 30_000 })
}

test('live: sign in, sync the plan, and run a Travel Mode session end to end', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['geolocation'], { origin: new URL(baseURL!).origin })
  await context.setGeolocation(MADRID)

  const planLoaded = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/travel-plan') && response.request().method() === 'GET',
    { timeout: 5 * 60 * 1000 },
  )
  await signInByHand(page)

  await test.step('travel plan loads for the signed-in traveler', async () => {
    const plan = await planLoaded
    expect(plan.status()).toBe(200)
    expect((await plan.json()).ownerRef).toMatch(/^[0-9a-f]{64}$/)
  })

  await test.step('Travel Mode starts, recommends, and stops', async () => {
    await page.getByRole('checkbox', { name: 'History' }).check()
    await page.getByLabel('Maximum budget').fill('50')
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/travel-sessions'),
    )
    const recommended = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/recommendations'),
      { timeout: 60_000 },
    )
    await page.getByRole('button', { name: 'Start Exploring' }).click()

    expect((await created).status()).toBe(201)
    const response = await recommended
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(['UPDATED', 'NO_NEW_RESULTS']).toContain(body.refreshStatus)
    for (const place of body.recommendations.slice(0, 3)) {
      await expect(page.getByRole('heading', { name: place.name, exact: true })).toBeVisible()
    }

    const stopped = page.waitForResponse((r) => r.request().method() === 'DELETE')
    await page.getByRole('button', { name: 'Stop Exploring' }).click()
    expect((await stopped).status()).toBe(204)
    await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
  })
})
