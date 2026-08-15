import type { ReactNode } from 'react'
import type { GameGraph, GraphAnalysis } from '../lib/types'
import { getPosition } from '../lib/analysis'

type Props = {
  graph: GameGraph
  analysis: GraphAnalysis
  selectedId: string | null
  onSelect: (id: string) => void
  onHighlight: (ids: string[]) => void
  onClaimGap?: (gap: {
    label: string
    from: string
    to: string
    kind: string
  }) => void
}

export function InsightsPanel({
  graph,
  analysis,
  selectedId,
  onSelect,
  onHighlight,
  onClaimGap,
}: Props) {
  const selected = selectedId ? getPosition(graph, selectedId) : null
  const metrics = selectedId ? analysis.nodes[selectedId] : null
  const gaps = analysis.coverageGaps ?? []

  const list = (ids: string[], empty: string): ReactNode => {
    if (!ids.length) return <p className="muted">{empty}</p>
    return (
      <ul className="insight-list">
        {ids.map((id) => {
          const p = getPosition(graph, id)
          const m = analysis.nodes[id]
          return (
            <li key={id}>
              <button
                type="button"
                className={selectedId === id ? 'is-active' : ''}
                onClick={() => {
                  onSelect(id)
                  onHighlight([id])
                }}
                onMouseEnter={() => onHighlight([id])}
              >
                <span>{p?.label ?? id}</span>
                <span className="insight-meta">
                  {m?.inDegree}/{m?.outDegree}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <aside className="insights">
      <header className="insights__header">
        <h2>Automata readout</h2>
        <p>
          Solid edges are your game. Dashed edges are bjjgraph reference flows
          still missing from your notes.
        </p>
      </header>

      <section>
        <h3>
          <span className="swatch swatch-ref" /> Coverage gaps
        </h3>
        {gaps.length === 0 ? (
          <p className="muted">No coverage gaps loaded.</p>
        ) : (
          <ul className="insight-list gap-list">
            {gaps.slice(0, 14).map((gap, i) => {
              const toIsPersonal = !gap.to.startsWith('bjj:')
              return (
              <li key={`${gap.from}-${gap.label}-${gap.to}-${i}`}>
                <div className="gap-row">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(gap.from)
                      onHighlight([gap.from, gap.to])
                    }}
                    onMouseEnter={() => onHighlight([gap.from, gap.to])}
                  >
                    <span>
                      <strong className="gap-label">{gap.label}</strong>
                      <span className="gap-path">
                        {getPosition(graph, gap.from)?.label ?? gap.from}
                        {' → '}
                        {getPosition(graph, gap.to)?.label ?? gap.to}
                      </span>
                    </span>
                    <span className="insight-meta">
                      {gap.successRate != null ? `${gap.successRate}%` : '—'}
                    </span>
                  </button>
                  {onClaimGap && (
                    <button
                      type="button"
                      className="gap-add"
                      onClick={() =>
                        onClaimGap({
                          label: gap.label,
                          from: gap.from,
                          to: toIsPersonal ? gap.to : '',
                          kind: gap.kind,
                        })
                      }
                    >
                      Add
                    </button>
                  )}
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h3>
          <span className="swatch swatch-hole" /> Holes
        </h3>
        {list(analysis.holes, 'No structural holes detected.')}
      </section>

      <section>
        <h3>
          <span className="swatch swatch-strength" /> Strengths
        </h3>
        {list(analysis.strengths, 'No strength hubs yet — rate more positions.')}
      </section>

      <section>
        <h3>
          <span className="swatch swatch-island" /> Islands
        </h3>
        {list(analysis.islands, 'No fully disconnected positions.')}
      </section>

      <section>
        <h3>Dead ends</h3>
        {list(analysis.deadEnds, 'Every reached state has an exit.')}
      </section>

      <section>
        <h3>Orphan entries</h3>
        {list(
          analysis.orphanEntries,
          'No orphan subsystems — every branch is reachable.',
        )}
      </section>

      {selected && (
        <section className="selected-detail">
          <h3>{selected.label}</h3>
          <dl>
            <div>
              <dt>Layer</dt>
              <dd>{selected.referenceOnly ? 'bjjgraph ref' : 'personal'}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{selected.category}</dd>
            </div>
            <div>
              <dt>Proficiency</dt>
              <dd>{selected.proficiency ?? 'unrated'}</dd>
            </div>
            {metrics && (
              <>
                <div>
                  <dt>Degree</dt>
                  <dd>
                    in {metrics.inDegree} · out {metrics.outDegree}
                  </dd>
                </div>
                <div>
                  <dt>Journal heat</dt>
                  <dd>{metrics.journalHeat.toFixed(1)}</dd>
                </div>
              </>
            )}
          </dl>
          {metrics && metrics.reasons.length > 0 && (
            <ul className="reasons">
              {metrics.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {selected.notes && <p className="note">{selected.notes}</p>}
        </section>
      )}
    </aside>
  )
}
