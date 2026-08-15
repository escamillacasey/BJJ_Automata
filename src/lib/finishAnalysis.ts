import type { BeltRank, GameGraph, GraphAnalysis, NodeMetrics, Transition } from './types'
import { beltScore } from './analysis'

const SINK = 'submitted'

export type PathEdge = {
  id: string
  label: string
  from: string
  to: string
  weight: number
}

export type FinishPath = {
  from: string
  hops: number
  /** Sum of belt weights along the path. */
  strength: number
  /** Minimum belt weight on the path (bottleneck). */
  minWeight: number
  path: string[]
  edges: PathEdge[]
  edgeLabels: string[]
}

export type LimitingFactor = {
  id: string
  kind: 'weak_link' | 'funnel' | 'missing_bridge' | 'no_finish'
  title: string
  rationale: string
  priority: number
  relatedIds: string[]
  pathHighlight?: string[]
}

export type FinishAnalysis = GraphAnalysis & {
  canFinish: string[]
  cannotFinish: string[]
  noOutbound: string[]
  /** Soft dead ends: leave only via weak (≤blue) edges, or can't finish. */
  weaknesses: string[]
  strongestPaths: FinishPath[]
  /** Best overall offensive chains (prefer starting from standing when possible). */
  bestPaths: FinishPath[]
  limitingFactors: LimitingFactor[]
  edgeWeights: Record<string, number>
}

type OutMap = Map<string, Transition[]>

/**
 * Coaching analysis:
 * 1) Best path — maximize min belt (widest/bottleneck path) and report sum strength
 * 2) Limiting factors — weakest link on best paths, funnels, missing bridges
 * 3) Weaknesses — dead ends / no path to Submission
 */
