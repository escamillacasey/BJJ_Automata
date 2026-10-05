import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  SQUADS,
  deleteEntryMedia,
  deleteMedia,
  entriesFor,
  focusPreview,
  focusShift,
  formatEntryDate,
  getMedia,
  latestEntry,
  loadCoachLog,
  pageKey,
  parseCoachLog,
  putMedia,
  safeHttpUrl,
  saveCoachLog,
  serializeCoachLog,
  squadById,
  todayISO,
  videoKey,
  type Athlete,
  type CoachEntry,
  type CoachLogData,
  type EntryKind,
  type SquadId,
} from '../lib/coachStore'
import { gwuNoGi2026 } from '../data/gwuNoGi2026'
import {
  displayNameFromUser,
  signInWithGoogle,
  signOut,
  subscribeAuth,
} from '../lib/auth'
import {
  coachCloudAvailable,
  coachCloudErrorMessage,
  saveTeamLog,
  syncCoachLog,
} from '../lib/coachCloud'
import { importSmoothcompPayload, resultLine, resultSummary } from '../lib/eventResults'
import { EventSummary } from './EventSummary'

type NoteDraft = {
  maintain: string
  videoUrl: string
}

type AthleteDraft = {
  name: string
  level: string
  weight: string
}

const emptyNote = (): NoteDraft => ({
  maintain: '',
  videoUrl: '',
})

const emptyAthlete = (): AthleteDraft => ({
  name: '',
  level: '',
  weight: '',
})

function newId() {
  return crypto.randomUUID()
}

