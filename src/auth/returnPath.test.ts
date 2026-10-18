import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './returnPath'

describe('safeReturnPath', () => {
  it('keeps same-origin app paths with query and hash', () => {
    expect(safeReturnPath('/')).toBe('/')
    expect(safeReturnPath('/explore?tab=1#top')).toBe('/explore?tab=1#top')
  })

  it.each([
    ['missing value', undefined],
    ['empty value', ''],
    ['absolute external URL', 'https://evil.example.com/'],
    ['protocol-relative URL', '//evil.example.com'],
    ['backslash trick', '/\\evil.example.com'],
    ['relative path', 'explore'],
    ['login page', '/login'],
    ['callback page', '/login/callback?code=abc'],
  ])('falls back to / for %s', (_label, value) => {
    expect(safeReturnPath(value)).toBe('/')
  })
})