export function analyzeFinishGraph(graph: GameGraph): FinishAnalysis {
  const outbound: OutMap = new Map()
  for (const p of graph.positions) outbound.set(p.id, [])
  for (const t of graph.transitions) {
    if (!outbound.has(t.from)) continue
    outbound.get(t.from)!.push(t)
  }

  const edgeWeights: Record<string, number> = {}
  for (const t of graph.transitions) {
    edgeWeights[t.id] = Math.max(1, beltScore(t.proficiency) || 1)
  }

  const nodes: Record<string, NodeMetrics> = {}
  const canFinish: string[] = []
  const cannotFinish: string[] = []
  const noOutbound: string[] = []
  const weaknesses: string[] = []
  const strongestPaths: FinishPath[] = []

  for (const p of graph.positions) {
    if (p.id === SINK) {
      nodes[p.id] = stub(p.id, {
        reasons: ['Terminal accepting state (finish).'],
      })
      continue
    }

    const outs = outbound.get(p.id) ?? []
    const finishes = bfsReach(p.id, outbound).has(SINK)
    const reasons: string[] = []

    if (outs.length === 0) {
      noOutbound.push(p.id)
      weaknesses.push(p.id)
      reasons.push('Dead end: no outbound moves.')
    }

    if (!finishes) {
      cannotFinish.push(p.id)
      if (!weaknesses.includes(p.id)) weaknesses.push(p.id)
      reasons.push('Dead end for offense: no path to Submission.')
    } else {
      canFinish.push(p.id)
      const wide = widestPath(p.id, SINK, outbound, edgeWeights)
      if (wide) {
        strongestPaths.push(wide)
        reasons.push(
          `Best finish: min belt ${beltName(wide.minWeight)}, sum ${wide.strength}, ${wide.hops} hop(s).`,
        )
        const weakEdge = [...wide.edges].sort((a, b) => a.weight - b.weight)[0]
        if (weakEdge && weakEdge.weight <= 2) {
          reasons.push(
            `Limiting link: “${weakEdge.label}” (${beltName(weakEdge.weight)}).`,
          )
        }
      }

      const maxOut = Math.max(0, ...outs.map((t) => edgeWeights[t.id] ?? 1))
      if (maxOut <= 2 && outs.length > 0) {
        if (!weaknesses.includes(p.id)) weaknesses.push(p.id)
        reasons.push('Only weak (≤ blue) outbound options.')
      }
    }

    const isHole = outs.length === 0 || !finishes
    const isStrength =
      finishes &&
      outs.some((t) => (edgeWeights[t.id] ?? 0) >= 4) &&
      outs.length >= 2

    nodes[p.id] = {
      id: p.id,
      inDegree: graph.transitions.filter((t) => t.to === p.id).length,
      outDegree: outs.length,
      proficiencyScore: maxBelt(outs.map((t) => t.proficiency)),
      journalHeat: outs.reduce((a, t) => a + (edgeWeights[t.id] ?? 0), 0),
      isIsland:
        outs.length === 0 &&
        !graph.transitions.some((t) => t.to === p.id),
      isDeadEnd: outs.length === 0 || !finishes,
      isOrphanEntry: false,
      isStrength,
      isHole,
      reasons,
    }
  }

  // Prefer higher bottleneck, then higher sum, then fewer hops
  strongestPaths.sort(
    (a, b) =>
      b.minWeight - a.minWeight ||
      b.strength - a.strength ||
      a.hops - b.hops,
  )

  const bestPaths = pickBestPaths(strongestPaths)
  const limitingFactors = findLimitingFactors(
    graph,
    outbound,
    edgeWeights,
    bestPaths,
    cannotFinish,
    noOutbound,
  )

  const holes = Object.values(nodes)
    .filter((n) => n.isHole && n.id !== SINK)
    .map((n) => n.id)
  const strengths = Object.values(nodes)
    .filter((n) => n.isStrength)
    .map((n) => n.id)

  const trainingPriorities = limitingFactors.slice(0, 10).map((f) => ({
    id: f.id,
    title: f.title,
    rationale: f.rationale,
    priority: f.priority,
    relatedIds: f.relatedIds,
  }))

  return {
    nodes,
    islands: Object.values(nodes)
      .filter((n) => n.isIsland)
      .map((n) => n.id),
    strengths,
    holes,
    deadEnds: [...new Set([...noOutbound, ...cannotFinish])],
    orphanEntries: [],
    missingFlows: limitingFactors
      .filter((f) => f.kind === 'missing_bridge' || f.kind === 'no_finish')
      .map((f) => ({
        from: f.relatedIds[0] ?? '',
        to: f.relatedIds[1] ?? SINK,
        reason: f.rationale,
        priority: f.priority,
      })),
    trainingPriorities,
    canFinish,
    cannotFinish,
    noOutbound,
    weaknesses,
    strongestPaths: strongestPaths.slice(0, 12),
    bestPaths,
    limitingFactors,
    edgeWeights,
  }
}

function pickBestPaths(paths: FinishPath[]): FinishPath[] {
  if (!paths.length) return []
  // Absolute strongest chain first (widest floor → sum → fewer hops)
  const ranked = [...paths].sort(
    (a, b) =>
      b.minWeight - a.minWeight ||
      b.strength - a.strength ||
      a.hops - b.hops,
  )
  const primary = ranked[0]
  const picked: FinishPath[] = [primary]
  const seen = new Set([primary.from])

  // Always surface the best standing chain if it differs
  const standing = ranked.find((p) => p.from === 'standing')
  if (standing && !seen.has(standing.from)) {
    picked.push(standing)
    seen.add(standing.from)
  }

  for (const p of ranked) {
    if (seen.has(p.from)) continue
    picked.push(p)
    seen.add(p.from)
    if (picked.length >= 5) break
  }
  return picked
}

