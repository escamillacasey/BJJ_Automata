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
  cloudAvailable,
  fetchCloudWorksheet,
  loadLocalWorksheet,
  saveLocalWorksheet,
  shouldPreferCloud,
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    cloudAvailable()
      ? form.athleteName.trim()
        ? 'synced'
        : 'need_name'
      : 'local_only',
  )
  const filled = useMemo(() => countFilledMoves(form), [form])
  const cloudFetchDone = useRef(false)
  const skipNextUpsert = useRef(false)

  // Instant local cache
  useEffect(() => {
    saveLocalWorksheet(form)
    localStorage.setItem(LOCAL_SAVED_AT_KEY, String(Date.now()))
  }, [form])

  // On mount: try restore denser/newer cloud copy for this name+email
  useEffect(() => {
    if (!cloudAvailable() || cloudFetchDone.current) return
    cloudFetchDone.current = true
    const name = form.athleteName.trim()
    if (!name) {
      setSyncStatus('need_name')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const cloud = await fetchCloudWorksheet(
          form.athleteName,
          form.athleteEmail ?? '',
        )
        if (cancelled || !cloud) return
        const localSavedAt = Number(localStorage.getItem(LOCAL_SAVED_AT_KEY))
        if (
          shouldPreferCloud(
            form,
            cloud.form,
            cloud.updatedAt,
            Number.isFinite(localSavedAt) ? localSavedAt : null,
          )
        ) {
          skipNextUpsert.current = true
          setForm(cloud.form)
          setSyncStatus('restored')
        }
      } catch {
        if (!cancelled) setSyncStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount restore only
  }, [])

  // Debounced cloud upsert when name is present
  useEffect(() => {
    if (!cloudAvailable()) {
      setSyncStatus('local_only')
      return
    }
    if (!form.athleteName.trim()) {
      setSyncStatus('need_name')
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

  // Re-fetch when name/email identity changes (cross-device resume)
  const identityKey = `${form.athleteName.trim()}|${(form.athleteEmail ?? '').trim().toLowerCase()}`
  const prevIdentity = useRef(identityKey)
  useEffect(() => {
    if (!cloudAvailable()) return
    if (prevIdentity.current === identityKey) return
    prevIdentity.current = identityKey
    const name = form.athleteName.trim()
    if (!name) {
      setSyncStatus('need_name')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const cloud = await fetchCloudWorksheet(
          form.athleteName,
          form.athleteEmail ?? '',
        )
        if (cancelled || !cloud) return
        if (countFilledMoves(cloud.form) > countFilledMoves(form)) {
          skipNextUpsert.current = true
          setForm(cloud.form)
          setSyncStatus('restored')
        }
      } catch {
        if (!cancelled) setSyncStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity change only
  }, [identityKey])

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

  const loadDemoSeed = () => {
    if (
      !confirm(
        'Load the demo Prototype 1 answers? Your current sheet in this browser will be replaced (cloud will update after sync).',
      )
    ) {
      return
    }
    setForm(normalizeWorksheet(caseySeed))
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(form, null, 2)], {
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
    if (!confirm('Clear this worksheet?')) return
    setForm(emptyWorksheet(form.athleteName, form.athleteEmail ?? ''))
  }

  return (
    <section className="worksheet">
      <header className="worksheet__hero">
        <div>
          <p className="eyebrow">Prototype · A-game intake</p>
          <h2>Game plan worksheet</h2>
          <p>
            List your top moves per seat with a <strong>belt weight</strong>,
            then generate the flowchart. Enter your name (and optional email)
            so progress syncs and hard reloads keep your work.
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
            placeholder="Your name (required to sync)"
            onChange={(e) => updateMeta({ athleteName: e.target.value })}
          />
        </label>
        <label>
          <span>Email (optional)</span>
          <input
            type="email"
            value={form.athleteEmail ?? ''}
            placeholder="you@example.com"
            onChange={(e) => updateMeta({ athleteEmail: e.target.value })}
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
        <button type="button" className="ghost" onClick={downloadJson}>
          Download JSON
        </button>
        <button type="button" className="ghost" onClick={loadDemoSeed}>
          Load demo answers
        </button>
        <button type="button" className="ghost" onClick={clearForm}>
          Clear
        </button>
      </div>

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
