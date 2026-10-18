/** Formats an estimated cost. Falls back to a plain number when no currency code is given. */
export function formatCost(amount: number, currencyCode: string | undefined): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount)
    } catch {
      // Unknown currency code: fall through to the plain number below.
    }
  }
  return amount.toFixed(2)
}

/** Turns backend categories such as "HISTORY, ART" or "LOCAL_EXPERIENCES" into "History, Art" / "Local experiences". */
export function formatCategory(category: string): string {
  const labels = category
    .split(',')
    .map((part) => part.trim().toLowerCase().split('_').filter(Boolean).join(' '))
    .filter((label) => label.length > 0)
    .map((label) => label.charAt(0).toUpperCase() + label.slice(1))
  return labels.length > 0 ? labels.join(', ') : category
}

/** Only https links from the backend are rendered as clickable navigation. */
export function isSafeMapsUrl(url: string | undefined): url is string {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'google.com' || parsed.hostname.endsWith('.google.com')) &&
      parsed.pathname.startsWith('/maps') && !parsed.username && !parsed.password
  } catch {
    return false
  }
}
