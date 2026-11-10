import { useEffect, useState, type FormEvent } from 'react'
import {
  JUNIOR_GROUPS,
  blankGroupNotes,
  compactGroupNotes,
  formatEntryDate,
  notesForPractice,
  practiceOn,
  practiceSnippet,
  practicesForGroup,
  practicesNewest,
  todayISO,
  type CoachLogData,
  type JuniorGroupId,
  type JuniorPractice,
} from '../lib/coachStore'

type GroupFilter = 'all' | JuniorGroupId

export function PracticeBoard({
  data,
  onCommit,
  onStatus,
  onError,
}: {
  data: CoachLogData
  onCommit: (next: CoachLogData) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}) {
  const [date, setDate] = useState(todayISO)
  const [draft, setDraft] = useState(() => notesForPractice(practiceOn(data.practices, todayISO())))
  const [filter, setFilter] = useState<GroupFilter>('all')

  useEffect(() => {
    setDraft(notesForPractice(practiceOn(data.practices, date)))
  }, [data.practices, date])

  const existing = practiceOn(data.practices, date)
  const visible = (
    filter === 'all' ? practicesNewest(data.practices) : practicesForGroup(data.practices, filter)
  )

  function save(event: FormEvent) {
    event.preventDefault()
    const groups = compactGroupNotes(draft)
    if (!JUNIOR_GROUPS.some((group) => groups[group.id])) {
      onError('Write what at least one group did.')
      onStatus('')
      return
    }
    const nextPractice: JuniorPractice = {
      id: existing?.id ?? crypto.randomUUID(),
      date: date || todayISO(),
      groups,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    const practices = existing
      ? data.practices.map((practice) => (practice.id === existing.id ? nextPractice : practice))
      : [...data.practices, nextPractice]
    onCommit({ ...data, practices })
    onError('')
    onStatus(existing ? 'Practice updated.' : 'Practice saved.')
  }

  function removePractice() {
    if (!existing) return
    const ok = window.confirm(`Delete the practice log from ${formatEntryDate(existing.date)}?`)
    if (!ok) return
    onCommit({
      ...data,
      practices: data.practices.filter((practice) => practice.id !== existing.id),
    })
    setDraft(blankGroupNotes())
    onError('')
    onStatus('Practice deleted.')
  }

  return (
    <section className="practice-board">
      <div className="practice-groups" role="group" aria-label="Groups">
        {JUNIOR_GROUPS.map((group) => {
          const logged = practicesForGroup(data.practices, group.id)
          const latest = logged[0]
          const text = latest?.groups[group.id]?.trim() ?? ''
          const selected = filter === group.id
          return (
            <button
              key={group.id}
              type="button"
              className={selected ? 'practice-group is-active' : 'practice-group'}
              aria-pressed={selected}
              onClick={() => setFilter((current) => (current === group.id ? 'all' : group.id))}
            >
              <span className="practice-group__name">{group.name}</span>
              <span className="practice-group__when">
                {latest
                  ? `${formatEntryDate(latest.date)} · ${logged.length} logged`
                  : 'No practices yet'}
              </span>
              <span className="practice-group__did">
                {text ? practiceSnippet(text) : 'Log what this group did.'}
              </span>
            </button>
          )
        })}
      </div>

      <form className="coach-form practice-form" onSubmit={save}>
        <h3>{existing ? 'Update this practice' : 'Log this practice'}</h3>
        <p className="practice-form__lead">
          Fill in each group that practiced. One date keeps K-2, 3-8, and Advanced together.
        </p>
        <label className="practice-form__date">
          <span>Date</span>
          <input
            type="date"
            value={date}
            required
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <div className="practice-form__groups">
          {JUNIOR_GROUPS.map((group) => (
            <label key={group.id}>
              <span>{group.name}</span>
              <textarea
                rows={5}
                value={draft[group.id]}
                placeholder={group.placeholder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [group.id]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <div className="coach-form__actions">
          <button type="submit" className="ghost ghost--emphasis">
            {existing ? 'Update practice' : 'Save practice'}
          </button>
          {existing && (
            <button type="button" className="ghost" onClick={removePractice}>
              Delete this day
            </button>
          )}
        </div>
      </form>

      <section className="coach-log" aria-label="Practice history">
        <div className="coach-log__head">
          <h3>What each group has done</h3>
          <div className="coach-log__filters" role="group" aria-label="Filter by group">
            {(
              [
                { id: 'all' as const, label: 'All' },
                ...JUNIOR_GROUPS.map((group) => ({ id: group.id, label: group.name })),
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'is-active' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="muted">No practices in this view yet.</p>
        ) : (
          <ol className="coach-entries">
            {visible.map((practice) => {
              const groups =
                filter === 'all'
                  ? JUNIOR_GROUPS.filter((group) => practice.groups[group.id]?.trim())
                  : JUNIOR_GROUPS.filter((group) => group.id === filter)
              return (
                <li key={practice.id} className="coach-entry">
                  <header>
                    <div>
                      <strong>{formatEntryDate(practice.date)}</strong>
                      <span>{groups.map((group) => group.name).join(' · ')}</span>
                    </div>
                    <button type="button" className="ghost" onClick={() => setDate(practice.date)}>
                      Open
                    </button>
                  </header>
                  {groups.map((group) => (
                    <p key={group.id}>
                      <span>{group.name}</span>
                      {practice.groups[group.id]}
                    </p>
                  ))}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </section>
  )
}
