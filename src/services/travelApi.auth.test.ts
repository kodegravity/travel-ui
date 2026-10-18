import { afterEach, describe, expect, it, vi } from 'vitest'

const okta = vi.hoisted(() => ({
  oktaAuth: {} as object | null,
  getAccessToken: vi.fn(async (): Promise<string | null> => null),
}))

vi.mock('../config/okta', () => ({
  OKTA_CONFIGURED: true,
  oktaAuth: okta.oktaAuth,
  getAccessToken: okta.getAccessToken,
}))

import { stopTravelSession } from './travelApi'

describe('travel API bearer token', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    okta.getAccessToken.mockReset()
    okta.getAccessToken.mockResolvedValue(null)
  })

  it('attaches the access token as a Bearer header when one is available', async () => {
    okta.getAccessToken.mockResolvedValue('token-123')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await stopTravelSession('session-1')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  it('sends no Authorization header when no token is available', async () => {
    okta.getAccessToken.mockResolvedValue(null)
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await stopTravelSession('session-1')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
