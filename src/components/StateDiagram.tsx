import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GameGraph, GraphAnalysis } from '../lib/types'
import { layoutGraph } from '../lib/layout'
import { PhaseNode, PositionNode } from './PositionNode'

const nodeTypes: NodeTypes = {
  position: PositionNode,
  phase: PhaseNode,
}

type Props = {
  graph: GameGraph
  analysis: GraphAnalysis
  selectedId: string | null
  onSelect: (id: string | null) => void
  highlightIds?: string[]
  weighted?: boolean
  edgeWeights?: Record<string, number>
}

function shouldShowLabel(
  e: Edge,
  opts: {
    highlightIds: Set<string>
    selectedId: string | null
    hoveredEdgeId: string | null
  },
): boolean {
  const weight = (e.data as { weight?: number } | undefined)?.weight ?? 0
  const moveLabel = (e.data as { moveLabel?: string } | undefined)?.moveLabel
  if (!moveLabel) return false

  // Always label brown/black chains — those are the A-game spine
  if (weight >= 4) return true
  if (opts.hoveredEdgeId === e.id) return true
  if (opts.selectedId && (e.source === opts.selectedId || e.target === opts.selectedId)) {
    return true
  }
  if (
    opts.highlightIds.size > 0 &&
    opts.highlightIds.has(e.source) &&
    opts.highlightIds.has(e.target)
  ) {
    return true
  }
  return false
}

function DiagramInner({
  graph,
  analysis,
  selectedId,
  onSelect,
  highlightIds,
  weighted = false,
  edgeWeights,
}: Props) {
  const { fitView } = useReactFlow()
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const laidOut = useMemo(
    () => layoutGraph(graph, analysis, { weighted, edgeWeights }),
    [graph, analysis, weighted, edgeWeights],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const hi = new Set(highlightIds ?? [])
    setNodes(
      laidOut.nodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        style: {
          ...(n.style ?? {}),
          opacity:
            n.type === 'phase' ||
            hi.size === 0 ||
            hi.has(n.id) ||
            n.id === selectedId
              ? 1
              : 0.18,
          transition: 'opacity 280ms ease',
        },
      })),
    )
    setEdges(
      laidOut.edges.map((e) => {
        const baseOpacity = (e.style?.opacity as number | undefined) ?? 1
        const onHighlightPath =
          hi.size > 0 && hi.has(e.source) && hi.has(e.target)
        const dimmed =
          hi.size > 0 &&
          !onHighlightPath &&
          e.source !== selectedId &&
          e.target !== selectedId
        const showLabel = shouldShowLabel(e, {
          highlightIds: hi,
          selectedId,
          hoveredEdgeId,
        })
        const moveLabel = (e.data as { moveLabel?: string } | undefined)
          ?.moveLabel

        return {
          ...e,
          label: showLabel ? moveLabel : undefined,
          style: {
            ...e.style,
            opacity: dimmed
              ? 0.06
              : onHighlightPath
                ? Math.max(baseOpacity, 0.95)
                : baseOpacity,
            strokeWidth: onHighlightPath
              ? Math.max((e.style?.strokeWidth as number) ?? 2.2, 4)
              : e.style?.strokeWidth,
          },
        }
      }),
    )
  }, [
    laidOut,
    selectedId,
    highlightIds,
    hoveredEdgeId,
    setNodes,
    setEdges,
  ])

  // Refit only when the graph geometry changes — not on hover/selection
  useEffect(() => {
    requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: 280 })
    })
  }, [laidOut, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable
      onNodeClick={(_, node) => {
        if (node.type === 'phase') return
        onSelect(node.id)
      }}
      onPaneClick={() => onSelect(null)}
      onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
      onEdgeMouseLeave={() => setHoveredEdgeId(null)}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'smoothstep' }}
    >
      <Background gap={32} size={1} color="rgba(232,228,217,0.05)" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(n) => {
          if (n.type === 'phase') return 'transparent'
          const m = analysis.nodes[n.id]
          if (m?.isStrength) return '#6b8f71'
          if (m?.isHole) return '#c45c26'
          return '#3a4036'
        }}
        maskColor="rgba(14,16,13,0.72)"
        style={{ background: 'var(--mat)' }}
      />
    </ReactFlow>
  )
}

export function StateDiagram(props: Props) {
  return (
    <div className="diagram-shell">
      <ReactFlowProvider>
        <DiagramInner {...props} />
      </ReactFlowProvider>
    </div>
  )
}
