import type { BeltRank, GameGraph, Position, Transition } from './types'
import {
  BELT_WEIGHT,
  WORKSHEET_SEATS,
  type WorksheetResponse,
} from './worksheet'
import { slugifyId } from './gameEdits'

const SEAT_IDS = new Set(WORKSHEET_SEATS.map((s) => s.id))

/** Build a graph using only agreed worksheet seats + submission sink. */
export function worksheetToGraph(response: WorksheetResponse): GameGraph {
  const positions: Position[] = WORKSHEET_SEATS.map((seat) => ({
    id: seat.id,
    label:
      seat.role === 'neutral' || seat.role === 'attacking'
        ? seat.label
        : `${seat.label} (${seat.role === 'top' ? 'Top' : 'Bottom'})`,
    category: seat.category,
    role:
      seat.role === 'attacking'
        ? 'either'
        : seat.role === 'neutral'
          ? 'neutral'
          : seat.role,
    sources: ['worksheet'],
    notes: seat.subsets,
  }))

  positions.push({
    id: 'submitted',
    label: 'Submission',
    category: 'submission',
    role: 'either',
    sources: ['worksheet'],
    notes: 'Accepting / terminal state — the finish.',
  })

  const transitions: Transition[] = []

  for (const seat of response.seats) {
    if (!SEAT_IDS.has(seat.seatId)) continue

    for (const move of seat.moves) {
      const name = move.name.trim()
      if (!name) continue

      let to = move.endsIn
      if (!to || (!SEAT_IDS.has(to) && to !== 'submitted')) {
        // Unspecified destination defaults to submission for finish-oriented sheet
        to = 'submitted'
      }

      const belt: BeltRank | undefined = move.belt || undefined
      const id = `ws_${seat.seatId}_${move.rank}_${slugifyId(name)}`

      transitions.push({
        id,
        label: name,
        from: seat.seatId,
        to,
        kind: to === 'submitted' ? 'submission' : 'transition',
        proficiency: belt,
        journalMentions: belt ? BELT_WEIGHT[belt] : 6 - move.rank,
        notes:
          move.notes.trim() ||
          `A-game rank #${move.rank}${belt ? ` · ${belt}` : ''}`,
        sources: ['worksheet', response.athleteName || 'athlete', response.date],
      })
    }
  }

  return {
    meta: {
      title: `A-game · ${response.athleteName || 'Athlete'}`,
      description: `Worksheet graph (${response.date}) — seats only, weighted by belt.`,
      sources: ['worksheet'],
      generatedFrom: 'worksheet-v2',
    },
    positions,
    transitions,
    journalMentions: [],
  }
}

export function countFilledMoves(response: WorksheetResponse): number {
  return response.seats.reduce(
    (n, s) => n + s.moves.filter((m) => m.name.trim()).length,
    0,
  )
}
