import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { BeltRank } from '../lib/types'
import {
  BELT_CHOICES,
  WORKSHEET_SEATS,
  emptyWorksheet,
  type WorksheetMove,
  type WorksheetResponse,
} from '../lib/worksheet'
import { countFilledMoves } from '../lib/worksheetToGraph'
import {
  authAvailable,
  displayNameFromUser,
  emailFromUser,
  signInWithGoogle,
  signOut,
  subscribeAuth,
} from '../lib/auth'
import {
  cloudAvailable,
  loadLocalWorksheet,
  loadOrCreateUserSheet,
  saveLocalWorksheet,
  syncStatusLabel,
  upsertUserSheet,
  type SyncStatus,
} from '../lib/worksheetStore'

type Props = {
  onGenerate: (response: WorksheetResponse) => void
}

const LOCAL_SAVED_AT_KEY = 'bjj-automata-worksheet-saved-at'
const SYNC_DEBOUNCE_MS = 900

export function WorksheetForm({ onGenerate }: Props) {
  const [form, setForm] = useState<WorksheetResponse>(loadLocalWorksheet)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!authAvailable())
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    cloudAvailable() ? 'signed_out' : 'local_only',
  )
  const [busy, setBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const filled = useMemo(() => countFilledMoves(form), [form])
  const skipNextUpsert = useRef(false)
  const bootstrappedUser = useRef<string | null>(null)

  const user = session?.user ?? null
  const signedIn = Boolean(user)

  useEffect(() => {
    if (!authAvailable()) {
      setAuthReady(true)
      return
    }
    return subscribeAuth((next) => {
      setSession(next)
      setAuthReady(true)
    })
  }, [])

  // Instant local cache
  useEffect(() => {
    saveLocalWorksheet(form)
    localStorage.setItem(LOCAL_SAVED_AT_KEY, String(Date.now()))
  }, [form])

  // On sign-in: load or create the user's cloud sheet once per user id
  useEffect(() => {
    if (!cloudAvailable()) {
      setSyncStatus('local_only')
      return
    }
    if (!authReady) return
    if (!user) {
      bootstrappedUser.current = null
      setSyncStatus('signed_out')
      return
    }
    if (bootstrappedUser.current === user.id) return

    let cancelled = false
    setBusy(true)
    ;(async () => {
      try {
        const result = await loadOrCreateUserSheet(user, form)
        if (cancelled) return
        bootstrappedUser.current = user.id
        skipNextUpsert.current = true
        setForm(result.form)
        setSyncStatus(result.status)
        setAuthError('')
      } catch (e) {
        if (!cancelled) {
          setSyncStatus('error')
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === 'object' &&
                  e &&
                  'message' in e &&
                  typeof (e as { message: unknown }).message === 'string'
                ? (e as { message: string }).message
                : 'Could not load sheet'
          setAuthError(msg)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // intentionally only when user identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authReady])

  // Autosave while signed in
  useEffect(() => {
    if (!cloudAvailable()) {
      setSyncStatus('local_only')
      return
    }
    if (!user) return
    if (bootstrappedUser.current !== user.id) return
    if (skipNextUpsert.current) {
      skipNextUpsert.current = false
      return
    }

    setSyncStatus('saving')
    const handle = window.setTimeout(() => {
      upsertUserSheet(user, form)
        .then(() => setSyncStatus('synced'))
        .catch(() => setSyncStatus('error'))
    }, SYNC_DEBOUNCE_MS)

    return () => window.clearTimeout(handle)
  }, [form, user])

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

  const onGoogleSignIn = async () => {
    setAuthError('')
    setBusy(true)
    const { error } = await signInWithGoogle()
    if (error) {
      setAuthError(error)
      setBusy(false)
    }
    // On success the browser redirects to Google
  }

  const onSignOut = async () => {
    await signOut()
    bootstrappedUser.current = null
    setSyncStatus(cloudAvailable() ? 'signed_out' : 'local_only')
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
    if (!confirm('Clear move answers? Your signed-in account stays.')) return
    setForm(
      emptyWorksheet(
        form.athleteName,
        form.athleteEmail ?? '',
        '',
      ),
    )
  }

  const newSheet = () => {
    if (signedIn) {
      const ok = confirm(
        'New sheet will blank this page and overwrite your cloud save on the next autosave. Cancel unless you mean to start over.',
      )
      if (!ok) return
    } else if (
      filled > 0 &&
      !confirm('Clear this page to a blank sheet?')
    ) {
      return
    }
    setForm(
      emptyWorksheet(
        user ? displayNameFromUser(user) : '',
        user ? emailFromUser(user) : '',
        '',
      ),
    )
  }

  return (
    <section className="worksheet">
      <header className="worksheet__hero">
        <div>
          <p className="eyebrow">A-game intake</p>
          <h2>Game plan worksheet</h2>
          <p>
            {signedIn
              ? 'Your sheet autosaves to this Google account. Use Flowchart when you want path analysis.'
              : 'Sign in with Google first, then fill seats — edits autosave to your account.'}
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
          {signedIn && user && (
            <p className="sync-status sync-status--bound">
              {emailFromUser(user)}
            </p>
          )}
        </div>
      </header>

      <div className="worksheet__auth">
        {signedIn && user ? (
          <>
            <p className="muted">
              Signed in as <strong>{displayNameFromUser(user)}</strong>
            </p>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void onSignOut()}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="cta"
              disabled={busy || !cloudAvailable()}
              onClick={() => void onGoogleSignIn()}
            >
              {busy ? 'Redirecting…' : 'Sign in with Google'}
            </button>
            {!cloudAvailable() && (
              <p className="muted">Cloud is not configured in this build.</p>
            )}
          </>
        )}
        {authError && <p className="admin__error">{authError}</p>}
      </div>

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
          <span>Email</span>
          <input
            type="email"
            value={form.athleteEmail ?? ''}
            placeholder="From Google when signed in"
            readOnly={signedIn}
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
        <button type="button" className="ghost" onClick={newSheet}>
          New sheet
        </button>
        <button type="button" className="ghost" onClick={downloadJson}>
          Download JSON
        </button>
        <button type="button" className="ghost" onClick={clearForm}>
          Clear moves
        </button>
      </div>

      {!signedIn && cloudAvailable() && (
        <p className="worksheet__hint muted">
          You can fill the worksheet offline in this browser. Sign in with
          Google when you want cloud save / restore on another device.
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
