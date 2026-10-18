const DEFAULT_API_BASE_URL = 'http://localhost:8080'

/** Validates and normalizes the backend base URL (no trailing slash). */
export function normalizeApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_API_BASE_URL
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute http or https URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_API_BASE_URL must use the http or https protocol.')
  }
  return candidate.replace(/\/+$/, '')
}

/** Spring Boot backend base URL. Public: VITE_ variables are visible in the browser. */
export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
