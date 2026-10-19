import { describe, expect, it } from 'vitest'
import { localDateTime } from './chatPrefs'

describe('localDateTime', () => {
  it("formats the time in a city's own zone", () => {
    const instant = new Date('2026-10-19T12:05:00Z')
    expect(localDateTime(instant, 'Europe/Madrid')).toBe('2026-10-19T14:05')
    expect(localDateTime(instant, 'Asia/Kolkata')).toBe('2026-10-19T17:35')
    expect(localDateTime(instant, 'America/New_York')).toBe('2026-10-19T08:05')
  })
})