function findLimitingFactors(
  graph: GameGraph,
  outbound: OutMap,
  edgeWeights: Record<string, number>,
  bestPaths: FinishPath[],
  cannotFinish: string[],
  noOutbound: string[],
): LimitingFactor[] {
  const factors: LimitingFactor[] = []
  const L = (id: string) => label(graph, id)

  // 1) Weakest link on each best path (only when it actually bottlenecks the floor)
  for (const path of bestPaths.slice(0, 3)) {
    if (!path.edges.length) continue
    const weak = [...path.edges].sort((a, b) => a.weight - b.weight)[0]
    const strong = Math.max(...path.edges.map((e) => e.weight))
    // Skip already-black chains, or when every hop is equally strong
    if (path.minWeight >= 5) continue
    if (weak.weight >= strong) continue
    factors.push({
      id: `weak-${path.from}-${weak.id}`,
      kind: 'weak_link',
      title: `Limiting link on best chain from ${L(path.from)}`,
      rationale: `“${weak.label}” (${L(weak.from)} → ${L(weak.to)}) is the weakest step at ${beltName(weak.weight)}. Raising this move raises the whole chain’s floor.`,
      priority: 10 - weak.weight,
      relatedIds: [weak.from, weak.to],
      pathHighlight: path.path,
    })
  }

  // 2) Funnels: high inflow, but weak/no finish options
  const inflow = new Map<string, { count: number; strength: number }>()
  for (const t of graph.transitions) {
    if (t.to === SINK) continue
    const cur = inflow.get(t.to) ?? { count: 0, strength: 0 }
    cur.count += 1
    cur.strength += edgeWeights[t.id] ?? 1
    inflow.set(t.to, cur)
  }

  for (const [id, info] of inflow) {
    if (id === SINK) continue
    if (info.count < 2 && info.strength < 6) continue
    const outs = outbound.get(id) ?? []
    const finishOuts = outs.filter((t) => t.to === SINK)
    const maxFinish = Math.max(
      0,
      ...finishOuts.map((t) => edgeWeights[t.id] ?? 0),
    )
    const advanceOuts = outs.filter((t) => t.to !== SINK)
    const maxAdvance = Math.max(
      0,
      ...advanceOuts.map((t) => edgeWeights[t.id] ?? 0),
    )
    const canFin = bfsReach(id, outbound).has(SINK)
    const bestIn = Math.max(
      0,
      ...graph.transitions
        .filter((t) => t.to === id)
        .map((t) => edgeWeights[t.id] ?? 0),
    )

    if (info.strength >= 6 && finishOuts.length === 0 && canFin === false) {
      factors.push({
        id: `funnel-dead-${id}`,
        kind: 'funnel',
        title: `${L(id)} is a funnel with no finish path`,
        rationale: `${info.count} moves land here (inflow weight ${info.strength}), but nothing reaches Submission. Add a finish or a strong advance out.`,
        priority: 9,
        relatedIds: [id, SINK],
      })
    } else if (
      info.strength >= 6 &&
      finishOuts.length === 0 &&
      maxAdvance > 0 &&
      maxAdvance <= 2
    ) {
      factors.push({
        id: `funnel-weak-${id}`,
        kind: 'funnel',
        title: `${L(id)} collects traffic but only weak exits`,
        rationale: `${info.count} inbound moves, yet best advance out is only ${beltName(maxAdvance)}. This is a classic “everything leads here, then stalls” limiter.`,
        priority: 8,
        relatedIds: [id],
      })
    } else if (
      (info.strength >= 6 || bestIn >= 4) &&
      finishOuts.length > 0 &&
      maxFinish < 4 &&
      maxFinish < bestIn
    ) {
      factors.push({
        id: `funnel-softfinish-${id}`,
        kind: 'funnel',
        title: `${L(id)} needs a sharper submission`,
        rationale: `Entries into ${L(id)} run as high as ${beltName(bestIn)}, but finishes top out at ${beltName(maxFinish)}. The chain is limited by the submission from here — not by getting there.`,
        priority: 8,
        relatedIds: [id, SINK],
      })
    }
  }

  // 3) Missing bridges between strong hubs (advance toward finish only)
  const categoryRank = (id: string) => {
    const p = graph.positions.find((x) => x.id === id)
    if (!p || id === SINK) return 6
    switch (p.category) {
      case 'standing':
        return 0
      case 'clinch':
        return 1
      case 'guard':
        return 2
      case 'pass':
        return 3
      case 'transition':
        return 3
      case 'pin':
        return 4
      case 'back':
        return 5
      case 'submission':
        return 6
      default:
        return 3
    }
  }

  const finishPower = (id: string) =>
    Math.max(
      0,
      ...(outbound.get(id) ?? [])
        .filter((t) => t.to === SINK)
        .map((t) => edgeWeights[t.id] ?? 0),
    )

  const hubs = graph.positions
    .filter((p) => p.id !== SINK)
    .map((p) => {
      const outs = outbound.get(p.id) ?? []
      const maxOut = Math.max(0, ...outs.map((t) => edgeWeights[t.id] ?? 0))
      const inn = inflow.get(p.id)?.strength ?? 0
      const cat = graph.positions.find((x) => x.id === p.id)?.category
      return {
        id: p.id,
        maxOut,
        inn,
        finish: finishPower(p.id),
        rank: categoryRank(p.id),
        score: maxOut + inn / 2,
        isFinishSeat:
          finishPower(p.id) >= 4 &&
          (cat === 'pin' || cat === 'back' || cat === 'submission'),
      }
    })
    .filter((h) => h.maxOut >= 4 || h.inn >= 6 || h.isFinishSeat)
    .sort((a, b) => b.score - a.score)

  const bridgeCandidates: LimitingFactor[] = []
  for (const a of hubs) {
    for (const b of hubs) {
      if (a.id === b.id) continue
      // Only into real finishing seats, strictly advancing the hierarchy
      if (!b.isFinishSeat) continue
      if (b.rank <= a.rank) continue
      // Prefer bridges that unlock a *better* finish than the source already has
      if (b.finish <= a.finish && b.finish < 5) continue

      const direct = (outbound.get(a.id) ?? []).filter((t) => t.to === b.id)
      const bestDirect = Math.max(
        0,
        ...direct.map((t) => edgeWeights[t.id] ?? 0),
      )
      const pathAB = widestPath(a.id, b.id, outbound, edgeWeights)

      if (direct.length === 0 && (!pathAB || pathAB.minWeight <= 2)) {
        if (a.score >= 6) {
          bridgeCandidates.push({
            id: `bridge-${a.id}-${b.id}`,
            kind: 'missing_bridge',
            title: `Missing bridge: ${L(a.id)} → ${L(b.id)}`,
            rationale: `${L(a.id)} is a strong hub and ${L(b.id)} finishes at ${beltName(b.finish)}, but there is no solid transition joining them. A brown+ link here would connect two A-game pieces.`,
            priority: 8 + Math.min(2, Math.floor(a.score / 8)),
            relatedIds: [a.id, b.id],
            pathHighlight: [a.id, b.id],
          })
        }
      } else if (direct.length > 0 && bestDirect <= 2) {
        bridgeCandidates.push({
          id: `weakbridge-${a.id}-${b.id}`,
          kind: 'missing_bridge',
          title: `Weak bridge: ${L(a.id)} → ${L(b.id)}`,
          rationale: `You can move ${L(a.id)} → ${L(b.id)}, but only at ${beltName(bestDirect)}. ${L(b.id)} finishes well — sharpen this transition.`,
          priority: 7,
          relatedIds: [a.id, b.id],
        })
      }
    }
  }

  bridgeCandidates.sort((x, y) => y.priority - x.priority)
  const seenBridge = new Set<string>()
  for (const f of bridgeCandidates) {
    const key = [...(f.relatedIds ?? [])].sort().join('|')
    if (seenBridge.has(key)) continue
    seenBridge.add(key)
    factors.push(f)
    if (seenBridge.size >= 4) break
  }

  for (const id of cannotFinish) {
    factors.push({
      id: `nofinish-${id}`,
      kind: 'no_finish',
      title: `${L(id)} cannot reach Submission`,
      rationale: noOutbound.includes(id)
        ? 'No moves listed from this seat.'
        : 'Outbound moves exist but never arrive at a finish — add an exit that connects to your finishing seats.',
      priority: 9,
      relatedIds: [id, SINK],
    })
  }

  return factors.sort((a, b) => b.priority - a.priority)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 14)
}

