import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  fetchAllAdminSheets,
  isAdminConfigured,
  isAdminUnlocked,
  listFilledMoves,
  listSubmissions,
  lockAdmin,
  sheetOptionLabel,
  unlockAdmin,
  type AdminSheetRow,
} from '../lib/adminStore'
import { analyzeFinishGraph } from '../lib/finishAnalysis'
import { worksheetToGraph } from '../lib/worksheetToGraph'
import type { WorksheetResponse } from '../lib/worksheet'

type Props = {
  onOpenFlowchart: (form: WorksheetResponse, label: string) => void
}

export function AdminPanel({ onOpenFlowchart }: Props) {
  const configured = isAdminConfigured()
  const [unlocked, setUnlocked] = useState(() => isAdminUnlocked())
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [rows, setRows] = useState<AdminSheetRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const moves = useMemo(
    () => (selected ? listFilledMoves(selected.form) : []),
    [selected],
  )
  const submissions = useMemo(
    () => (selected ? listSubmissions(selected.form) : []),
    [selected],
  )
  const analysis = useMemo(() => {
    if (!selected || selected.filledMoves === 0) return null
    return analyzeFinishGraph(worksheetToGraph(selected.form))
  }, [selected])

  const refresh = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const next = await fetchAllAdminSheets()
      setRows(next)
      setSelectedId((cur) =>
        cur && next.some((r) => r.id === cur) ? cur : next[0]?.id ?? '',
      )
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load sheets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (unlocked) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  const onUnlock = (e: FormEvent) => {
    e.preventDefault()
    if (!unlockAdmin(password)) {
      setAuthError('Wrong password')
      return
    }
    setAuthError('')
    setPassword('')
    setUnlocked(true)
  }

  const onLock = () => {
    lockAdmin()
    setUnlocked(false)
    setRows([])
    setSelectedId('')
  }

  if (!configured) {
    return (
      <section className="admin">
        <h2>Admin</h2>
        <p className="muted">
          Set <code>VITE_ADMIN_PASSWORD</code> (and Supabase keys) in{' '}
          <code>.env.local</code> / GitHub Actions secrets, then rebuild.
        </p>
      </section>
    )
  }

  if (!unlocked) {
    return (
      <section className="admin admin--gate">
        <h2>Admin</h2>
        <p className="muted">
          Shared password gate (simplest option for GitHub Pages). Session lasts
          until you close the tab.
        </p>
        <form className="admin__login" onSubmit={onUnlock}>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="cta">
            Unlock
          </button>
        </form>
        {authError && <p className="admin__error">{authError}</p>}
      </section>
    )
  }

  return (
    <section className="admin">
      <header className="admin__header">
        <div>
          <p className="eyebrow">Coach view</p>
          <h2>All sheets</h2>
          <p className="muted">
            Includes blank-PIN and empty rows. Pick a user to review gameplan and
            finishes.
          </p>
        </div>
        <div className="admin__header-actions">
          <button type="button" className="ghost" onClick={() => void refresh()}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="ghost" onClick={onLock}>
            Lock
          </button>
        </div>
      </header>

      {loadError && <p className="admin__error">{loadError}</p>}

      <label className="admin__picker">
        <span>Athlete / sheet</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={rows.length === 0}
        >
          {rows.length === 0 && <option value="">No sheets yet</option>}
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {sheetOptionLabel(r)}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <>
          <div className="admin__summary">
            <div className="stat">
              <span className="stat__value">{selected.filledMoves}</span>
              <span className="stat__label">Moves</span>
            </div>
            <div className="stat">
              <span className="stat__value">{submissions.length}</span>
              <span className="stat__label">Submissions</span>
            </div>
            <div className="stat">
              <span className="stat__value">
                {analysis?.bestPaths[0]
                  ? beltWord(analysis.bestPaths[0].minWeight)
                  : '—'}
              </span>
              <span className="stat__label">Best floor</span>
            </div>
            <button
              type="button"
              className="cta"
              disabled={selected.filledMoves === 0}
              onClick={() =>
                onOpenFlowchart(
                  selected.form,
                  `${selected.athleteName} · ${selected.filledMoves} moves`,
                )
              }
            >
              Open flowchart
            </button>
          </div>

          <dl className="admin__meta">
            <div>
              <dt>Name</dt>
              <dd>{selected.athleteName || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{selected.athleteEmail || '—'}</dd>
            </div>
            <div>
              <dt>PIN status</dt>
              <dd>
                {selected.pinHash
                  ? selected.pinHash.length > 12
                    ? 'Hashed PIN on file'
                    : `Legacy/plaintext marker: ${selected.pinHash}`
                  : 'Blank PIN (legacy — Load UI cannot open; admin can)'}
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(selected.updatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{selected.form.notes || '—'}</dd>
            </div>
          </dl>

          {analysis?.bestPaths[0] && (
            <section className="admin__block">
              <h3>Best path</h3>
              <p>
                {analysis.bestPaths[0].edgeLabels.join(' → ') || '—'}
                <span className="muted">
                  {' '}
                  · floor {beltWord(analysis.bestPaths[0].minWeight)}
                </span>
              </p>
            </section>
          )}

          <section className="admin__block">
            <h3>Submissions ({submissions.length})</h3>
            {submissions.length === 0 ? (
              <p className="muted">No finishes listed.</p>
            ) : (
              <ul className="admin__list">
                {submissions.map((m) => (
                  <li key={`${m.seatId}-${m.rank}-${m.name}`}>
                    <strong>{m.name}</strong>
                    <span className="muted">
                      {' '}
                      from {m.seatLabel}
                      {m.role === 'top'
                        ? ' (Top)'
                        : m.role === 'bottom'
                          ? ' (Bottom)'
                          : ''}{' '}
                      · {m.belt}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin__block">
            <h3>Full gameplan ({moves.length})</h3>
            {moves.length === 0 ? (
              <p className="muted">Empty sheet.</p>
            ) : (
              <div className="admin__table-wrap">
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th>Seat</th>
                      <th>#</th>
                      <th>Move</th>
                      <th>Ends in</th>
                      <th>Belt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.map((m) => (
                      <tr key={`${m.seatId}-${m.rank}-${m.name}`}>
                        <td>
                          {m.seatLabel}
                          {m.role === 'top'
                            ? ' · Top'
                            : m.role === 'bottom'
                              ? ' · Bottom'
                              : ''}
                        </td>
                        <td>{m.rank}</td>
                        <td>{m.name}</td>
                        <td>{m.endsInLabel}</td>
                        <td>{m.belt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function beltWord(w: number) {
  if (w >= 5) return 'black'
  if (w >= 4) return 'brown'
  if (w >= 3) return 'purple'
  if (w >= 2) return 'blue'
  return 'white'
}
