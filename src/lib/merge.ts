import type { GameGraph, Position, Transition } from './types'
import personalGraphData from '../data/personal-graph.json'
import referenceGraphData from '../data/bjjgraph-reference.json'
import coverageData from '../data/bjjgraph-coverage.json'

export const personalGraph = personalGraphData as GameGraph
export const referenceGraph = referenceGraphData as GameGraph & {
  meta: GameGraph['meta'] & {
    personalToBjj?: Record<string, string>
    upstreamMeta?: Record<string, unknown>
  }
}

export type CoverageGap = {
  from: string
  to: string
  label: string
  kind: string
  successRate: number | null
  sourceTechniqueId?: string
  priority: number
  reason: string
}

export const coverage = coverageData as {
  generatedAt: string
  mappedPositions: Record<string, string>
  referencePositionCount: number
  referenceTransitionCount: number
  gapCount: number
  gaps: CoverageGap[]
  topGaps: CoverageGap[]
}

/**
 * Merge personal + bjjgraph reference neighborhood.
 * Personal nodes win on id collision; reference-only neighbors are added
 * as dimmed states; all reference edges are marked referenceOnly.
 */
export function mergeGraphs(
  personal: GameGraph,
  reference: GameGraph,
  opts: { includeReference: boolean } = { includeReference: true },
): GameGraph {
  if (!opts.includeReference) {
    return {
      ...personal,
      transitions: personal.transitions.filter((t) => !t.referenceOnly),
    }
  }

  const positions: Position[] = [...personal.positions]
  const seen = new Set(positions.map((p) => p.id))

  for (const p of reference.positions) {
    // Skip nodes that alias a personal position — personal node is canonical
    if ((p as Position & { personalAlias?: string | null }).personalAlias) {
      continue
    }
    if (seen.has(p.id)) continue
    seen.add(p.id)
    positions.push({ ...p, referenceOnly: true })
  }

  // Ensure every transition endpoint exists
  const transitions: Transition[] = [
    ...personal.transitions.filter((t) => !t.referenceOnly),
  ]
  const edgeSeen = new Set(transitions.map((t) => t.id))

  for (const t of reference.transitions) {
    if (edgeSeen.has(t.id)) continue
    if (!seen.has(t.from) || !seen.has(t.to)) continue
    edgeSeen.add(t.id)
    transitions.push({ ...t, referenceOnly: true })
  }

  return {
    meta: {
      title: 'Personal + bjjgraph reference',
      description:
        'Personal game automata overlaid with a bjjgraph neighborhood.',
      sources: [
        ...personal.meta.sources,
        ...reference.meta.sources.filter(
          (s) => !personal.meta.sources.includes(s),
        ),
      ],
      generatedFrom: `${personal.meta.generatedFrom} + ${reference.meta.generatedFrom}`,
    },
    positions,
    transitions,
    journalMentions: personal.journalMentions,
  }
}

export function graphStats(graph: GameGraph) {
  const personalPositions = graph.positions.filter((p) => !p.referenceOnly)
  const refPositions = graph.positions.filter((p) => p.referenceOnly)
  const personalTransitions = graph.transitions.filter((t) => !t.referenceOnly)
  const refTransitions = graph.transitions.filter((t) => t.referenceOnly)
  return {
    personalPositions: personalPositions.length,
    refPositions: refPositions.length,
    personalTransitions: personalTransitions.length,
    refTransitions: refTransitions.length,
    totalPositions: graph.positions.length,
    totalTransitions: graph.transitions.length,
  }
}
