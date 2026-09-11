import type { Edge, Node } from '@xyflow/react'
import type { GameGraph, GraphAnalysis, Position, PositionCategory } from './types'
import { categoryColor } from './analysis'

const NODE_W = 176
const NODE_H = 72
const COL_GAP = 96
const ROW_GAP = 22
const HEADER_H = 36
const BAND_GAP = 56

/** Positional hierarchy: left → right toward the finish. */
const RANK: Record<PositionCategory, number> = {
  standing: 0,
  clinch: 1,
  guard: 2,
  pass: 3,
  transition: 3,
  pin: 4,
  back: 5,
  submission: 6,
}

const PHASE_LABELS: Record<number, string> = {
  0: 'Standing',
  1: 'Clinch',
  2: 'Guard',
  3: 'Passing',
  4: 'Pins',
  5: 'Back',
  6: 'Finish',
}

function rankOf(p: Position): number {
  if (p.id === 'submitted' || p.bjjId === 'game-over') return 6
  return RANK[p.category] ?? 3
}

/** Upper band = top / attacking / neutral / either; lower = bottom. */
function isLowerBand(p: Position): boolean {
  return p.role === 'bottom'
}

function sortInBand(a: Position, b: Position): number {
  const ar = a.referenceOnly ? 1 : 0
  const br = b.referenceOnly ? 1 : 0
  if (ar !== br) return ar - br
  return a.label.localeCompare(b.label)
}

function defaultMetrics(p: Position) {
  return {
    id: p.id,
    inDegree: 0,
    outDegree: 0,
    proficiencyScore: 0,
    journalHeat: 0,
    isIsland: false,
    isDeadEnd: false,
    isOrphanEntry: false,
    isStrength: false,
    isHole: false,
    reasons: p.referenceOnly
      ? ['bjjgraph reference neighbor — not in personal notes.']
      : [],
  }
}

function beltWeight(t: { proficiency?: string | null }): number {
  if (t.proficiency === 'black') return 5
  if (t.proficiency === 'brown') return 4
  if (t.proficiency === 'purple') return 3
  if (t.proficiency === 'blue') return 2
  if (t.proficiency === 'white') return 1
  return 2
}

function beltStroke(w: number) {
  if (w >= 5) return '#e8e4d9'
  if (w >= 4) return '#6b4226'
  if (w >= 3) return '#8b6aa8'
  if (w >= 2) return '#3b6ea8'
  return '#7a7a72'
}

/**
 * Seats with no moves in or out clutter the board — drop them.
 * Always keep Submission as the finish sink.
 */
export function pruneEmptySeats(graph: GameGraph): GameGraph {
  const connected = new Set<string>()
  for (const t of graph.transitions) {
    connected.add(t.from)
    connected.add(t.to)
  }
  const positions = graph.positions.filter(
    (p) => p.id === 'submitted' || connected.has(p.id),
  )
  const ids = new Set(positions.map((p) => p.id))
  const transitions = graph.transitions.filter(
    (t) => ids.has(t.from) && ids.has(t.to),
  )
  return { ...graph, positions, transitions }
}

/**
 * Swimlane layout: columns = hierarchy, Top band above Bottom band.
 * Edge labels are stored on `data` — visibility is decided at render time.
 */
