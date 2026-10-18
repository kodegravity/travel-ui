import type { LocationRequest } from '../types/api'

/** A city the traveler can pick. `location` is the city centre that nearby searches start from. */
export interface City {
  id: string
  name: string
  country: string
  location: LocationRequest
  /** Short time-zone label for the banner, such as CET or ET. */
  timeZone: string
  /** Main local language, when it differs by city (Montréal, Québec City). */
  language?: string
}

export interface Country {
  name: string
  /** ISO 4217 code; recommendations compare costs in this currency. */
  currency: string
  language: string
  cities: City[]
}

function city(name: string, country: string, latitude: number, longitude: number, timeZone: string, language?: string): City {
  const id = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return { id, name, country, location: { latitude, longitude }, timeZone, ...(language ? { language } : {}) }
}

export const COUNTRIES: readonly Country[] = [
  {
    name: 'Spain',
    currency: 'EUR',
    language: 'Spanish',
    cities: [
      city('Madrid', 'Spain', 40.4168, -3.7038, 'CET'),
      city('Barcelona', 'Spain', 41.3874, 2.1686, 'CET'),
      city('Valencia', 'Spain', 39.4699, -0.3763, 'CET'),
      city('Seville', 'Spain', 37.3891, -5.9845, 'CET'),
      city('Málaga', 'Spain', 36.7213, -4.4214, 'CET'),
      city('Bilbao', 'Spain', 43.263, -2.935, 'CET'),
      city('Granada', 'Spain', 37.1773, -3.5986, 'CET'),
    ],
  },
  {
    name: 'France',
    currency: 'EUR',
    language: 'French',
    cities: [
      city('Paris', 'France', 48.8566, 2.3522, 'CET'),
      city('Lyon', 'France', 45.764, 4.8357, 'CET'),
      city('Nice', 'France', 43.7102, 7.262, 'CET'),
      city('Bordeaux', 'France', 44.8378, -0.5792, 'CET'),
      city('Marseille', 'France', 43.2965, 5.3698, 'CET'),
    ],
  },
  {
    name: 'Italy',
    currency: 'EUR',
    language: 'Italian',
    cities: [
      city('Rome', 'Italy', 41.9028, 12.4964, 'CET'),
      city('Florence', 'Italy', 43.7696, 11.2558, 'CET'),
      city('Venice', 'Italy', 45.4408, 12.3155, 'CET'),
      city('Milan', 'Italy', 45.4642, 9.19, 'CET'),
      city('Naples', 'Italy', 40.8518, 14.2681, 'CET'),
    ],
  },
  {
    name: 'United Kingdom',
    currency: 'GBP',
    language: 'English',
    cities: [
      city('London', 'United Kingdom', 51.5074, -0.1278, 'GMT'),
      city('Edinburgh', 'United Kingdom', 55.9533, -3.1883, 'GMT'),
      city('Manchester', 'United Kingdom', 53.4808, -2.2426, 'GMT'),
    ],
  },
  {
    name: 'Canada',
    currency: 'CAD',
    language: 'English',
    cities: [
      city('Toronto', 'Canada', 43.6532, -79.3832, 'ET'),
      city('Vancouver', 'Canada', 49.2827, -123.1207, 'PT'),
      city('Montréal', 'Canada', 45.5019, -73.5674, 'ET', 'French'),
      city('Québec City', 'Canada', 46.8139, -71.208, 'ET', 'French'),
      city('Calgary', 'Canada', 51.0447, -114.0719, 'MT'),
    ],
  },
  {
    name: 'Japan',
    currency: 'JPY',
    language: 'Japanese',
    cities: [
      city('Tokyo', 'Japan', 35.6812, 139.7671, 'JST'),
      city('Kyoto', 'Japan', 35.0116, 135.7681, 'JST'),
      city('Osaka', 'Japan', 34.6937, 135.5023, 'JST'),
      city('Sapporo', 'Japan', 43.0618, 141.3545, 'JST'),
      city('Hiroshima', 'Japan', 34.3853, 132.4553, 'JST'),
    ],
  },
  {
    name: 'United States',
    currency: 'USD',
    language: 'English',
    cities: [
      city('New York', 'United States', 40.758, -73.9855, 'ET'),
      city('San Francisco', 'United States', 37.7749, -122.4194, 'PT'),
      city('Chicago', 'United States', 41.8781, -87.6298, 'CT'),
      city('Los Angeles', 'United States', 34.0522, -118.2437, 'PT'),
      city('Miami', 'United States', 25.7617, -80.1918, 'ET'),
    ],
  },
]

export const ALL_CITIES: readonly City[] = COUNTRIES.flatMap((country) => country.cities)

export function findCity(id: string | null | undefined): City | undefined {
  return id ? ALL_CITIES.find((candidate) => candidate.id === id) : undefined
}

export function findCountry(name: string): Country | undefined {
  return COUNTRIES.find((country) => country.name === name)
}

/** Tile colour stands in for a photo until real imagery is chosen. */
export interface FeaturedDestination {
  cityId: string
  tone: string
  blurb: string
}

export const FEATURED: readonly FeaturedDestination[] = [
  { cityId: 'madrid', tone: '#9A3412', blurb: 'Grand boulevards, world-class art and late-night tapas.' },
  { cityId: 'kyoto', tone: '#7C2D12', blurb: 'Temples, gardens and quiet lanes in the old capital.' },
  { cityId: 'paris', tone: '#1E40AF', blurb: 'Museums, cafés and neighborhoods made for walking.' },
  { cityId: 'rome', tone: '#78350F', blurb: 'Ancient history on every corner, and great food too.' },
]

export const POPULAR_COUNTRY = 'Spain'

export const POPULAR: readonly { cityId: string; tone: string }[] = [
  { cityId: 'madrid', tone: '#9A3412' },
  { cityId: 'barcelona', tone: '#1D4ED8' },
  { cityId: 'seville', tone: '#B45309' },
  { cityId: 'valencia', tone: '#0E7490' },
  { cityId: 'granada', tone: '#7C2D12' },
  { cityId: 'malaga', tone: '#0369A1' },
  { cityId: 'bilbao', tone: '#334155' },
]
