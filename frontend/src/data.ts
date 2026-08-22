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