export function layoutGraph(
  graph: GameGraph,
  analysis: GraphAnalysis,
  opts?: {
    weighted?: boolean
    edgeWeights?: Record<string, number>
  },
): { nodes: Node[]; edges: Edge[] } {
  const weighted = opts?.weighted ?? false
  const edgeWeights = opts?.edgeWeights ?? {}
  const pruned = pruneEmptySeats(graph)

  const lanes = new Map<number, Position[]>()
  for (const p of pruned.positions) {
    const r = rankOf(p)
    if (!lanes.has(r)) lanes.set(r, [])
    lanes.get(r)!.push(p)
  }

  let maxUpper = 0
  const partitioned = new Map<
    number,
    { upper: Position[]; lower: Position[] }
  >()
  for (const [rank, list] of lanes) {
    const upper = list.filter((p) => !isLowerBand(p)).sort(sortInBand)
    const lower = list.filter((p) => isLowerBand(p)).sort(sortInBand)
    partitioned.set(rank, { upper, lower })
    maxUpper = Math.max(maxUpper, upper.length)
  }

  const colWidth = NODE_W + COL_GAP
  const upperBandH = maxUpper * (NODE_H + ROW_GAP)
  const lowerStartY = HEADER_H + 12 + upperBandH + (maxUpper > 0 ? BAND_GAP : 0)
  const nodes: Node[] = []

  for (const rank of [...partitioned.keys()].sort((a, b) => a - b)) {
    nodes.push({
      id: `__phase-${rank}`,
      type: 'phase',
      position: { x: rank * colWidth, y: 0 },
      data: { label: PHASE_LABELS[rank] ?? `Phase ${rank}` },
      draggable: false,
      selectable: false,
      connectable: false,
    })
  }

  if (maxUpper > 0) {
    nodes.push({
      id: '__band-top',
      type: 'phase',
      position: { x: -132, y: HEADER_H + 12 },
      data: { label: 'Top' },
      draggable: false,
      selectable: false,
      connectable: false,
      style: { opacity: 0.5, width: 100 },
    })
  }
  const anyLower = [...partitioned.values()].some((b) => b.lower.length > 0)
  if (anyLower) {
    nodes.push({
      id: '__band-bottom',
      type: 'phase',
      position: { x: -132, y: lowerStartY },
      data: { label: 'Bottom' },
      draggable: false,
      selectable: false,
      connectable: false,
      style: { opacity: 0.5, width: 100 },
    })
  }

  for (const [rank, { upper, lower }] of partitioned) {
    upper.forEach((p, i) => {
      const metrics = analysis.nodes[p.id] ?? defaultMetrics(p)
      nodes.push({
        id: p.id,
        type: 'position',
        position: {
          x: rank * colWidth,
          y: HEADER_H + 12 + i * (NODE_H + ROW_GAP),
        },
        data: {
          position: p,
          metrics,
          accent: categoryColor(p.category),
        },
      })
    })
    lower.forEach((p, i) => {
      const metrics = analysis.nodes[p.id] ?? defaultMetrics(p)
      nodes.push({
        id: p.id,
        type: 'position',
        position: {
          x: rank * colWidth,
          y: lowerStartY + i * (NODE_H + ROW_GAP),
        },
        data: {
          position: p,
          metrics,
          accent: categoryColor(p.category),
        },
      })
    })
  }

  const edges: Edge[] = pruned.transitions.map((t) => {
    const isRef = Boolean(t.referenceOnly)
    const w = edgeWeights[t.id] ?? beltWeight(t)

    return {
      id: t.id,
      source: t.from,
      target: t.to,
      sourceHandle: 'out',
      targetHandle: 'in',
      label: undefined,
      type: 'smoothstep',
      animated: !isRef && w >= 4,
      style: {
        stroke: isRef
          ? 'var(--edge-ref)'
          : weighted
            ? beltStroke(w)
            : w >= 4
              ? 'var(--edge-strong)'
              : 'var(--edge)',
        strokeWidth: isRef ? 1 : weighted ? 0.8 + w * 0.55 : w >= 4 ? 2.2 : 1.5,
        strokeDasharray: isRef ? '5 4' : undefined,
        opacity: isRef ? 0.2 : weighted ? 0.55 + w * 0.08 : 0.85,
      },
      labelStyle: {
        fill: 'var(--chalk-dim)',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
      },
      labelBgStyle: { fill: 'var(--mat)', fillOpacity: 0.92 },
      labelBgPadding: [4, 6] as [number, number],
      data: { transition: t, weight: w, moveLabel: t.label },
    }
  })

  return { nodes, edges }
}

export function filterGraph(
  graph: GameGraph,
  opts: {
    hideReference?: boolean
    category?: Position['category'] | 'all'
    focusIds?: string[]
  },
): GameGraph {
  let positions = [...graph.positions]
  let transitions = [...graph.transitions]

  if (opts.hideReference) {
    transitions = transitions.filter((t) => !t.referenceOnly)
    positions = positions.filter((p) => !p.referenceOnly)
  }

  if (opts.category && opts.category !== 'all') {
    const ids = new Set(
      positions.filter((p) => p.category === opts.category).map((p) => p.id),
    )
    for (const t of transitions) {
      if (ids.has(t.from) || ids.has(t.to)) {
        ids.add(t.from)
        ids.add(t.to)
      }
    }
    positions = positions.filter((p) => ids.has(p.id))
    transitions = transitions.filter(
      (t) => ids.has(t.from) && ids.has(t.to),
    )
  }

  if (opts.focusIds?.length) {
    const ids = new Set(opts.focusIds)
    for (const t of graph.transitions) {
      if (ids.has(t.from) || ids.has(t.to)) {
        ids.add(t.from)
        ids.add(t.to)
      }
    }
    positions = positions.filter((p) => ids.has(p.id))
    transitions = transitions.filter(
      (t) => ids.has(t.from) && ids.has(t.to),
    )
  }

  return { ...graph, positions, transitions }
}
