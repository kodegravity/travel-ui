import { Landmark, Palette, ShoppingBag, Trees, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { Interest } from '../types/travel'

export interface CategoryMeta {
  interest: Interest
  label: string
  /** Tile colour that stands in for a photo. */
  tone: string
  icon: LucideIcon
}

/** The backend's interests, in chip order. */
export const CATEGORIES: readonly CategoryMeta[] = [
  { interest: 'HISTORY', label: 'Historical Landmarks', tone: '#9A3412', icon: Landmark },
  { interest: 'ART', label: 'Art & Museums', tone: '#4C1D95', icon: Palette },
  { interest: 'FOOD', label: 'Food & Drink', tone: '#A16207', icon: UtensilsCrossed },
  { interest: 'NATURE', label: 'Parks & Nature', tone: '#166534', icon: Trees },
  { interest: 'SHOPPING', label: 'Shopping', tone: '#1E40AF', icon: ShoppingBag },
  { interest: 'LOCAL_EXPERIENCES', label: 'Local Experiences', tone: '#0E7490', icon: Users },
]

/** Interests named in a place's category string, such as "HISTORY, ART". */
export function interestsOf(category: string): Interest[] {
  const names = category.split(',').map((part) => part.trim())
  return CATEGORIES.filter((meta) => names.includes(meta.interest)).map((meta) => meta.interest)
}

/** The first matching category, used for the card's tile and icon. */
export function primaryCategory(category: string): CategoryMeta {
  const [first] = interestsOf(category)
  return CATEGORIES.find((meta) => meta.interest === first) ?? CATEGORIES[0]!
}
