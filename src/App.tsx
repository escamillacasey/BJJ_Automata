import { useMemo, useState } from 'react'
import type { GameGraph } from './lib/types'
import { filterGraph } from './lib/layout'
import { analyzeFinishGraph } from './lib/finishAnalysis'
import { StateDiagram } from './components/StateDiagram'
import { FinishInsights } from './components/FinishInsights'
import { WorksheetForm } from './components/WorksheetForm'
import {
  countFilledMoves,
  worksheetToGraph,
} from './lib/worksheetToGraph'
import type { WorksheetResponse } from './lib/worksheet'
import './App.css'

type View = 'worksheet' | 'diagram'

export default function App() {
  const [graph, setGraph] = useState<GameGraph | null>(null)
  const [sourceLabel, setSourceLabel] = useState('no worksheet yet')
  const [view, setView] = useState<View>('worksheet')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [highlightIds, setHighlightIds] = useState<string[]>([])
  const [weighted, setWeighted] = useState(true)

  const analysis = useMemo(
    () => (graph ? analyzeFinishGraph(graph) : null),
    [graph],
  )

  const filtered = useMemo(() => {
    if (!graph) return null
    return filterGraph(graph, { hideReference: true })
  }, [graph])

  const stats = useMemo(() => {
    if (!graph || !analysis) {
      return [
        { label: 'Seats', value: 15 },
        { label: 'Moves', value: 0 },
        { label: 'Can finish', value: 0 },
        { label: 'Blocked', value: 0 },
        { label: 'No out', value: 0 },
      ]
    }
    return [
      { label: 'Seats', value: graph.positions.length - 1 },
      { label: 'Moves', value: graph.transitions.length },
      { label: 'Can finish', value: analysis.canFinish.length },
      { label: 'Blocked', value: analysis.cannotFinish.length },
      { label: 'No out', value: analysis.noOutbound.length },
    ]
  }, [graph, analysis])

  const onGenerateWorksheet = (response: WorksheetResponse) => {
    const next = worksheetToGraph(response)
    setGraph(next)
    setSourceLabel(
      `${response.athleteName || 'athlete'} · ${countFilledMoves(response)} moves`,
    )
    setHighlightIds([])
    setSelectedId(null)
    setView('diagram')
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__brand">
          <p className="eyebrow">A-game automata · finish-oriented</p>
          <h1>BJJ Automata</h1>
          <p className="hero__lede">
            Worksheet seats only. Every position should flow toward Submission.
            {graph ? ` Loaded: ${sourceLabel}.` : ' Fill the worksheet to begin.'}
          </p>
        </div>
        <div className="hero__stats" aria-label="Graph statistics">
          {stats.map((s) => (
            <div key={s.label} className="stat">
              <span className="stat__value">{s.value}</span>
              <span className="stat__label">{s.label}</span>
            </div>
          ))}
        </div>
      </header>

      <nav className="toolbar" aria-label="Views and filters">
        <div className="toolbar__tabs">
          <button
            type="button"
            className={view === 'worksheet' ? 'is-active' : ''}
            onClick={() => setView('worksheet')}
          >
            Worksheet
          </button>
          <button
            type="button"
            className={view === 'diagram' ? 'is-active' : ''}
            onClick={() => setView('diagram')}
            disabled={!graph}
          >
            Flowchart
          </button>
        </div>
        {view === 'diagram' && graph && (
          <div className="toolbar__filters">
            <label>
              <input
                type="checkbox"
                checked={weighted}
                onChange={(e) => setWeighted(e.target.checked)}
              />
              Weighted by belt
            </label>
            {highlightIds.length > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setHighlightIds([])
                  setSelectedId(null)
                }}
              >
                Clear focus
              </button>
            )}
          </div>
        )}
      </nav>

      <main className={view === 'worksheet' ? 'main main--worksheet' : 'main'}>
        {view === 'worksheet' ? (
          <WorksheetForm onGenerate={onGenerateWorksheet} />
        ) : filtered && analysis ? (
          <>
            <StateDiagram
              graph={filtered}
              analysis={analysis}
              selectedId={selectedId}
              onSelect={setSelectedId}
              highlightIds={highlightIds}
              weighted={weighted}
              edgeWeights={analysis.edgeWeights}
            />
            <FinishInsights
              graph={filtered}
              analysis={analysis}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onHighlight={setHighlightIds}
            />
          </>
        ) : (
          <p className="muted" style={{ padding: '2rem' }}>
            Generate a flowchart from the worksheet first.
          </p>
        )}
      </main>

      <footer className="footer">
        <p>
          Finish check uses <strong>reachability to Submission</strong> (BFS) and{' '}
          <strong>strongest A-game chains</strong> (Dijkstra on belt weights).
          bjjgraph reference layer removed from this prototype path.
        </p>
      </footer>
    </div>
  )
}
