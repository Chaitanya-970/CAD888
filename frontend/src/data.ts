import { Compass, Shield, Zap } from 'lucide-react'
import type { Report, Route } from './types'

export const routes: Route[] = [
  {
    id: 'fastest',
    label: 'Fastest',
    icon: Zap,
    time: '18 min',
    distance: '4.2 km',
    base: 61,
    color: '#e0791a',
    note: 'Shortest route, with 2 lower-visibility blocks.',
    path: [[12.974, 77.592], [12.976, 77.600], [12.971, 77.608], [12.975, 77.616], [12.981, 77.625], [12.986, 77.635]],
  },
  {
    id: 'balanced',
    label: 'Balanced',
    icon: Compass,
    time: '22 min',
    distance: '5.1 km',
    base: 78,
    color: '#0f8a72',
    note: 'A well-lit main-road route with steady activity.',
    path: [[12.974, 77.592], [12.980, 77.598], [12.980, 77.608], [12.982, 77.618], [12.986, 77.626], [12.986, 77.635]],
  },
  {
    id: 'safest',
    label: 'Safest',
    icon: Shield,
    time: '27 min',
    distance: '6.0 km',
    base: 91,
    color: '#6b46f0',
    note: 'Best lighting, active storefronts and companion coverage.',
    path: [[12.974, 77.592], [12.985, 77.596], [12.989, 77.606], [12.987, 77.617], [12.991, 77.625], [12.986, 77.635]],
  },
]

export const seedReports: Report[] = [
  { p: [12.981, 77.604], kind: 'Low lighting', age: '2d', color: '#e0791a' },
  { p: [12.977, 77.614], kind: 'Quiet stretch', age: '1d', color: '#d9483d' },
  { p: [12.988, 77.622], kind: 'Well lit', age: '3h', color: '#0f8a72' },
  { p: [12.984, 77.610], kind: 'Crowded', age: '5h', color: '#0f8a72' },
]

export const hours = ['6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM', '12 AM', '1 AM']

export const reportKinds = ['Low lighting', 'Quiet / isolated', 'Harassment concern', 'Obstruction', 'Positive: well lit']

/** P2-b: Heatmap grid — safety intensity points across the Bhubaneswar area.
 *  Each point: [lat, lng, intensity 0-1] where 0=safe, 1=high-risk. */
export const heatmapPoints: [number, number, number][] = [
  // lower-safety zones (dimly lit areas, underpasses)
  [20.2620, 85.8380, 0.7],  [20.2595, 85.8420, 0.85], [20.2630, 85.8450, 0.6],
  [20.2610, 85.8400, 0.75], [20.2580, 85.8440, 0.9],  [20.2640, 85.8410, 0.5],
  // medium zones (mixed areas)
  [20.2700, 85.8350, 0.35], [20.2720, 85.8400, 0.3],  [20.2730, 85.8450, 0.25],
  [20.2680, 85.8460, 0.45], [20.2660, 85.8480, 0.4],  [20.2690, 85.8500, 0.35],
  // safe zones (well-lit main roads, busy markets)
  [20.2760, 85.8340, 0.1],  [20.2800, 85.8380, 0.12], [20.2780, 85.8420, 0.08],
  [20.2820, 85.8460, 0.15], [20.2790, 85.8500, 0.1],
  // surrounding area fill
  [20.2740, 85.8320, 0.2],  [20.2810, 85.8350, 0.15], [20.2650, 85.8330, 0.55],
  [20.2570, 85.8430, 0.7],  [20.2760, 85.8430, 0.18], [20.2830, 85.8440, 0.12],
  [20.2680, 85.8510, 0.3],  [20.2750, 85.8470, 0.22], [20.2600, 85.8460, 0.6],
]