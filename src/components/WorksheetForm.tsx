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
  clearCloudBind,
  cloudAvailable,
  createCloudWorksheet,
  credentialsReady,
  fetchCloudWorksheet,
  identityKey,
  isValidPin,
  loadCloudBind,
  loadLocalWorksheet,
  saveCloudBind,
  saveLocalWorksheet,
  sameBind,
  syncStatusLabel,
  upsertCloudWorksheet,
  type SyncStatus,
} from '../lib/worksheetStore'
import caseySeed from '../data/worksheet-casey.json'
import recoveryPrimary from '../data/recovery/casey-primary-44.json'
import recoveryPrototype from '../data/recovery/casey-prototype-48.json'

type Props = {
  onGenerate: (response: WorksheetResponse) => void
}

const LOCAL_SAVED_AT_KEY = 'bjj-automata-worksheet-saved-at'
const SYNC_DEBOUNCE_MS = 900

function initialBound(form: WorksheetResponse): boolean {
  if (!cloudAvailable() || !credentialsReady(form)) return false
  const bind = loadCloudBind()
  return Boolean(bind && sameBind(bind, form))
}

function initialStatus(form: WorksheetResponse, bound: boolean): SyncStatus {
  if (!cloudAvailable()) return 'local_only'
  if (!form.athleteName.trim()) return 'need_credentials'
  if (!isValidPin(form.pin ?? '')) return 'need_pin'
  if (!bound) return 'unbound'
  return 'synced'
}

export function WorksheetForm({ onGenerate }: Props) {
  const [form, setForm] = useState<WorksheetResponse>(loadLocalWorksheet)
  const [bound, setBound] = useState(() => initialBound(form))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    initialStatus(form, initialBound(form)),
  )
  const [busy, setBusy] = useState(false)
  const filled = useMemo(() => countFilledMoves(form), [form])
  const skipNextUpsert = useRef(false)
  const boundKeyRef = useRef(bound ? identityKey(form) : '')

  // Instant local cache only (never touches cloud by itself)
  useEffect(() => {
    saveLocalWorksheet(form)
    localStorage.setItem(LOCAL_SAVED_AT_KEY, String(Date.now()))
  }, [form])

  // If name / email / PIN drift from the bound identity, stop cloud writes
  useEffect(() => {
    if (!bound) return
    if (identityKey(form) === boundKeyRef.current) return
    setBound(false)
    boundKeyRef.current = ''
    clearCloudBind()
    setSyncStatus('identity_changed')
  }, [form, bound])

  // Autosave only while bound to a Create/Load session
  useEffect(() => {
    if (!cloudAvailable()) {
      setSyncStatus('local_only')
      return
    }
    if (!bound) return
    if (!credentialsReady(form)) return
    if (identityKey(form) !== boundKeyRef.current) return
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
  }, [form, bound])

  const bindSession = (next: WorksheetResponse) => {
    const bind = {
      athleteName: next.athleteName.trim(),
      athleteEmail: (next.athleteEmail ?? '').trim().toLowerCase(),
      pin: next.pin ?? '',
    }
    saveCloudBind(bind)
    boundKeyRef.current = identityKey(bind)
    setBound(true)
  }

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

  const createSheet = async () => {
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

    setBusy(true)
    try {
      const result = await createCloudWorksheet(form)
      if (result === 'exists') {
        setSyncStatus('exists')
        return
      }
      bindSession(form)
      skipNextUpsert.current = true
      setSyncStatus('created')
    } catch {
      setSyncStatus('error')
    } finally {
      setBusy(false)
    }
  }

  const loadFromCloud = async () => {
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
    if (
      filled > 0 &&
      !confirm(
        'Load will replace everything on this page with the cloud sheet. Your current answers will be discarded unless already saved under another name + PIN. Continue?',
      )
    ) {
      return
    }

    setBusy(true)
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
      bindSession(cloud.form)
      setSyncStatus('loaded')
    } catch {
      setSyncStatus('error')
    } finally {
      setBusy(false)
    }
  }

  const loadDemoSeed = () => {
    if (
      !confirm(
        'Load demo answers into this page? Cloud is not touched until you Create or are already bound and autosave runs.',
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

  const loadRecovery = (which: 'primary' | 'prototype') => {
    const raw = which === 'primary' ? recoveryPrimary : recoveryPrototype
    const label = which === 'primary' ? 'Primary (44 moves)' : 'Prototype 1 (48 moves)'
    if (
      !confirm(
        `Load recovered ${label} into this page? Then click Create or Load if you want cloud sync for that identity.`,
      )
    ) {
      return
    }
    skipNextUpsert.current = true
    setBound(false)
    boundKeyRef.current = ''
    clearCloudBind()
    setForm(normalizeWorksheet(raw))
    setSyncStatus(cloudAvailable() ? 'unbound' : 'local_only')
  }

  const downloadJson = () => {
    const { pin: _pin, ...rest } = form
    const blob = new Blob([JSON.stringify(rest, null, 2)], {
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
    if (!confirm('Clear move answers? Name, email, and PIN stay.')) return
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
      !confirm(
        'Start a blank sheet? This clears the page and turns off cloud autosave until you Create or Load again.',
      )
    ) {
      return
    }
    clearCloudBind()
    boundKeyRef.current = ''
    setBound(false)
    setForm(emptyWorksheet())
    setSyncStatus(cloudAvailable() ? 'need_credentials' : 'local_only')
  }

  const credsOk = credentialsReady(form)

  return (
    <section className="worksheet">
      <header className="worksheet__hero">
        <div>
          <p className="eyebrow">Prototype · A-game intake</p>
          <h2>Game plan worksheet</h2>
          <p>
            Cloud never writes until you <strong>Create</strong> a new sheet or{' '}
            <strong>Load</strong> an existing one. After that, edits autosave to
            that name + PIN only. Changing name/PIN pauses cloud save.
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
          {bound && (
            <p className="sync-status sync-status--bound">
              Bound · cloud autosave on
            </p>
          )}
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
          disabled={!credsOk || busy}
          onClick={() => void createSheet()}
        >
          {busy ? 'Working…' : 'Create cloud sheet'}
        </button>
        <button
          type="button"
          className="ghost ghost--emphasis"
          disabled={!credsOk || busy}
          onClick={() => void loadFromCloud()}
        >
          {busy ? 'Working…' : 'Load saved sheet'}
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
        <button
          type="button"
          className="ghost"
          onClick={() => loadRecovery('prototype')}
        >
          Recover Prototype (48)
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => loadRecovery('primary')}
        >
          Recover Primary (44)
        </button>
        <button type="button" className="ghost" onClick={clearForm}>
          Clear moves
        </button>
      </div>

      <p className="worksheet__hint muted">
        <strong>Create</strong> fails if that name + PIN already exists (use
        Load). <strong>Load</strong> never runs by itself. Browser cache still
        keeps this page across refresh; cloud only updates after Create/Load.
      </p>

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
