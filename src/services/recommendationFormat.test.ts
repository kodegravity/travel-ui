import { describe, expect, it } from 'vitest'
import { formatCategory, formatCost, isSafeMapsUrl } from './recommendationFormat'

describe('formatCost', () => {
  it('formats with the currency code when provided', () => {
    expect(formatCost(12.5, 'EUR')).toBe('€12.50')
  })

  it('falls back to a plain number for an unknown currency code', () => {
    expect(formatCost(12.5, 'XX')).toBe('12.50')
  })

  it('falls back to a plain number without a currency code', () => {
    expect(formatCost(7, undefined)).toBe('7.00')
  })
})

describe('formatCategory', () => {
  it('humanizes backend category names', () => {
    expect(formatCategory('LOCAL_EXPERIENCES')).toBe('Local experiences')
    expect(formatCategory('HISTORY')).toBe('History')
    expect(formatCategory('HISTORY, ART')).toBe('History, Art')
    expect(formatCategory('ART, LOCAL_EXPERIENCES')).toBe('Art, Local experiences')
  })
})

describe('isSafeMapsUrl', () => {
  it('accepts https URLs only', () => {
    expect(isSafeMapsUrl('https://www.google.com/maps/dir/?api=1')).toBe(true)
    expect(isSafeMapsUrl('http://www.google.com/maps')).toBe(false)
    expect(isSafeMapsUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeMapsUrl('not a url')).toBe(false)
    expect(isSafeMapsUrl(undefined)).toBe(false)
    expect(isSafeMapsUrl('https://evil.example.com/maps')).toBe(false)
    expect(isSafeMapsUrl('https://notgoogle.com/maps')).toBe(false)
    expect(isSafeMapsUrl('https://google.com/not-maps')).toBe(false)
    expect(isSafeMapsUrl('https://user:password@google.com/maps')).toBe(false)
  })
})
