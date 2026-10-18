const AUTH_PATHS = ['/login', '/login/callback']

/**
 * Accepts only same-origin app paths, so a crafted value can't redirect users off-site.
 * Falls back to the explorer when the value is missing, external, or an auth page.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  const [pathname = ''] = value.split(/[?#]/)
  if (AUTH_PATHS.includes(pathname)) return '/'
  return value
}