function label(graph: GameGraph, id: string) {
  return graph.positions.find((p) => p.id === id)?.label ?? id
}

function beltName(w: number): string {
  if (w >= 5) return 'black'
  if (w >= 4) return 'brown'
  if (w >= 3) return 'purple'
  if (w >= 2) return 'blue'
  return 'white'
}

function stub(id: string, extra: Partial<NodeMetrics>): NodeMetrics {
  return {
    id,
    inDegree: 0,
    outDegree: 0,
    proficiencyScore: 0,
    journalHeat: 0,
    isIsland: false,
    isDeadEnd: false,
    isOrphanEntry: false,
    isStrength: false,
    isHole: false,
    reasons: [],
    ...extra,
  }
}

function maxBelt(belts: (BeltRank | undefined)[]): number {
  return Math.max(0, ...belts.map((b) => beltScore(b)))
}

function bfsReach(start: string, outbound: OutMap): Set<string> {
  const seen = new Set<string>([start])
  const q = [start]
  while (q.length) {
    const cur = q.shift()!
    for (const e of outbound.get(cur) ?? []) {
      if (seen.has(e.to)) continue
      seen.add(e.to)
      q.push(e.to)
    }
  }
  return seen
}

/**
 * Widest path / bottleneck path: maximize the minimum edge weight
 * along a path to the sink. This matches “keep belt level high through
 * the whole chain.” Implemented as a max-bottleneck Dijkstra variant.
 */
