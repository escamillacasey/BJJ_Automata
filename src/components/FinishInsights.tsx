import type { GameGraph } from '../lib/types'
import type { FinishAnalysis } from '../lib/finishAnalysis'
import { getPosition } from '../lib/analysis'

type Props = {
  graph: GameGraph
  analysis: FinishAnalysis
  selectedId: string | null
  onSelect: (id: string) => void
  onHighlight: (ids: string[]) => void
}

function beltWord(w: number) {
  if (w >= 5) return 'black'
  if (w >= 4) return 'brown'
  if (w >= 3) return 'purple'
  if (w >= 2) return 'blue'
  return 'white'
}

export function FinishInsights({
  graph,
  analysis,
  selectedId,
  onSelect,
  onHighlight,
}: Props) {
  const selected = selectedId ? getPosition(graph, selectedId) : null
  const metrics = selectedId ? analysis.nodes[selectedId] : null
  const primary = analysis.bestPaths[0]

  return (
    <aside className="insights">
      <header className="insights__header">
        <h2>Game analysis</h2>
        <p>
          Three coaching questions: best finish chain, what limits it, and where
          the A-game dies.
        </p>
      </header>

      <section>
        <h3>
          <span className="swatch swatch-strength" /> 1. Best path to finish
        </h3>
        {!primary ? (
          <p className="muted">No path to Submission yet.</p>
        ) : (
          <div className="analysis-block">
            <button
              type="button"
              className="analysis-primary"
              onClick={() => {
                onSelect(primary.from)
                onHighlight(primary.path)
              }}
            >
              <strong>
                {getPosition(graph, primary.from)?.label ?? primary.from}
                {' → '}
                Submission
              </strong>
              <span className="gap-path">
                {primary.edges
                  .map(
                    (e) =>
                      `${e.label} (${beltWord(e.weight)})`,
                  )
                  .join(' → ')}
              </span>
              <span className="insight-meta">
                floor {beltWord(primary.minWeight)} · sum {primary.strength} ·{' '}
                {primary.hops} hops
              </span>
            </button>
            <p className="muted analysis-note">
              Ranked by highest minimum belt on the chain (widest path), then
              total weight. Standing’s best chain is always listed when it
              differs. Click to highlight on the flowchart.
            </p>
            {analysis.bestPaths.length > 1 && (
              <ul className="insight-list gap-list">
                {analysis.bestPaths.slice(1).map((p) => (
                  <li key={p.from}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(p.from)
                        onHighlight(p.path)
                      }}
                    >
                      <span>
                        <strong className="gap-label">
                          {getPosition(graph, p.from)?.label ?? p.from}
                        </strong>
                        <span className="gap-path">
                          {p.edgeLabels.join(' → ')}
                        </span>
                      </span>
                      <span className="insight-meta">
                        floor {beltWord(p.minWeight)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h3>
          <span className="swatch swatch-hole" /> 2. Limiting factors
        </h3>
        {analysis.limitingFactors.length === 0 ? (
          <p className="muted">No clear bottlenecks detected yet.</p>
        ) : (
          <ul className="insight-list gap-list">
            {analysis.limitingFactors.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(f.relatedIds[0] ?? null!)
                    onHighlight(f.pathHighlight ?? f.relatedIds)
                  }}
                >
                  <span>
                    <strong className="gap-label">{f.title}</strong>
                    <span className="gap-path">{f.rationale}</span>
                  </span>
                  <span className="insight-meta">P{f.priority}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>
          <span className="swatch swatch-island" /> 3. Weaknesses / dead ends
        </h3>
        {analysis.weaknesses.length === 0 ? (
          <p className="muted">
            No dead ends — every seat can still progress toward a finish.
          </p>
        ) : (
          <ul className="insight-list">
            {analysis.weaknesses.map((id) => {
              const p = getPosition(graph, id)
              const m = analysis.nodes[id]
              const tag = analysis.noOutbound.includes(id)
                ? 'no moves'
                : analysis.cannotFinish.includes(id)
                  ? 'no finish path'
                  : 'weak exits'
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={selectedId === id ? 'is-active' : ''}
                    onClick={() => {
                      onSelect(id)
                      onHighlight([id])
                    }}
                  >
                    <span>{p?.label ?? id}</span>
                    <span className="insight-meta">{tag}</span>
                  </button>
                  {m?.reasons[0] && (
                    <p className="weak-reason">{m.reasons[0]}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selected && metrics && (
        <section className="selected-detail">
          <h3>{selected.label}</h3>
          <dl>
            <div>
              <dt>Outbound</dt>
              <dd>{metrics.outDegree}</dd>
            </div>
            <div>
              <dt>Can finish?</dt>
              <dd>{analysis.canFinish.includes(selected.id) ? 'yes' : 'no'}</dd>
            </div>
          </dl>
          {metrics.reasons.length > 0 && (
            <ul className="reasons">
              {metrics.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </aside>
  )
}