export function CoachLog() {
  const [data, setData] = useState<CoachLogData>(loadCoachLog)
  const [squadId, setSquadId] = useState<SquadId>('navy-bjj')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newAthlete, setNewAthlete] = useState<AthleteDraft>(emptyAthlete)
  const [editDraft, setEditDraft] = useState<AthleteDraft>(emptyAthlete)
  const [editingAthlete, setEditingAthlete] = useState(false)
  const [eventDate, setEventDate] = useState(todayISO)
  const [eventKind, setEventKind] = useState<EntryKind>('competition')
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(emptyNote)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [pageFile, setPageFile] = useState<File | null>(null)
  const [removeVideo, setRemoveVideo] = useState(false)
  const [removePage, setRemovePage] = useState(false)
  const [kindFilter, setKindFilter] = useState<'all' | EntryKind>('all')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const userRef = useRef<User | null>(null)
  userRef.current = user
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pageInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const eventBeforeEdit = useRef({
    date: eventDate,
    kind: eventKind,
  })

  useEffect(() => subscribeAuth((session) => setUser(session?.user ?? null)), [])

  useEffect(() => {
    const seeded = importSmoothcompPayload(gwuNoGi2026)
    const local = loadCoachLog()
    if (seeded.changed) {
      setData(local)
      setSquadId('navy-bjj')
      setStatus(seeded.message)
      setError('')
    }
    if (!user || !coachCloudAvailable()) return
    let cancelled = false
    void (async () => {
      try {
        const synced = await syncCoachLog(loadCoachLog())
        if (cancelled) return
        setData(synced.log)
        if (synced.pushed) setStatus('Saved the coach log to the team database.')
        else if (synced.pulled) setStatus('Loaded the coach log from the team database.')
        setError('')
      } catch (err) {
        if (!cancelled) setError(coachCloudErrorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const squad = squadById(squadId)
  const roster = useMemo(
    () =>
      data.athletes
        .filter((athlete) => athlete.squadId === squadId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.athletes, squadId],
  )
  const selected = data.athletes.find((athlete) => athlete.id === selectedId) ?? null
  const selectedEntries = selected ? entriesFor(data.entries, selected.id) : []
  const latest = selected ? latestEntry(data.entries, selected.id) : undefined
  const visibleEntries =
    kindFilter === 'all'
      ? selectedEntries
      : selectedEntries.filter((entry) => entry.kind === kindFilter)
  const competitions = selectedEntries.filter((entry) => entry.kind === 'competition').slice().reverse()

  function commit(next: CoachLogData) {
    saveCoachLog(next)
    setData(next)
    const signedIn = userRef.current
    if (!signedIn || !coachCloudAvailable()) return
    void saveTeamLog(next).catch((err) => {
      setError(
        `Saved on this browser. ${coachCloudErrorMessage(err)}`,
      )
    })
  }

  async function onGoogleSignIn() {
    setAuthBusy(true)
    setError('')
    const { error: authError } = await signInWithGoogle()
    if (authError) {
      setError(authError)
      setAuthBusy(false)
    }
  }

  function clearFiles() {
    setVideoFile(null)
    setPageFile(null)
    setRemoveVideo(false)
    setRemovePage(false)
    if (videoInputRef.current) videoInputRef.current.value = ''
    if (pageInputRef.current) pageInputRef.current.value = ''
  }

  function resetNoteForm() {
    setNoteDraft(emptyNote())
    setEditingEntryId(null)
    clearFiles()
  }

  function selectAthlete(id: string) {
    setSelectedId(id)
    setEditingAthlete(false)
    setKindFilter('all')
    resetNoteForm()
    setError('')
  }

  function selectSquad(id: SquadId) {
    setSquadId(id)
    setError('')
    setStatus('')
    const athlete = data.athletes.find((item) => item.id === selectedId)
    if (!athlete || athlete.squadId !== id) {
      setSelectedId(null)
      setEditingAthlete(false)
      resetNoteForm()
    }
  }

  function addAthlete(event: FormEvent) {
    event.preventDefault()
    const name = newAthlete.name.trim()
    if (!name) {
      setError('Enter the athlete’s name.')
      return
    }
    const athlete: Athlete = {
      id: newId(),
      squadId,
      name,
      level: newAthlete.level.trim(),
      weight: newAthlete.weight.trim(),
    }
    commit({ ...data, athletes: [...data.athletes, athlete] })
    setNewAthlete(emptyAthlete())
    setSelectedId(athlete.id)
    setEditingAthlete(false)
    resetNoteForm()
    setStatus(`${name} is on the ${squad.name} roster.`)
    setError('')
  }

  function saveAthlete(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const name = editDraft.name.trim()
    if (!name) {
      setError('Enter the athlete’s name.')
      return
    }
    commit({
      ...data,
      athletes: data.athletes.map((athlete) =>
        athlete.id === selected.id
          ? {
              ...athlete,
              name,
              level: editDraft.level.trim(),
              weight: editDraft.weight.trim(),
            }
          : athlete,
      ),
    })
    setEditingAthlete(false)
    setStatus('Athlete updated.')
    setError('')
  }

  async function removeAthlete() {
    if (!selected) return
    const ok = window.confirm(
      `Remove ${selected.name} and every note logged for them on this browser?`,
    )
    if (!ok) return
    const doomed = data.entries.filter((entry) => entry.athleteId === selected.id)
    setSaving(true)
    setError('')
    try {
      await Promise.all(doomed.map((entry) => deleteEntryMedia(entry.id)))
      commit({
        athletes: data.athletes.filter((athlete) => athlete.id !== selected.id),
        entries: data.entries.filter((entry) => entry.athleteId !== selected.id),
      })
      setSelectedId(null)
      setEditingAthlete(false)
      resetNoteForm()
      setStatus(`${selected.name} was removed from this browser.`)
    } catch {
      setError('Could not remove stored video or photos. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry: CoachEntry) {
    eventBeforeEdit.current = { date: eventDate, kind: eventKind }
    setEditingEntryId(entry.id)
    setEventDate(entry.date)
    setEventKind(entry.kind)
    setNoteDraft({
      maintain: entry.maintain,
      videoUrl: entry.videoUrl,
    })
    clearFiles()
    setError('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function cancelEdit() {
    setEventDate(eventBeforeEdit.current.date)
    setEventKind(eventBeforeEdit.current.kind)
    resetNoteForm()
    setError('')
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const maintain = noteDraft.maintain.trim()
    const videoUrl = noteDraft.videoUrl.trim()
    const existing = data.entries.find((entry) => entry.id === editingEntryId)
    const result = existing?.result ?? ''
    const focus = existing?.focus ?? ''
    const record = eventKind === 'competition' ? (existing?.record ?? '') : ''
    const willHaveMedia =
      Boolean(videoFile) ||
      Boolean(pageFile) ||
      Boolean(videoUrl) ||
      Boolean(existing?.hasVideoFile && !removeVideo) ||
      Boolean(existing?.hasNoteImage && !removePage)
    if (!maintain && !willHaveMedia && !result && !focus && !record) {
      setError('Write what to maintain, or attach a photo or video.')
      return
    }
    if (videoFile && videoFile.size > MAX_VIDEO_BYTES) {
      setError('That video is over 80 MB. Paste a link instead.')
      return
    }
    if (pageFile && pageFile.size > MAX_IMAGE_BYTES) {
      setError('That photo is over 10 MB.')
      return
    }
    if (videoFile && !isVideoFile(videoFile)) {
      setError('Choose a video file, or paste a link.')
      return
    }
    if (pageFile && !isImageFile(pageFile)) {
      setError('Choose a photo of the handwritten page.')
      return
    }

    const id = existing?.id ?? newId()
    setSaving(true)
    setError('')
    try {
      let hasVideoFile = existing?.hasVideoFile ?? false
      let videoFileName = existing?.videoFileName ?? ''
      let hasNoteImage = existing?.hasNoteImage ?? false
      let noteImageName = existing?.noteImageName ?? ''
      if (removeVideo) {
        await deleteMedia(videoKey(id))
        hasVideoFile = false
        videoFileName = ''
      }
      if (removePage) {
        await deleteMedia(pageKey(id))
        hasNoteImage = false
        noteImageName = ''
      }
      if (videoFile) {
        await putMedia(videoKey(id), videoFile)
        hasVideoFile = true
        videoFileName = videoFile.name
      }
      if (pageFile) {
        await putMedia(pageKey(id), pageFile)
        hasNoteImage = true
        noteImageName = pageFile.name
      }

      const nextEntry: CoachEntry = {
        id,
        athleteId: selected.id,
        date: eventDate || todayISO(),
        kind: eventKind,
        eventName: existing?.eventName ?? '',
        result,
        ...(record ? { record } : {}),
        focus,
        maintain,
        videoUrl,
        hasVideoFile,
        videoFileName,
        hasNoteImage,
        noteImageName,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        ...(existing?.sourceId ? { sourceId: existing.sourceId } : {}),
        ...(existing?.sourceUrl ? { sourceUrl: existing.sourceUrl } : {}),
      }
      const entries = existing
        ? data.entries.map((entry) => (entry.id === id ? nextEntry : entry))
        : [...data.entries, nextEntry]
      commit({ ...data, entries })
      if (existing) {
        setEventDate(eventBeforeEdit.current.date)
        setEventKind(eventBeforeEdit.current.kind)
      }
      resetNoteForm()
      setStatus(existing ? 'Note updated.' : `Saved for ${selected.name}.`)
    } catch {
      setError('Could not store the file in this browser.')
    } finally {
      setSaving(false)
    }
  }

  async function removeEntry(entry: CoachEntry) {
    const label = entry.eventName || formatEntryDate(entry.date)
    if (!window.confirm(`Delete the note from ${label}?`)) return
    setSaving(true)
    setError('')
    try {
      await deleteEntryMedia(entry.id)
      commit({
        ...data,
        entries: data.entries.filter((item) => item.id !== entry.id),
      })
      if (editingEntryId === entry.id) cancelEdit()
      setStatus('Note deleted.')
    } catch {
      setError('Could not delete the attached file. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function exportLog() {
    const blob = new Blob([serializeCoachLog(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `coach-log-${todayISO()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus('Backup downloaded. Video files are not inside it.')
    setError('')
  }

  async function importLog(file: File) {
    setError('')
    try {
      const parsed = parseCoachLog(JSON.parse(await file.text()))
      if (!parsed) {
        setError('That file is not a coach log backup.')
        return
      }
      const ok = window.confirm(
        'Replace the roster and notes on this browser with the backup? Video files already stored here stay put.',
      )
      if (!ok) return
      commit(parsed)
      setSelectedId(null)
      resetNoteForm()
      setStatus('Backup restored.')
    } catch {
      setError('Could not read that backup file.')
    }
  }

  const editingEntry = data.entries.find((entry) => entry.id === editingEntryId)

  return (
    <section className="coach">
      <header className="coach__header">
        <div>
          <p className="eyebrow">
            {user ? `Signed in as ${displayNameFromUser(user)}` : 'Both squads'}
          </p>
          <h2>Coach log</h2>
          <p>
            After a competition or practice, write what to maintain. Attach a
            photo or video when you have one.
          </p>
        </div>
        <div className="coach__header-actions">
          {user ? (
            <button type="button" className="ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className="cta"
              disabled={authBusy || !coachCloudAvailable()}
              onClick={() => void onGoogleSignIn()}
            >
              {authBusy ? 'Redirecting…' : 'Sign in with Google'}
            </button>
          )}
          <button
            type="button"
            className={showSummary ? 'ghost ghost--emphasis' : 'ghost'}
            onClick={() => setShowSummary((open) => !open)}
          >
            Event summary
          </button>
          <button type="button" className="ghost" onClick={exportLog}>
            Export backup
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => importInputRef.current?.click()}
          >
            Import backup
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void importLog(file)
            }}
          />
        </div>
      </header>

      <div className="coach__squads" role="tablist" aria-label="Squads">
        {SQUADS.map((item) => {
          const count = data.athletes.filter((athlete) => athlete.squadId === item.id).length
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={squadId === item.id}
              className={squadId === item.id ? 'is-active' : ''}
              onClick={() => selectSquad(item.id)}
            >
              {item.name}
              <span>{count}</span>
            </button>
          )
        })}
      </div>

      <p className="coach__hint">
        {user
          ? 'Notes save to the team database while you are signed in. Video files stay on this device and are not in the backup.'
          : coachCloudAvailable()
            ? 'Sign in with Google to save these notes to the team database. Until then they stay on this browser. Video files stay on this device.'
            : 'Cloud sign-in is not configured in this build. Notes stay on this browser. Video files stay on this device and are not in the backup.'}
      </p>
      {status && (
        <p className="coach__status" aria-live="polite">
          {status}
        </p>
      )}
      {error && (
        <p className="coach__error" role="alert">
          {error}
        </p>
      )}

      {showSummary && <EventSummary log={data} onStatus={setStatus} />}

      <div className="coach__layout">
        <aside className="coach__roster">
          <h3>{squad.name}</h3>
          {roster.length === 0 ? (
            <p className="muted">No athletes yet. Add the first one below.</p>
          ) : (
            <ul className="coach-roster">
              {roster.map((athlete) => {
                const recent = latestEntry(data.entries, athlete.id)
                const meta = [athlete.club, athlete.level, athlete.weight]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={athlete.id}>
                    <button
                      type="button"
                      className={
                        athlete.id === selectedId ? 'coach-card is-active' : 'coach-card'
                      }
                      onClick={() => selectAthlete(athlete.id)}
                    >
                      <span className="coach-card__name">{athlete.name}</span>
                      {meta && <span className="coach-card__meta">{meta}</span>}
                      <span className="coach-card__focus">{focusPreview(recent)}</span>
                      {recent && (
                        <span className="coach-card__when">
                          {recent.kind === 'competition' ? 'Competition' : 'Practice'}
                          {' · '}
                          {formatEntryDate(recent.date)}
                          {resultLine(recent.result, recent.record)
                            ? ` · ${resultLine(recent.result, recent.record)}`
                            : ''}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <form className="coach-add" onSubmit={addAthlete}>
            <h3>Add athlete</h3>
            <label>
              <span>Name</span>
              <input
                value={newAthlete.name}
                onChange={(event) =>
                  setNewAthlete((draft) => ({ ...draft, name: event.target.value }))
                }
                autoComplete="off"
              />
            </label>
            <div className="coach-add__row">
              <label>
                <span>{squad.levelLabel}</span>
                <input
                  value={newAthlete.level}
                  placeholder={squad.levelPlaceholder}
                  onChange={(event) =>
                    setNewAthlete((draft) => ({ ...draft, level: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Weight</span>
                <input
                  value={newAthlete.weight}
                  placeholder="Optional"
                  onChange={(event) =>
                    setNewAthlete((draft) => ({ ...draft, weight: event.target.value }))
                  }
                />
              </label>
            </div>
            <button type="submit" className="ghost ghost--emphasis">
              Add to {squad.name}
            </button>
          </form>
        </aside>

        <div className="coach__detail">
          {!selected ? (
            <div className="coach-empty">
              <h3>Pick an athlete</h3>
              <p>
                The roster card shows the latest focus. Open an athlete to log
                the handwritten note from today and to read how the result and
                the focus have moved.
              </p>
            </div>
          ) : (
            <>
              <header className="coach-athlete">
                <div>
                  <h3>{selected.name}</h3>
                  <p>
                    {[selected.club, selected.level, selected.weight]
                      .filter(Boolean)
                      .join(' · ') || squad.name}
                  </p>
                </div>
                <div className="coach-athlete__actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setEditingAthlete((open) => !open)
                      setEditDraft({
                        name: selected.name,
                        level: selected.level,
                        weight: selected.weight,
                      })
                    }}
                  >
                    {editingAthlete ? 'Close' : 'Edit athlete'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void removeAthlete()}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              </header>

              {editingAthlete && (
                <form className="coach-add" onSubmit={saveAthlete}>
                  <label>
                    <span>Name</span>
                    <input
                      value={editDraft.name}
                      onChange={(event) =>
                        setEditDraft((draft) => ({ ...draft, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="coach-add__row">
                    <label>
                      <span>{squad.levelLabel}</span>
                      <input
                        value={editDraft.level}
                        onChange={(event) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            level: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Weight</span>
                      <input
                        value={editDraft.weight}
                        onChange={(event) =>
                          setEditDraft((draft) => ({
                            ...draft,
                            weight: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button type="submit" className="ghost ghost--emphasis">
                    Save athlete
                  </button>
                </form>
              )}

              <section className="coach-standing" aria-label="Current focus">
                <div>
                  <p className="eyebrow">Focus on</p>
                  <p>{standingFocus(latest)}</p>
                </div>
                <div>
                  <p className="eyebrow">Maintain</p>
                  <p>{latest?.maintain.trim() || 'Nothing logged yet.'}</p>
                </div>
              </section>

              <section className="coach-progress" aria-label="Competition results">
                <h3>Results</h3>
                {competitions.length === 0 ? (
                  <p className="muted">No competition results yet.</p>
                ) : (
                  <ol className="coach-results">
                    {competitions.map((entry, index) => (
                      <li
                        key={entry.id}
                        className={
                          index === competitions.length - 1 ? 'is-latest' : undefined
                        }
                      >
                        <span>{formatEntryDate(entry.date)}</span>
                        <strong>
                          {resultLine(entry.result, entry.record) || 'Result not logged'}
                        </strong>
                        <span>{entry.eventName || 'Competition'}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <form className="coach-form" ref={formRef} onSubmit={(event) => void saveNote(event)}>
                <h3>{editingEntry ? 'Update this note' : 'Log this event'}</h3>
                <div className="coach-form__meta">
                  <label>
                    <span>Date</span>
                    <input
                      type="date"
                      value={eventDate}
                      required
                      onChange={(event) => setEventDate(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Kind</span>
                    <select
                      value={eventKind}
                      onChange={(event) => setEventKind(event.target.value as EntryKind)}
                    >
                      <option value="competition">Competition</option>
                      <option value="practice">Practice</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>Maintain</span>
                  <textarea
                    rows={3}
                    value={noteDraft.maintain}
                    placeholder={squad.maintainPlaceholder}
                    onChange={(event) =>
                      setNoteDraft((draft) => ({ ...draft, maintain: event.target.value }))
                    }
                  />
                </label>
                <div className="coach-form__media">
                  <label>
                    <span>Photo of handwritten notes</span>
                    <input
                      ref={pageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => setPageFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    <span>Video link</span>
                    <input
                      value={noteDraft.videoUrl}
                      placeholder="YouTube, Drive, or other link"
                      onChange={(event) =>
                        setNoteDraft((draft) => ({ ...draft, videoUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Video file, up to 80 MB</span>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                {editingEntry?.hasNoteImage && (
                  <label className="coach-form__check">
                    <input
                      type="checkbox"
                      checked={removePage}
                      onChange={(event) => setRemovePage(event.target.checked)}
                    />
                    <span>Remove handwritten photo ({editingEntry.noteImageName || 'saved'})</span>
                  </label>
                )}
                {editingEntry?.hasVideoFile && (
                  <label className="coach-form__check">
                    <input
                      type="checkbox"
                      checked={removeVideo}
                      onChange={(event) => setRemoveVideo(event.target.checked)}
                    />
                    <span>Remove video file ({editingEntry.videoFileName || 'saved'})</span>
                  </label>
                )}
                <div className="coach-form__actions">
                  <button type="submit" className="ghost ghost--emphasis" disabled={saving}>
                    {saving ? 'Saving…' : editingEntry ? 'Update note' : 'Save note'}
                  </button>
                  {editingEntry && (
                    <button type="button" className="ghost" onClick={cancelEdit}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <section className="coach-log" aria-label="Note history">
                <div className="coach-log__head">
                  <h3>History</h3>
                  <div className="coach-log__filters" role="group" aria-label="Filter notes">
                    {(
                      [
                        ['all', 'All'],
                        ['competition', 'Competitions'],
                        ['practice', 'Practices'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={kindFilter === id ? 'is-active' : ''}
                        onClick={() => setKindFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {visibleEntries.length === 0 ? (
                  <p className="muted">No notes in this view yet.</p>
                ) : (
                  <ol className="coach-entries">
                    {visibleEntries.map((entry) => {
                      const older = selectedEntries[selectedEntries.indexOf(entry) + 1]
                      const shift = focusShift(entry, older)
                      return (
                        <li key={entry.id} className="coach-entry">
                          <header>
                            <div>
                              <strong>
                                {formatEntryDate(entry.date)}
                                {' · '}
                                {entry.kind === 'competition' ? 'Competition' : 'Practice'}
                              </strong>
                              <span>
                                {entry.eventName || 'Untitled'}
                                {resultLine(entry.result, entry.record)
                                  ? ` · ${resultLine(entry.result, entry.record)}`
                                  : ''}
                              </span>
                            </div>
                            {shift === 'same' && (
                              <em title={older?.focus}>Still the focus</em>
                            )}
                            {shift === 'shifted' && (
                              <em title={older?.focus}>Focus changed</em>
                            )}
                          </header>
                          {entry.result && entry.result.trim() !== resultSummary(entry.result) && (
                            <p>
                              <span>Result</span>
                              {entry.result}
                            </p>
                          )}
                          {entry.focus && (
                            <p>
                              <span>Focus on</span>
                              {entry.focus}
                            </p>
                          )}
                          {entry.maintain && (
                            <p>
                              <span>Maintain</span>
                              {entry.maintain}
                            </p>
                          )}
                          <EntryMedia entry={entry} />
                          <div className="coach-entry__actions">
                            <button type="button" className="ghost" onClick={() => startEdit(entry)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => void removeEntry(entry)}
                              disabled={saving}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function standingFocus(entry: CoachEntry | undefined): string {
  if (!entry) return 'Nothing logged yet.'
  if (entry.focus.trim()) return entry.focus.trim()
  if (entry.hasNoteImage) {
    return 'Handwritten page is attached. Type the focus so it stays on the roster.'
  }
  return 'Nothing logged yet.'
}

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return /\.(mp4|mov|webm|m4v)$/i.test(file.name)
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
}

function EntryMedia({ entry }: { entry: CoachEntry }) {
  const href = safeHttpUrl(entry.videoUrl)
  return (
    <>
      {entry.hasNoteImage && (
        <StoredMedia
          mediaKey={pageKey(entry.id)}
          kind="image"
          name={entry.noteImageName || 'Handwritten notes'}
        />
      )}
      {entry.hasVideoFile && (
        <StoredMedia
          mediaKey={videoKey(entry.id)}
          kind="video"
          name={entry.videoFileName || 'Event video'}
        />
      )}
      {entry.videoUrl &&
        (href ? (
          <a href={href} target="_blank" rel="noreferrer">
            Open event video
          </a>
        ) : (
          <p className="coach-entry__link">{entry.videoUrl}</p>
        ))}
    </>
  )
}

function StoredMedia({
  mediaKey,
  kind,
  name,
}: {
  mediaKey: string
  kind: 'image' | 'video'
  name: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    getMedia(mediaKey)
      .then((blob) => {
        if (cancelled) return
        if (!blob) {
          setMissing(true)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaKey])

  if (missing) {
    return <p className="muted">{name} is not on this device.</p>
  }
  if (!url) return <p className="muted">Loading {name}…</p>
  if (kind === 'video') {
    return <video className="coach-media" src={url} controls preload="metadata" />
  }
  return <img className="coach-media" src={url} alt={name} />
}
