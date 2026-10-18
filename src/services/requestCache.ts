/**
 * Shares one in-flight or recent request per key, so the same page opened twice in a row (or React's development
 * double render) does not repeat a paid API call. Entries live in memory only and expire after a few minutes.
 */
const TTL_MS = 5 * 60 * 1000

interface Entry {
  promise: Promise<unknown>
  expiresAt: number
}

const entries = new Map<string, Entry>()

export function cachedRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = entries.get(key)
  if (existing && existing.expiresAt > now) return existing.promise as Promise<T>
  const promise = load()
  entries.set(key, { promise, expiresAt: now + TTL_MS })
  // A failure is never reused: the next attempt asks again.
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key)
  })
  return promise
}

/** Forgets one key, for an explicit retry. */
export function forgetRequest(key: string) {
  entries.delete(key)
}

/** Test helper. */
export function clearRequestCache() {
  entries.clear()
}
