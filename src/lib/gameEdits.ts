import type {
  BeltRank,
  GameGraph,
  Position,
  PositionCategory,
  Transition,
  TransitionKind,
} from './types'

export function slugifyId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
}

export type NewMoveInput = {
  label: string
  from: string
  to: string
  kind: TransitionKind
  proficiency?: BeltRank | ''
  notes?: string
  /** Create destination position if missing */
  newToLabel?: string
  newToCategory?: PositionCategory
}

export function addMoveToGraph(graph: GameGraph, input: NewMoveInput): GameGraph {
  const label = input.label.trim()
  if (!label) throw new Error('Move name is required')
  if (!input.from) throw new Error('From position is required')

  let positions = [...graph.positions]
  let toId = input.to

  if (input.newToLabel?.trim()) {
    toId = slugifyId(input.newToLabel)
    if (!positions.some((p) => p.id === toId)) {
      const pos: Position = {
        id: toId,
        label: input.newToLabel.trim(),
        category: input.newToCategory ?? 'transition',
        role: 'either',
        sources: ['ui:add-move'],
      }
      positions = [...positions, pos]
    }
  }

  if (!toId) throw new Error('To position is required')
  if (!positions.some((p) => p.id === input.from)) {
    throw new Error(`Unknown from position: ${input.from}`)
  }
  if (!positions.some((p) => p.id === toId)) {
    throw new Error(`Unknown to position: ${toId}`)
  }

  const idBase = `t_${slugifyId(label)}`
  let id = idBase
  let n = 2
  while (graph.transitions.some((t) => t.id === id)) {
    id = `${idBase}_${n++}`
  }

  const transition: Transition = {
    id,
    label,
    from: input.from,
    to: toId,
    kind: input.kind,
    sources: ['ui:add-move'],
  }
  if (input.proficiency) transition.proficiency = input.proficiency
  if (input.notes?.trim()) transition.notes = input.notes.trim()

  return {
    ...graph,
    positions,
    transitions: [...graph.transitions, transition],
  }
}

export async function savePersonalGraph(graph: GameGraph): Promise<void> {
  const res = await fetch('/api/personal-graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph, null, 2),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: string }).error || `Save failed (${res.status})`,
    )
  }
}

export const KIND_OPTIONS: { value: TransitionKind; label: string }[] = [
  { value: 'takedown', label: 'Takedown' },
  { value: 'sweep', label: 'Sweep' },
  { value: 'pass', label: 'Pass' },
  { value: 'escape', label: 'Escape' },
  { value: 'back_take', label: 'Back take' },
  { value: 'submission', label: 'Submission' },
  { value: 'retention', label: 'Retention' },
  { value: 'transition', label: 'Transition' },
]

export const BELT_OPTIONS: BeltRank[] = [
  'white',
  'blue',
  'purple',
  'brown',
  'black',
]

export const CATEGORY_OPTIONS: PositionCategory[] = [
  'standing',
  'clinch',
  'guard',
  'pass',
  'pin',
  'back',
  'submission',
  'transition',
]