function widestPath(
  start: string,
  goal: string,
  outbound: OutMap,
  edgeWeights: Record<string, number>,
): FinishPath | null {
  if (start === goal) {
    return {
      from: start,
      hops: 0,
      strength: 0,
      minWeight: 5,
      path: [start],
      edges: [],
      edgeLabels: [],
    }
  }

  const bot = new Map<string, number>()
  const prev = new Map<
    string,
    { node: string; edgeId: string; label: string; w: number }
  >()
  for (const id of outbound.keys()) bot.set(id, -1)
  bot.set(goal, -1)
  bot.set(start, Infinity)

  const pq: Array<{ id: string; b: number }> = [{ id: start, b: Infinity }]
  const done = new Set<string>()

  while (pq.length) {
    pq.sort((a, b) => b.b - a.b)
    const { id: cur, b } = pq.shift()!
    if (done.has(cur)) continue
    done.add(cur)
    if (cur === goal) break
    if (b !== bot.get(cur)) continue

    for (const e of outbound.get(cur) ?? []) {
      const w = edgeWeights[e.id] ?? 1
      const candidate = Math.min(b, w)
      if (candidate > (bot.get(e.to) ?? -1)) {
        bot.set(e.to, candidate)
        prev.set(e.to, {
          node: cur,
          edgeId: e.id,
          label: e.label,
          w,
        })
        pq.push({ id: e.to, b: candidate })
      }
    }
  }

  if (!prev.has(goal)) return null

  const path: string[] = []
  const edges: PathEdge[] = []
  let cur: string | undefined = goal
  while (cur && cur !== start) {
    path.push(cur)
    const p = prev.get(cur)
    if (!p) return null
    edges.push({
      id: p.edgeId,
      label: p.label,
      from: p.node,
      to: cur,
      weight: p.w,
    })
    cur = p.node
  }
  path.push(start)
  path.reverse()
  edges.reverse()

  const minWeight = Math.min(...edges.map((e) => e.weight))
  const strength = edges.reduce((a, e) => a + e.weight, 0)

  return {
    from: start,
    hops: edges.length,
    strength,
    minWeight: Number.isFinite(minWeight) ? minWeight : 0,
    path,
    edges,
    edgeLabels: edges.map((e) => e.label),
  }
}
