import type { LucideIcon } from 'lucide-react'

export type RouteId = 'fastest' | 'balanced' | 'safest'

/** Local/fallback route shape (kept for offline fallback) */
export type Route = {
  id: RouteId
  label: string
  icon: LucideIcon
  time: string
  distance: string
  base: number
  color: string
  path: [number, number][]
  note: string
}

export type Report = {
  p: [number, number]
  kind: string
  age: string
  color: string
}

export type SafetyLevel = 0 | 1 | 2
export const SAFETY_LEVELS: { label: string; hint: string }[] = [
  { label: 'Standard', hint: 'Balanced routing' },
  { label: 'Cautious', hint: 'Favors lit, active streets' },
  { label: 'Maximum', hint: 'Prioritizes safety above all' },
]

/** Route colors assigned by index */
export const ROUTE_COLORS = ['#e0791a', '#0f8a72', '#6b46f0'] as const

/** Route labels assigned by score rank */
export const ROUTE_LABELS = ['Safest', 'Balanced', 'Fastest'] as const

/** Route icons assigned by label */
export const ROUTE_ICONS: Record<string, LucideIcon> = {}
// Populated at runtime in App.tsx to avoid circular imports
