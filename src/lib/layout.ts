import type { Edge, Node } from '@xyflow/react'
import type { GameGraph, GraphAnalysis, Position, PositionCategory } from './types'
import { categoryColor } from './analysis'

const NODE_W = 176
const NODE_H = 72
const COL_GAP = 72
const ROW_GAP = 18
const HEADER_H = 36

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

function sortInLane(a: Position, b: Position): number {
  // Personal nodes first, then reference; alphabetical within group
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

/**
 * Organized swimlane layout: columns follow BJJ hierarchy,
 * rows stack personal nodes above reference neighbors.
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

  const lanes = new Map<number, Position[]>()
  for (const p of graph.positions) {
    // Hide unused seats with no edges when graph is worksheet-sized? Keep all agreed seats.
    const r = rankOf(p)
    if (!lanes.has(r)) lanes.set(r, [])
    lanes.get(r)!.push(p)
  }
  for (const list of lanes.values()) list.sort(sortInLane)

  const colWidth = NODE_W + COL_GAP
  const nodes: Node[] = []

  for (const rank of [...lanes.keys()].sort((a, b) => a - b)) {
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

  for (const [rank, list] of lanes) {
    list.forEach((p, i) => {
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
  }

  const showLabels = graph.transitions.length <= 60

  const beltStroke = (w: number) => {
    if (w >= 5) return '#e8e4d9'
    if (w >= 4) return '#6b4226'
    if (w >= 3) return '#8b6aa8'
    if (w >= 2) return '#3b6ea8'
    return '#7a7a72'
  }

  const edges: Edge[] = graph.transitions.map((t) => {
    const isRef = Boolean(t.referenceOnly)
    const w =
      edgeWeights[t.id] ??
      (t.proficiency === 'black'
        ? 5
        : t.proficiency === 'brown'
          ? 4
          : t.proficiency === 'purple'
            ? 3
            : t.proficiency === 'blue'
              ? 2
              : t.proficiency === 'white'
                ? 1
                : 2)

    return {
      id: t.id,
      source: t.from,
      target: t.to,
      sourceHandle: 'out',
      targetHandle: 'in',
      label: showLabels && !isRef ? t.label : undefined,
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
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
      },
      labelBgStyle: { fill: 'var(--mat)', fillOpacity: 0.9 },
      data: { transition: t, weight: w },
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
