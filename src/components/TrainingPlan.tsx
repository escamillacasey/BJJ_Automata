import type { GameGraph, GraphAnalysis } from '../lib/types'
import { getPosition } from '../lib/analysis'

type Props = {
  graph: GameGraph
  analysis: GraphAnalysis
  onFocus: (ids: string[]) => void
}

export function TrainingPlan({ graph, analysis, onFocus }: Props) {
  return (
    <section className="training">
      <header>
        <h2>Training priorities</h2>
        <p>
          Optimize for connectivity: close islands, exit dead ends, and route
          strength hubs into weak neighbors — not isolated technique islands.
        </p>
      </header>

      <ol className="training-list">
        {analysis.trainingPriorities.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onFocus(item.relatedIds)}
              onMouseEnter={() => onFocus(item.relatedIds)}
            >
              <span className="training-rank">{String(i + 1).padStart(2, '0')}</span>
              <span className="training-body">
                <strong>{item.title}</strong>
                <span>{item.rationale}</span>
                <span className="training-tags">
                  {item.relatedIds.map((id) => (
                    <span key={id}>{getPosition(graph, id)?.label ?? id}</span>
                  ))}
                </span>
              </span>
              <span className="training-pri">P{item.priority}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="missing-flows">
        <h3>Missing flows</h3>
        <ul>
          {analysis.missingFlows.map((f) => (
            <li key={`${f.from}-${f.to}-${f.reason}`}>
              <button type="button" onClick={() => onFocus([f.from, f.to])}>
                <strong>
                  {getPosition(graph, f.from)?.label ?? f.from}
                  {' → '}
                  {getPosition(graph, f.to)?.label ?? f.to}
                </strong>
                <span>{f.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
