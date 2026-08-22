import type { LucideIcon } from 'lucide-react'

export type RouteId = 'fastest' | 'balanced' | 'safest'

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
