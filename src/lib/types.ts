/** Belt-colored proficiency from personal notes (white → black). */
export type BeltRank = 'white' | 'blue' | 'purple' | 'brown' | 'black'

export type PositionCategory =
  | 'standing'
  | 'clinch'
  | 'guard'
  | 'pass'
  | 'pin'
  | 'back'
  | 'submission'
  | 'transition'

export type TransitionKind =
  | 'takedown'
  | 'sweep'
  | 'pass'
  | 'escape'
  | 'back_take'
  | 'submission'
  | 'transition'
  | 'retention'

export interface Position {
  id: string
  label: string
  category: PositionCategory
  /** Personal proficiency; omit if unknown / not rated. */
  proficiency?: BeltRank
  /** Outline.md hierarchy belt for the position family. */
  outlineBelt?: BeltRank
  role?: 'top' | 'bottom' | 'neutral' | 'either'
  notes?: string
  sources?: string[]
  /** True when node comes from open-source reference layer. */
  referenceOnly?: boolean
  /** Upstream bjjgraph position id, when applicable. */
  bjjId?: string
  /** Personal position this reference node aliases. */
  personalAlias?: string | null
  pointValue?: number
  positionType?: string
}

export interface Transition {
  id: string
  label: string
  from: string
  to: string
  kind: TransitionKind
  proficiency?: BeltRank
  /** How often this flow appears in journals / best-moves. */
  journalMentions?: number
  notes?: string
  sources?: string[]
  /** True when seeded from open-source ontology, not personal notes. */
  referenceOnly?: boolean
  /** bjjgraph reported success rate (0–100). */
  successRate?: number
  sourceTechniqueId?: string
}

export interface JournalMention {
  date: string
  section: 'focus' | 'improve' | 'sustain' | 'other'
  text: string
  linkedTransitionIds?: string[]
  linkedPositionIds?: string[]
}

export interface GameGraph {
  meta: {
    title: string
    description: string
    sources: string[]
    generatedFrom: string
  }
  positions: Position[]
  transitions: Transition[]
  journalMentions: JournalMention[]
}

export interface NodeMetrics {
  id: string
  inDegree: number
  outDegree: number
  proficiencyScore: number
  journalHeat: number
  isIsland: boolean
  isDeadEnd: boolean
  isOrphanEntry: boolean
  isStrength: boolean
  isHole: boolean
  reasons: string[]
}

export interface GraphAnalysis {
  nodes: Record<string, NodeMetrics>
  islands: string[]
  strengths: string[]
  holes: string[]
  deadEnds: string[]
  orphanEntries: string[]
  missingFlows: Array<{
    from: string
    to: string
    reason: string
    priority: number
  }>
  trainingPriorities: Array<{
    id: string
    title: string
    rationale: string
    priority: number
    relatedIds: string[]
  }>
  coverageGaps?: Array<{
    from: string
    to: string
    label: string
    kind: string
    successRate: number | null
    priority: number
    reason: string
  }>
}
