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

/** P1-b: Generate a plain-English explanation for a route's safety profile. */
export function routeExplanation(routeId: string, s: number, hour: number): string {
  const timeDesc = hour <= 1 ? 'early evening' : hour <= 3 ? 'after dark' : 'late at night'
  if (routeId === 'fastest') {
    if (s < 50) return `This route passes 2 poorly-lit blocks and an isolated underpass. ${timeDesc}, foot traffic drops sharply — consider a safer alternative.`
    return `Shortest path, but 2 stretches have limited street lighting. Scores drop quickly after dark.`
  }
  if (routeId === 'balanced') {
    if (s >= 80) return `Well-lit main roads with steady foot traffic. A strong choice for ${timeDesc} travel.`
    return `Mostly main roads with decent lighting. One quieter section ${timeDesc} lowers the score slightly.`
  }
  // safest
  if (s >= 90) return `Best-in-class: active storefronts, full street lighting, and high foot traffic even ${timeDesc}.`
  if (s >= 80) return `Well-lit route with active storefronts. Foot traffic thins a bit ${timeDesc}, but lighting stays strong.`
  return `Safest available option — good lighting throughout, though foot traffic is lower ${timeDesc}.`
}

/** P3-a: Generate a contextual AI safety tip for the selected route + hour. */
export function safetyTip(routeId: string, hour: number): string {
  const tips: Record<string, string[]> = {
    fastest: [
      'This route has limited lighting after sunset — keep your phone charged and share your live location with a friend.',
      'Two blocks along this path have low foot traffic after 9 PM. Consider the Balanced route if walking alone.',
      'The underpass section is unmonitored late at night. If you must take this route, stay on the left sidewalk where shops are still visible.',
    ],
    balanced: [
      'Main-road route with good visibility. Stay on the market-side pavement for the best-lit stretch.',
      'Good choice for this hour — foot traffic stays steady until midnight along Market Street.',
      'Well-lit overall. The one quieter block near Kalpana Square has a 24-hour pharmacy as a landmark.',
    ],
    safest: [
      'Excellent choice — active storefronts and full street lighting throughout. The safest option at any hour.',
      'This route passes 3 well-lit intersections with CCTV coverage. Foot traffic stays high until late.',
      'Well-lit but foot traffic dips after 11 PM — consider a walking companion or keep a call active.',
    ],
  }
  const pool = tips[routeId] || tips.safest
  // Pick a tip based on hour to feel contextual without randomness
  return pool[hour % pool.length]
}