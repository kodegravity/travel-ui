import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationError, getCurrentLocation, watchLocation } from './geolocation'

type Callback = (...args: unknown[]) => void

function stubGeolocation(getCurrentPosition: (success: Callback, error: Callback) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn(getCurrentPosition) },
  })
}

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation')
  setSecureContext(true)
})

describe('getCurrentLocation', () => {
  it('resolves with latitude and longitude only, using a single one-shot request', async () => {
    setSecureContext(true)
    stubGeolocation((success) =>
      success({ coords: { latitude: 41.9, longitude: 12.5, accuracy: 3, altitude: null } }),
    )

    await expect(getCurrentLocation()).resolves.toEqual({ latitude: 41.9, longitude: 12.5 })

    const geo = navigator.geolocation as unknown as {
      getCurrentPosition: ReturnType<typeof vi.fn>
      watchPosition?: unknown
    }
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 0 },
    )
    expect(geo.watchPosition).toBeUndefined()
  })

  it.each([
    [1, 'PERMISSION_DENIED'],
    [2, 'POSITION_UNAVAILABLE'],
    [3, 'TIMEOUT'],
  ])('maps geolocation error code %i to %s', async (code, expected) => {
    setSecureContext(true)
    stubGeolocation((_success, error) => error({ code }))

    const error = await getCurrentLocation().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LocationError)
    expect((error as LocationError).code).toBe(expected)
  })

  it('rejects when geolocation is unsupported', async () => {
    Reflect.deleteProperty(navigator, 'geolocation')

    await expect(getCurrentLocation()).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('rejects outside a secure context', async () => {
    setSecureContext(false)
    stubGeolocation((success) => success({ coords: { latitude: 0, longitude: 0 } }))

    await expect(getCurrentLocation()).rejects.toMatchObject({ code: 'INSECURE_CONTEXT' })
  })

  it('rejects a poor-accuracy fix instead of sending unreliable coordinates', async () => {
    stubGeolocation((success) => success({ coords: { latitude: 41.9, longitude: 12.5, accuracy: 2000 } }))
    await expect(getCurrentLocation()).rejects.toMatchObject({ code: 'INACCURATE' })
  })

  it('allows a pending one-shot location request to be aborted', async () => {
    stubGeolocation(() => undefined)
    const controller = new AbortController()
    const request = getCurrentLocation(controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('filters inaccurate watched fixes and cleans up the watch', () => {
    let callback: PositionCallback = () => undefined
    const clearWatch = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((success: PositionCallback) => { callback = success; return 7 }),
        clearWatch,
      },
    })
    const received = vi.fn()
    const error = vi.fn()
    const stop = watchLocation(received, error)
    callback({
      coords: { latitude: 41.9, longitude: 12.5, accuracy: 900 },
    } as GeolocationPosition)
    expect(received).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'INACCURATE' }))
    stop()
    expect(clearWatch).toHaveBeenCalledWith(7)
  })
})
