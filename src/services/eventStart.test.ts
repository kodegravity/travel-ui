import { describe, expect, it } from 'vitest'
import { formatEventStart } from './notifications'

describe('formatEventStart', () => {
  const now = new Date(2030, 0, 1, 20, 0)
  const at = (day: number, hour: number) => new Date(2030, 0, day, hour, 30).toISOString()
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  it('says today, tomorrow, or the weekday', () => {
    expect(formatEventStart(at(1, 21), undefined, now)).toBe(time(at(1, 21)))
    expect(formatEventStart(at(2, 2), undefined, now)).toBe(`Tomorrow ${time(at(2, 2))}`)
    expect(formatEventStart(at(4, 19), undefined, now)).toMatch(new RegExp(`^\\w+ ${time(at(4, 19))}$`))
  })

  it('falls back to the venue time, or nothing', () => {
    expect(formatEventStart(undefined, '19:30:00')).toBe('19:30')
    expect(formatEventStart(undefined)).toBeNull()
  })
})
