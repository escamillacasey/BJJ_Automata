import type {
  BeltRank,
  GameGraph,
  GraphAnalysis,
  NodeMetrics,
  Position,
  Transition,
} from './types'

const BELT_SCORE: Record<BeltRank, number> = {
  white: 1,
  blue: 2,
  purple: 3,
  brown: 4,
  black: 5,
}

export function beltScore(belt?: BeltRank): number {
  return belt ? BELT_SCORE[belt] : 0
}

export function beltLabel(score: number): BeltRank | 'unrated' {
  if (score >= 5) return 'black'
  if (score >= 4) return 'brown'
  if (score >= 3) return 'purple'
  if (score >= 2) return 'blue'
  if (score >= 1) return 'white'
  return 'unrated'
}

function buildAdjacency(graph: GameGraph) {
  const inbound = new Map<string, Transition[]>()
  const outbound = new Map<string, Transition[]>()

  for (const p of graph.positions) {
    inbound.set(p.id, [])
    outbound.set(p.id, [])
  }

  for (const t of graph.transitions) {
    if (!outbound.has(t.from) || !inbound.has(t.to)) continue
    outbound.get(t.from)!.push(t)
    inbound.get(t.to)!.push(t)
  }

  return { inbound, outbound }
}

function journalHeatFor(
  id: string,
  graph: GameGraph,
  kind: 'position' | 'transition',
): number {
  let heat = 0
  for (const m of graph.journalMentions) {
    const ids =
      kind === 'position' ? m.linkedPositionIds : m.linkedTransitionIds
    if (ids?.includes(id)) {
      heat += m.section === 'improve' ? 2 : m.section === 'focus' ? 1.5 : 1
    }
  }
  return heat
}

/**
 * Automata analysis:
 * - Island: position with no personal inbound AND no outbound (disconnected state)
 * - Orphan entry: has outbound but no inbound (except standing/neutral starts)
 * - Dead end: has inbound but no outbound (and is not the terminal submission state)
 * - Strength: high proficiency + strong connectivity + journal sustain heat
 * - Hole: low/missing proficiency on a frequently reached or journal-improve node,
 *   or a structural gap (island / dead-end / orphan that matters)
 */
export function analyzeGraph(
  graph: GameGraph,
  opts?: {
    coverageGaps?: GraphAnalysis['coverageGaps']
  },
): GraphAnalysis {
  const { inbound, outbound } = buildAdjacency(graph)
  const nodes: Record<string, NodeMetrics> = {}
  const startIds = new Set(['standing', 'submitted'])

  for (const p of graph.positions) {
    if (p.referenceOnly) continue
    const ins = inbound.get(p.id) ?? []
    const outs = outbound.get(p.id) ?? []
    const personalIns = ins.filter((t) => !t.referenceOnly)
    const personalOuts = outs.filter((t) => !t.referenceOnly)
    const inDegree = personalIns.length
    const outDegree = personalOuts.length
    const proficiencyScore = beltScore(p.proficiency ?? p.outlineBelt)
    const heat = journalHeatFor(p.id, graph, 'position')
    const reasons: string[] = []

    const isTerminal = p.id === 'submitted'
    const isIsland =
      !isTerminal && inDegree === 0 && outDegree === 0
    const isDeadEnd = !isTerminal && inDegree > 0 && outDegree === 0
    const isOrphanEntry =
      !isTerminal && !startIds.has(p.id) && inDegree === 0 && outDegree > 0

    if (isIsland) {
      reasons.push('No inbound or outbound personal flows — classic island.')
    }
    if (isDeadEnd) {
      reasons.push(
        'Reached by the graph but has no exits — dead-end state (finish or escape missing).',
      )
    }
    if (isOrphanEntry) {
      reasons.push(
        'Has exits but nothing enters it — orphan subsystem / island entry.',
      )
    }
    if (!p.proficiency && heat > 0) {
      reasons.push('Appears in journals but has no personal proficiency rating.')
    }
    if (proficiencyScore > 0 && proficiencyScore <= 2 && (inDegree + outDegree) >= 2) {
      reasons.push('Blue-or-below skill on a connected position — leverage gap.')
    }

    const connectivity = inDegree + outDegree
    const isStrength =
      !isTerminal &&
      proficiencyScore >= 4 &&
      connectivity >= 3 &&
      !isIsland &&
      !isDeadEnd

    if (isStrength) {
      reasons.push('High proficiency with multiple flows in/out — strength hub.')
    }

    const improveHeat = graph.journalMentions
      .filter(
        (m) =>
          m.section === 'improve' && m.linkedPositionIds?.includes(p.id),
      )
      .reduce((a, _) => a + 1, 0)

    const isHole =
      !isTerminal &&
      (isIsland ||
        isDeadEnd ||
        (isOrphanEntry && proficiencyScore < 4) ||
        improveHeat > 0 ||
        (proficiencyScore > 0 &&
          proficiencyScore <= 2 &&
          connectivity >= 2) ||
        (!p.proficiency && inDegree + outDegree >= 2))

    if (improveHeat > 0) {
      reasons.push('Explicitly tagged Improve in training journals.')
    }

    nodes[p.id] = {
      id: p.id,
      inDegree,
      outDegree,
      proficiencyScore,
      journalHeat: heat,
      isIsland,
      isDeadEnd,
      isOrphanEntry,
      isStrength,
      isHole,
      reasons,
    }
  }

  // Stub metrics for reference-only neighbors so the diagram can render them
  for (const p of graph.positions) {
    if (!p.referenceOnly || nodes[p.id]) continue
    const ins = (inbound.get(p.id) ?? []).length
    const outs = (outbound.get(p.id) ?? []).length
    nodes[p.id] = {
      id: p.id,
      inDegree: ins,
      outDegree: outs,
      proficiencyScore: 0,
      journalHeat: 0,
      isIsland: false,
      isDeadEnd: false,
      isOrphanEntry: false,
      isStrength: false,
      isHole: false,
      reasons: ['bjjgraph reference neighbor — not in personal notes.'],
    }
  }

  const islands = Object.values(nodes)
    .filter((n) => n.isIsland)
    .map((n) => n.id)
  const strengths = Object.values(nodes)
    .filter((n) => n.isStrength)
    .sort(
      (a, b) =>
        b.proficiencyScore + b.outDegree - (a.proficiencyScore + a.outDegree),
    )
    .map((n) => n.id)
  const holes = Object.values(nodes)
    .filter((n) => n.isHole)
    .sort((a, b) => b.journalHeat - a.journalHeat)
    .map((n) => n.id)
  const deadEnds = Object.values(nodes)
    .filter((n) => n.isDeadEnd)
    .map((n) => n.id)
  const orphanEntries = Object.values(nodes)
    .filter((n) => n.isOrphanEntry)
    .map((n) => n.id)

  const missingFlows = detectMissingFlows(graph, nodes)
  const coverageGaps = opts?.coverageGaps ?? []
  const trainingPriorities = buildTrainingPlan(
    graph,
    nodes,
    missingFlows,
    strengths,
    holes,
    coverageGaps,
  )

  return {
    nodes,
    islands,
    strengths,
    holes,
    deadEnds,
    orphanEntries,
    missingFlows,
    trainingPriorities,
    coverageGaps,
  }
}

