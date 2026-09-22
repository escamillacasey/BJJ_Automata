import { useEffect, useMemo, useRef, useState } from 'react'
import type { BeltRank } from '../lib/types'
import {
  BELT_CHOICES,
  WORKSHEET_SEATS,
  emptyWorksheet,
  normalizeWorksheet,
  type WorksheetMove,
  type WorksheetResponse,
} from '../lib/worksheet'
import { countFilledMoves } from '../lib/worksheetToGraph'
import {
  canAutosave,
  cloudAvailable,
  fetchCloudWorksheet,
  isValidPin,
  loadLocalWorksheet,
  saveLocalWorksheet,
  syncStatusLabel,
  upsertCloudWorksheet,
  type SyncStatus,
} from '../lib/worksheetStore'
import caseySeed from '../data/worksheet-casey.json'

type Props = {
  onGenerate: (response: WorksheetResponse) => void
}

const LOCAL_SAVED_AT_KEY = 'bjj-automata-worksheet-saved-at'
const SYNC_DEBOUNCE_MS = 800

export function WorksheetForm({ onGenerate }: Props) {
  const [form, setForm] = useState<WorksheetResponse>(loadLocalWorksheet)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => {
    if (!cloudAvailable()) return 'local_only'
    if (!form.athleteName.trim()) return 'need_credentials'
    if (!isValidPin(form.pin ?? '')) return 'need_pin'
    return 'synced'
  })
  const [loading, setLoading] = useState(false)
  const filled = useMemo(() => countFilledMoves(form), [form])
  const skipNextUpsert = useRef(false)

  // Instant local cache (hard-reload safety for the in-progress sheet only)
  useEffect(() => {
    saveLocalWorksheet(form)
    localStorage.setItem(LOCAL_SAVED_AT_KEY, String(Date.now()))
  }, [form])

  // Autosave only — never auto-load from cloud
  useEffect(() => {
    if (!cloudAvailable()) {
      setSyncStatus('local_only')
      return
    }
    if (!form.athleteName.trim()) {
      setSyncStatus('need_credentials')
      return
    }
    if (!isValidPin(form.pin ?? '')) {
      setSyncStatus('need_pin')
      return
    }
    if (skipNextUpsert.current) {
      skipNextUpsert.current = false
      return
    }

    setSyncStatus('saving')
    const handle = window.setTimeout(() => {
      upsertCloudWorksheet(form)
        .then(() => setSyncStatus('synced'))
        .catch(() => setSyncStatus('error'))
    }, SYNC_DEBOUNCE_MS)

    return () => window.clearTimeout(handle)
  }, [form])

  const updateMeta = (patch: Partial<WorksheetResponse>) => {
    setForm((f) => ({ ...f, ...patch }))
  }

  const updateMove = (
    seatId: string,
    rank: number,
    patch: Partial<WorksheetMove>,
  ) => {
    setForm((f) => ({
      ...f,
      seats: f.seats.map((seat) =>
        seat.seatId !== seatId
          ? seat
          : {
              ...seat,
              moves: seat.moves.map((m) =>
                m.rank !== rank ? m : { ...m, ...patch },
              ),
            },
      ),
    }))
  }

  const loadFromCloud = async () => {
    if (!cloudAvailable()) {
      setSyncStatus('local_only')
      return
    }
    if (!form.athleteName.trim() || !isValidPin(form.pin ?? '')) {
      setSyncStatus(
        !form.athleteName.trim() ? 'need_credentials' : 'need_pin',
      )
      return
    }
    if (
      filled > 0 &&
      !confirm(
        'Load will replace the answers on this page with the saved cloud sheet for this name + PIN. Continue?',
      )
    ) {
      return
    }

    setLoading(true)
    try {
      const cloud = await fetchCloudWorksheet(
        form.athleteName,
        form.athleteEmail ?? '',
        form.pin ?? '',
      )
      if (!cloud) {
        setSyncStatus('not_found')
        return
      }
      skipNextUpsert.current = true
      setForm(cloud.form)
      setSyncStatus('loaded')
    } catch {
      setSyncStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const loadDemoSeed = () => {
    if (
      !confirm(
        'Load the demo Prototype 1 answers? Your current sheet in this browser will be replaced.',
      )
    ) {
      return
    }
    setForm((f) => ({
      ...normalizeWorksheet(caseySeed),
      athleteName: f.athleteName,
      athleteEmail: f.athleteEmail,
      pin: f.pin,
    }))
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(cloudSafeDownload(form), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `a-game-worksheet-${form.athleteName || 'athlete'}-${form.date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearForm = () => {
    if (!confirm('Clear move answers? Name, email, and PIN are kept.')) return
    setForm(
      emptyWorksheet(
        form.athleteName,
        form.athleteEmail ?? '',
        form.pin ?? '',
      ),
    )
  }

  const newSheet = () => {
    if (
      filled > 0 &&
      !confirm('Start a blank sheet? Unsaved answers on this page will be cleared.')
    ) {
      return
    }
    setForm(emptyWorksheet())
    setSyncStatus(cloudAvailable() ? 'need_credentials' : 'local_only')
  }

  const canLoad =
    cloudAvailable() &&
    Boolean(form.athleteName.trim()) &&
    isValidPin(form.pin ?? '') &&
    !loading

  return (
    <section className="worksheet">
      <header className="worksheet__hero">
        <div>
          <p className="eyebrow">Prototype · A-game intake</p>
          <h2>Game plan worksheet</h2>
          <p>
            New sheets start blank. Autosave writes your current answers when
            name + PIN are set. Use <strong>Load</strong> only when you want to
            pull a previous cloud sheet — it never loads by itself.
          </p>
        </div>
        <div className="worksheet__status">
          <div className="stat">
            <span className="stat__value">{filled}</span>
            <span className="stat__label">Moves filled</span>
          </div>
          <p className={`sync-status sync-status--${syncStatus}`}>
            {syncStatusLabel(syncStatus)}
          </p>
        </div>
      </header>

      <div className="worksheet__meta">
        <label>
          <span>Athlete</span>
          <input
            value={form.athleteName}
            placeholder="Your name"
            autoComplete="name"
            onChange={(e) => updateMeta({ athleteName: e.target.value })}
          />
        </label>
        <label>
          <span>Email (optional)</span>
          <input
            type="email"
            value={form.athleteEmail ?? ''}
            placeholder="you@example.com"
            autoComplete="email"
            onChange={(e) => updateMeta({ athleteEmail: e.target.value })}
          />
        </label>
        <label>
          <span>PIN (4–6 digits)</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={form.pin ?? ''}
            placeholder="••••"
            autoComplete="off"
            onChange={(e) =>
              updateMeta({
                pin: e.target.value.replace(/\D/g, '').slice(0, 6),
              })
            }
          />
        </label>
        <label>
          <span>Date</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => updateMeta({ date: e.target.value })}
          />
        </label>
        <label className="worksheet__notes">
          <span>Overall notes</span>
          <input
            value={form.notes}
            placeholder="e.g. nogi focus, wrestling base…"
            onChange={(e) => updateMeta({ notes: e.target.value })}
          />
        </label>
      </div>

      <div className="worksheet__actions">
        <button
          type="button"
          className="cta"
          disabled={filled === 0}
          onClick={() => onGenerate(form)}
        >
          Generate flowchart
        </button>
        <button
          type="button"
          className="ghost ghost--emphasis"
          disabled={!canLoad}
          onClick={() => void loadFromCloud()}
        >
          {loading ? 'Loading…' : 'Load saved sheet'}
        </button>
        <button type="button" className="ghost" onClick={newSheet}>
          New sheet
        </button>
        <button type="button" className="ghost" onClick={downloadJson}>
          Download JSON
        </button>
        <button type="button" className="ghost" onClick={loadDemoSeed}>
          Load demo answers
        </button>
        <button type="button" className="ghost" onClick={clearForm}>
          Clear moves
        </button>
      </div>

      {!canAutosave(form) && cloudAvailable() && (
        <p className="worksheet__hint muted">
          Autosave needs a name and a 4–6 digit PIN. Load uses the same pair —
          it will not pull someone else’s sheet without their PIN.
        </p>
      )}

      <div className="worksheet__seats">
        {WORKSHEET_SEATS.map((seat) => {
          const answers = form.seats.find((s) => s.seatId === seat.id)!
          const roleLabel =
            seat.role === 'neutral'
              ? ''
              : seat.role === 'attacking'
                ? ' · attacking'
                : ` · ${seat.role}`

          return (
            <article key={seat.id} className="seat-card" id={`seat-${seat.id}`}>
              <header>
                <h3>
                  {seat.label}
                  <span className="seat-role">{roleLabel}</span>
                </h3>
                <p>{seat.hint}</p>
                <p className="seat-subsets">{seat.subsets}</p>
              </header>

              <div className="seat-moves">
                <div className="seat-moves__head">
                  <span>#</span>
                  <span>Move</span>
                  <span>Ends in</span>
                  <span>Belt weight</span>
                  <span>Notes</span>
                </div>
                {answers.moves.map((move) => (
                  <div key={move.rank} className="seat-move-row">
                    <span className="seat-rank">{move.rank}</span>
                    <input
                      aria-label={`${seat.label} move ${move.rank} name`}
                      placeholder={
                        move.rank === 1 ? 'Best move…' : `Backup #${move.rank}`
                      }
                      value={move.name}
                      onChange={(e) =>
                        updateMove(seat.id, move.rank, { name: e.target.value })
                      }
                    />
                    <select
                      aria-label={`${seat.label} move ${move.rank} destination`}
                      value={move.endsIn}
                      onChange={(e) =>
                        updateMove(seat.id, move.rank, {
                          endsIn: e.target.value,
                        })
                      }
                    >
                      <option value="">Select destination…</option>
                      <option value="submitted">Submission (finish)</option>
                      {WORKSHEET_SEATS.filter((s) => s.id !== seat.id).map(
                        (s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                            {s.role === 'top'
                              ? ' (Top)'
                              : s.role === 'bottom'
                                ? ' (Bottom)'
                                : s.role === 'attacking'
                                  ? ' (Att.)'
                                  : ''}
                          </option>
                        ),
                      )}
                    </select>
                    <select
                      aria-label={`${seat.label} move ${move.rank} belt`}
                      value={move.belt}
                      onChange={(e) =>
                        updateMove(seat.id, move.rank, {
                          belt: e.target.value as BeltRank | '',
                        })
                      }
                    >
                      {BELT_CHOICES.map((b) => (
                        <option key={b.label} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${seat.label} move ${move.rank} notes`}
                      placeholder="Cue…"
                      value={move.notes}
                      onChange={(e) =>
                        updateMove(seat.id, move.rank, {
                          notes: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>

      <div className="worksheet__actions worksheet__actions--footer">
        <button
          type="button"
          className="cta"
          disabled={filled === 0}
          onClick={() => onGenerate(form)}
        >
          Generate flowchart ({filled} moves)
        </button>
      </div>
    </section>
  )
}

function cloudSafeDownload(form: WorksheetResponse) {
  const { pin: _pin, ...rest } = form
  return rest
}
