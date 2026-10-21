import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'
import { signIn, stubApiFallbacks } from '../support'

/**
 * INTERCEPTED: two browser contexts signed in as the same traveler stand in for two devices. They share one fake
 * account that enforces versions like PUT /api/v1/travel-plan does (409 for a stale baseVersion).
 */
interface Entry {
  updatedAt: string
  data: unknown
}

class FakeAccount {
  version = 0
  entries: Record<string, Entry> = {}
  available = true

  async handle(route: Route) {
    if (!this.available) return route.fulfill({ status: 503, json: { title: 'Service unavailable', status: 503 } })
    const request = route.request()
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { baseVersion: number; entries: Record<string, Entry> }
      if (body.baseVersion !== this.version) {
        return route.fulfill({ status: 409, json: { title: 'Travel plan changed', status: 409 } })
      }
      this.version += 1
      this.entries = body.entries
    }
    return route.fulfill({ json: { ownerRef: 'f'.repeat(64), version: this.version, entries: this.entries } })
  }

  trip(cityId: string): string[] {
    const data = this.entries[`city:${cityId}`]?.data as { trip?: Array<{ name: string }> } | null | undefined
    return (data?.trip ?? []).map((place) => place.name)
  }
}

const MADRID = { latitude: 40.4168, longitude: -3.7038 }
const PLACES = [
  { placeId: 'prado', name: 'Museo del Prado', category: 'ART', description: 'Spanish masters.', ...MADRID },
  { placeId: 'retiro', name: 'Retiro Park', category: 'NATURE', description: 'Gardens and a lake.', ...MADRID },
]

async function device(context: BrowserContext, account: FakeAccount): Promise<Page> {
  await signIn(context, 'sync-traveler')
  const page = await context.newPage()
  await stubApiFallbacks(page)
  await page.route('**/api/v1/recommendations*', (route) =>
    route.fulfill({ json: { recommendations: PLACES, page: 0, size: 20, totalElements: 2, totalPages: 1 } }),
  )
  await page.route('**/api/v1/travel-plan', (route) => account.handle(route))
  return page
}

/** Switching back to a tab pulls the account copy. */
async function returnToTab(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

test('a trip built on one device appears on another, and so does a removal', async ({ browser }) => {
  const account = new FakeAccount()
  const laptop = await device(await browser.newContext(), account)
  const phone = await device(await browser.newContext(), account)

  await laptop.goto('/explore/madrid')
  await laptop.getByRole('button', { name: 'Add Museo del Prado to trip' }).click()
  await expect.poll(() => account.trip('madrid'), { timeout: 10_000 }).toEqual(['Museo del Prado'])

  await phone.goto('/trip/madrid')
  await expect(phone.getByLabel('Stop 1: Museo del Prado')).toBeVisible()

  await phone.getByRole('button', { name: 'Remove Museo del Prado' }).click()
  await expect.poll(() => account.trip('madrid'), { timeout: 10_000 }).toEqual([])

  await laptop.goto('/trip/madrid')
  await returnToTab(laptop)
  await expect(laptop.getByRole('heading', { name: 'Your trip is empty' })).toBeVisible()
})

test('changes made while the account is unreachable sync once it is back', async ({ browser }) => {
  const account = new FakeAccount()
  account.available = false
  const page = await device(await browser.newContext(), account)

  await page.goto('/explore/madrid')
  await page.getByRole('button', { name: 'Add Retiro Park to trip' }).click()
  await expect(page.getByRole('button', { name: 'Remove Retiro Park from trip' })).toBeVisible()
  await page.waitForTimeout(2500)
  expect(account.version).toBe(0)

  account.available = true
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => account.trip('madrid'), { timeout: 10_000 }).toEqual(['Retiro Park'])
})
