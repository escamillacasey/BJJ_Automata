import type { BeltRank, PositionCategory } from './types'

export type WorksheetSeat = {
  id: string
  label: string
  role: 'neutral' | 'top' | 'bottom' | 'attacking'
  category: PositionCategory
  hint: string
  subsets: string
}

/** Minimum A-game worksheet seats (prototype). */
export const WORKSHEET_SEATS: WorksheetSeat[] = [
  {
    id: 'standing',
    label: 'Standing (neutral)',
    role: 'neutral',
    category: 'standing',
    hint: 'Hand-fight, entries, pulls, shots.',
    subsets:
      'Clinch / Russian / collar tie entries count here. Front headlock chains can go here or in Front Headlock.',
  },
  {
    id: 'front_headlock_top',
    label: 'Front Headlock',
    role: 'top',
    category: 'clinch',
    hint: 'After sprawl / snap-down.',
    subsets: 'Guillotine, anaconda, darce, back take, chin strap to mount.',
  },
  {
    id: 'open_guard_bottom',
    label: 'Open Guard',
    role: 'bottom',
    category: 'guard',
    hint: 'Any non-closed open guard you play.',
    subsets:
      'Loose (no grips) and established (DLR, SLX, shin-to-shin, etc.) both count. Butterfly OK here if distance-based.',
  },
  {
    id: 'open_guard_top',
    label: 'Open Guard',
    role: 'top',
    category: 'pass',
    hint: 'Passing open / seated guards.',
    subsets: 'Standing passer or kneeling / bodylock — both count.',
  },
  {
    id: 'closed_guard_bottom',
    label: 'Closed Guard',
    role: 'bottom',
    category: 'guard',
    hint: 'Legs locked; your bottom A-game.',
    subsets: 'High guard / rubber as flavors of closed.',
  },
  {
    id: 'closed_guard_top',
    label: 'Closed Guard',
    role: 'top',
    category: 'pass',
    hint: 'Break open and leave.',
    subsets:
      'Stand-up, knee cut entry, backstep — list the pass/exit, not every grip break.',
  },
  {
    id: 'half_guard_bottom',
    label: 'Half Guard',
    role: 'bottom',
    category: 'guard',
    hint: 'Your half-guard offense.',
    subsets:
      'Knee shield, deep half, butterfly-half / Z — all count as Half on this sheet.',
  },
  {
    id: 'half_guard_top',
    label: 'Half Guard',
    role: 'top',
    category: 'pass',
    hint: 'Pass or take the back from half.',
    subsets: 'Knee cut, smash, hip switch, back take.',
  },
  {
    id: 'side_control_top',
    label: 'Side Control',
    role: 'top',
    category: 'pin',
    hint: 'Pin + advance.',
    subsets: 'North-south, kesa/scarf count as Side — do not invent a new row.',
  },
  {
    id: 'side_control_bottom',
    label: 'Side Control',
    role: 'bottom',
    category: 'pin',
    hint: 'Escapes and scrambles (offense-first sheet still wants destinations).',
    subsets: 'Recover half/open, take back, roll up.',
  },
  {
    id: 'mount_top',
    label: 'Mount',
    role: 'top',
    category: 'pin',
    hint: 'Control and finish.',
    subsets: 'Low / high / technical / gift wrap count as Mount.',
  },
  {
    id: 'mount_bottom',
    label: 'Mount',
    role: 'bottom',
    category: 'pin',
    hint: 'Get out.',
    subsets: 'Elbow escape, bridge-and-roll, etc.',
  },
  {
    id: 'back_control',
    label: 'Back',
    role: 'top',
    category: 'back',
    hint: 'Hooks in or clear path to finish.',
    subsets: 'Turtle attacks / crucifix can count here if that’s how you play it.',
  },
  {
    id: 'back_bottom',
    label: 'Back',
    role: 'bottom',
    category: 'back',
    hint: 'Escape hooks / hands.',
    subsets: 'Clear hands, escape hips, turn in.',
  },
  {
    id: 'leg_entanglements',
    label: 'Leg Entanglements',
    role: 'attacking',
    category: 'transition',
    hint: 'Established leg offense.',
    subsets:
      'Saddle / 411, 50/50, outside ashi, SLX as entanglement — one bucket.',
  },
]

export type WorksheetMove = {
  rank: number
  name: string
  endsIn: string
  /** How sharp is this move in your A-game (edge weight). */
  belt: BeltRank | ''
  notes: string
}

export type WorksheetSeatAnswers = {
  seatId: string
  moves: WorksheetMove[]
}

export type WorksheetResponse = {
  athleteName: string
  /** Optional; with name forms the cloud identity key. */
  athleteEmail: string
  date: string
  notes: string
  seats: WorksheetSeatAnswers[]
}

export function emptyMove(rank: number): WorksheetMove {
  return {
    rank,
    name: '',
    endsIn: '',
    belt: '',
    notes: '',
  }
}

export function emptyWorksheet(
  athleteName = '',
  athleteEmail = '',
): WorksheetResponse {
  return {
    athleteName,
    athleteEmail,
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    seats: WORKSHEET_SEATS.map((seat) => ({
      seatId: seat.id,
      moves: [1, 2, 3, 4, 5].map(emptyMove),
    })),
  }
}

/** Migrate older worksheet JSON (kind → belt). */
export function normalizeWorksheet(raw: unknown): WorksheetResponse {
  const base = emptyWorksheet('')
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Partial<WorksheetResponse> & {
    seats?: Array<{
      seatId: string
      moves?: Array<Partial<WorksheetMove> & { kind?: string }>
    }>
  }

  return {
    athleteName: data.athleteName ?? '',
    athleteEmail:
      typeof data.athleteEmail === 'string' ? data.athleteEmail : '',
    date: data.date ?? base.date,
    notes: data.notes ?? '',
    seats: WORKSHEET_SEATS.map((seat) => {
      const found = data.seats?.find((s) => s.seatId === seat.id)
      const moves = [1, 2, 3, 4, 5].map((rank) => {
        const m = found?.moves?.find((x) => x.rank === rank)
        if (!m) return emptyMove(rank)
        const belt: BeltRank | '' =
          m.belt === 'white' ||
          m.belt === 'blue' ||
          m.belt === 'purple' ||
          m.belt === 'brown' ||
          m.belt === 'black'
            ? m.belt
            : ''
        return {
          rank,
          name: typeof m.name === 'string' ? m.name : '',
          endsIn: typeof m.endsIn === 'string' ? m.endsIn : '',
          belt,
          notes: typeof m.notes === 'string' ? m.notes : '',
        } satisfies WorksheetMove
      })
      return { seatId: seat.id, moves }
    }),
  }
}

export const BELT_CHOICES: { value: BeltRank | ''; label: string }[] = [
  { value: '', label: 'Unrated' },
  { value: 'white', label: 'White' },
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'brown', label: 'Brown' },
  { value: 'black', label: 'Black' },
]

export const STORAGE_KEY = 'bjj-automata-worksheet-v2'

export const BELT_WEIGHT: Record<BeltRank, number> = {
  white: 1,
  blue: 2,
  purple: 3,
  brown: 4,
  black: 5,
}
