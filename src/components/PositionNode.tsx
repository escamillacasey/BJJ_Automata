import { memo } from 'react'
import { Handle, Position as RFPosition, type NodeProps } from '@xyflow/react'
import type { NodeMetrics, Position } from '../lib/types'
import { beltLabel } from '../lib/analysis'

export type PositionNodeData = {
  position: Position
  metrics: NodeMetrics
  accent: string
  selected?: boolean
}

function beltClass(belt?: string) {
  return belt ? `belt-${belt}` : 'belt-unrated'
}

function PositionNodeComponent({ data, selected }: NodeProps) {
  const { position, metrics, accent } = data as PositionNodeData
  const isRef = Boolean(position.referenceOnly)
  const flags: string[] = []
  if (!isRef) {
    if (metrics.isStrength) flags.push('strength')
    if (metrics.isHole) flags.push('hole')
    if (metrics.isIsland) flags.push('island')
    if (metrics.isDeadEnd) flags.push('dead-end')
  } else {
    flags.push('ref')
  }

  return (
    <div
      className={`pos-node ${flags.join(' ')} ${selected ? 'is-selected' : ''} ${isRef ? 'is-ref' : ''}`}
      style={{ ['--node-accent' as string]: accent }}
    >
      <Handle
        id="in"
        type="target"
        position={RFPosition.Left}
        className="pos-handle"
      />
      <div className="pos-node__top">
        <span className={`belt-dot ${beltClass(position.proficiency)}`} />
        <span className="pos-node__cat">
          {isRef ? 'bjjgraph' : position.category}
        </span>
      </div>
      <div className="pos-node__label">{position.label}</div>
      <div className="pos-node__meta">
        <span>
          in {metrics.inDegree} · out {metrics.outDegree}
        </span>
        <span>{isRef ? 'ref' : beltLabel(metrics.proficiencyScore)}</span>
      </div>
      {flags.length > 0 && (
        <div className="pos-node__flags">
          {flags.map((f) => (
            <span key={f} className={`flag flag-${f}`}>
              {f}
            </span>
          ))}
        </div>
      )}
      <Handle
        id="out"
        type="source"
        position={RFPosition.Right}
        className="pos-handle"
      />
    </div>
  )
}

export const PositionNode = memo(PositionNodeComponent)

export function PhaseNode({ data }: NodeProps) {
  const { label } = data as { label: string }
  return <div className="phase-node">{label}</div>
}
