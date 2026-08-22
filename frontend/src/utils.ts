import type { Route, SafetyLevel } from './types'

/** Base score for a route at a given hour, before safety-mode weighting. */
export function baseScore(route: Route, hour: number) {
  return Math.max(45, Math.round(route.base - Math.max(0, hour - 2) * (route.id === 'safest' ? 2 : route.id === 'balanced' ? 4 : 6)))
}

/** Final score, adjusted by how cautious the rider wants routing to be. */
export function score(route: Route, hour: number, safetyLevel: SafetyLevel) {
  let s = baseScore(route, hour)
  if (safetyLevel === 1) s += route.id === 'safest' ? 4 : route.id === 'balanced' ? 2 : -3
  if (safetyLevel === 2) s += route.id === 'safest' ? 9 : route.id === 'balanced' ? 3 : -7
  return Math.max(30, Math.min(99, s))
}

export function tone(n: number) {
  return n >= 84 ? 'excellent' : n >= 70 ? 'good' : 'caution'
}
