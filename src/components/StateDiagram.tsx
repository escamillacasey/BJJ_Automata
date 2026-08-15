import { useEffect, useMemo } from 'react'
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
        const dimmed =
          hi.size > 0 &&
          !hi.has(e.source) &&
          !hi.has(e.target) &&
          e.source !== selectedId &&
          e.target !== selectedId
        return {
          ...e,
          style: {
            ...e.style,
            opacity: dimmed ? 0.05 : baseOpacity,
          },
        }
      }),
    )
    // Refit after hierarchy changes (personal ↔ reference, category filter)
    requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 280 })
    })
  }, [laidOut, selectedId, highlightIds, setNodes, setEdges, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable
      onNodeClick={(_, node) => {
        if (node.type === 'phase') return
        onSelect(node.id)
      }}
      onPaneClick={() => onSelect(null)}
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