function detectMissingFlows(
  graph: GameGraph,
  nodes: Record<string, NodeMetrics>,
) {
  const missing: GraphAnalysis['missingFlows'] = []
  const byId = Object.fromEntries(graph.positions.map((p) => [p.id, p]))

  // Collar tie & over/under clinch: entered but no takedowns in personal notes
  for (const id of ['collar_tie', 'over_under'] as const) {
    const n = nodes[id]
    if (n && n.outDegree === 0) {
      missing.push({
        from: id,
        to: 'front_headlock',
        reason: `${byId[id]?.label ?? id} has no outbound takedowns in notes — clinch island.`,
        priority: 8,
      })
    }
  }

  // Gift wrap: entered from mount, no finishes
  if (nodes.gift_wrap?.isDeadEnd) {
    missing.push({
      from: 'gift_wrap',
      to: 'submitted',
      reason: 'Gift Wrap is a dead end — add armbar / bow-and-arrow / RNC path.',
      priority: 7,
    })
  }

  // Crucifix: only one sub, no entry from personal graph
  if (nodes.crucifix?.isOrphanEntry || nodes.crucifix?.inDegree === 0) {
    missing.push({
      from: 'side_control_top',
      to: 'crucifix',
      reason: 'Crucifix has finishes but no personal entry path — orphan subsystem.',
      priority: 6,
    })
  }

  // Guard retention: journal improve with no retention transitions modeled
  const retention = graph.transitions.filter((t) => t.kind === 'retention')
  if (retention.length === 0) {
    missing.push({
      from: 'open_guard_bottom',
      to: 'open_guard_bottom',
      reason:
        'Journals flag guard retention as trash, but no retention transitions exist in the automata.',
      priority: 9,
    })
  }

  // High proficiency side control → should feed back takes more than more subs
  const sideSubs = graph.transitions.filter(
    (t) => t.from === 'side_control_top' && t.kind === 'submission',
  ).length
  const sideBacks = graph.transitions.filter(
    (t) => t.from === 'side_control_top' && t.kind === 'back_take',
  ).length
  if (sideSubs >= 4 && sideBacks <= 1) {
    missing.push({
      from: 'side_control_top',
      to: 'back_control',
      reason:
        'Side control is submission-heavy; journal says reinforce back takes instead of more side subs.',
      priority: 8,
    })
  }

  // Standing → closed/open guard pull not modeled (only top landings)
  const guardPulls = graph.transitions.filter(
    (t) =>
      t.from === 'standing' &&
      (t.to === 'closed_guard_bottom' || t.to === 'open_guard_bottom'),
  )
  if (guardPulls.length === 0) {
    missing.push({
      from: 'standing',
      to: 'closed_guard_bottom',
      reason:
        'No guard-pull transition from standing — bottom game is an island relative to the feet.',
      priority: 7,
    })
  }

  return missing.sort((a, b) => b.priority - a.priority)
}

function buildTrainingPlan(
  graph: GameGraph,
  nodes: Record<string, NodeMetrics>,
  missingFlows: GraphAnalysis['missingFlows'],
  strengths: string[],
  holes: string[],
  coverageGaps: NonNullable<GraphAnalysis['coverageGaps']> = [],
): GraphAnalysis['trainingPriorities'] {
  const byId = Object.fromEntries(graph.positions.map((p) => [p.id, p]))
  const plan: GraphAnalysis['trainingPriorities'] = []

  for (const flow of missingFlows.slice(0, 5)) {
    plan.push({
      id: `flow-${flow.from}-${flow.to}`,
      title: `Connect ${byId[flow.from]?.label ?? flow.from} → ${byId[flow.to]?.label ?? flow.to}`,
      rationale: flow.reason,
      priority: flow.priority,
      relatedIds: [flow.from, flow.to],
    })
  }

  // High-value bjjgraph coverage gaps
  for (const gap of coverageGaps.slice(0, 8)) {
    plan.push({
      id: `gap-${gap.from}-${gap.label}`,
      title: `Add ${gap.label}`,
      rationale: `${gap.reason}${gap.successRate != null ? ` (ref success ~${gap.successRate}%)` : ''}`,
      priority: Math.max(5, gap.priority),
      relatedIds: [gap.from, gap.to].filter(Boolean),
    })
  }

  // Leverage strengths into adjacent holes
  for (const sid of strengths.slice(0, 3)) {
    const strength = byId[sid]
    const adjacentHoles = holes.filter((hid) => {
      return graph.transitions.some(
        (t) =>
          (t.from === sid && t.to === hid) || (t.from === hid && t.to === sid),
      )
    })
    if (adjacentHoles.length) {
      plan.push({
        id: `leverage-${sid}`,
        title: `Leverage ${strength?.label} into weak neighbors`,
        rationale: `Strength hub (${strength?.proficiency ?? 'rated'}) should deliberately feed: ${adjacentHoles
          .map((h) => byId[h]?.label ?? h)
          .join(', ')}.`,
        priority: 7,
        relatedIds: [sid, ...adjacentHoles],
      })
    }
  }

  // Journal improve items
  for (const m of graph.journalMentions.filter((j) => j.section === 'improve')) {
    const ids = [
      ...(m.linkedPositionIds ?? []),
      ...(m.linkedTransitionIds ?? []),
    ]
    if (!ids.length) continue
    plan.push({
      id: `journal-${m.date}-${m.text.slice(0, 24)}`,
      title: `Journal Improve (${m.date})`,
      rationale: m.text,
      priority: 6,
      relatedIds: ids,
    })
  }

  // Dead ends
  for (const id of Object.values(nodes)
    .filter((n) => n.isDeadEnd)
    .map((n) => n.id)) {
    plan.push({
      id: `deadend-${id}`,
      title: `Exit path from ${byId[id]?.label ?? id}`,
      rationale:
        nodes[id].reasons.find((r) => r.includes('dead-end')) ??
        'Add a finish or transition out.',
      priority: 7,
      relatedIds: [id],
    })
  }

  // Deduplicate by title-ish
  const seen = new Set<string>()
  return plan
    .filter((p) => {
      const key = p.title
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 16)
}

export function getPosition(graph: GameGraph, id: string): Position | undefined {
  return graph.positions.find((p) => p.id === id)
}

export function getTransition(
  graph: GameGraph,
  id: string,
): Transition | undefined {
  return graph.transitions.find((t) => t.id === id)
}

export function categoryColor(category: Position['category']): string {
  switch (category) {
    case 'standing':
      return 'var(--cat-standing)'
    case 'clinch':
      return 'var(--cat-clinch)'
    case 'guard':
      return 'var(--cat-guard)'
    case 'pass':
      return 'var(--cat-pass)'
    case 'pin':
      return 'var(--cat-pin)'
    case 'back':
      return 'var(--cat-back)'
    case 'submission':
      return 'var(--cat-sub)'
    default:
      return 'var(--cat-transition)'
  }
}
