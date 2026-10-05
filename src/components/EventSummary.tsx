import { useEffect, useMemo, useState } from 'react'
import { formatEntryDate } from '../lib/coachStore'
import type { CoachLogData } from '../lib/coachStore'
import {
  competitionSummaries,
  summaryFileName,
  summaryText,
  type CompetitionSummary,
} from '../lib/eventSummary'

type Props = {
  log: CoachLogData
  onStatus: (message: string) => void
}

export function EventSummary({ log, onStatus }: Props) {
  const events = useMemo(() => competitionSummaries(log), [log])
  const [key, setKey] = useState(events[0]?.key ?? '')

  useEffect(() => {
    if (!events.some((event) => event.key === key)) setKey(events[0]?.key ?? '')
  }, [events, key])

  const selected = events.find((event) => event.key === key) ?? null

  function download(summary: CompetitionSummary) {
    const blob = new Blob([summaryText(summary)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = summaryFileName(summary)
    link.click()
    URL.revokeObjectURL(url)
    onStatus(`Downloaded the ${summary.eventName} summary.`)
  }

  async function copy(summary: CompetitionSummary) {
    try {
      await navigator.clipboard.writeText(summaryText(summary))
      onStatus(`Copied the ${summary.eventName} summary.`)
    } catch {
      onStatus('Could not copy. Download the summary instead.')
    }
  }

  function printSummary() {
    document.body.classList.add('is-printing-summary')
    const done = () => {
      document.body.classList.remove('is-printing-summary')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }

  return (
    <section className="coach-summary">
      <div className="coach-summary__tools">
        <h3>Event summary</h3>
        <p>
          Other coaches who sign in with Google see this same log. Download or
          copy one competition when you want to send just the comments.
        </p>
        {events.length === 0 ? (
          <p>No competitions in this log yet.</p>
        ) : (
          <label>
            <span>Competition</span>
            <select value={key} onChange={(event) => setKey(event.target.value)}>
              {events.map((event) => (
                <option key={event.key} value={event.key}>
                  {event.eventName} · {event.squadName} · {formatEntryDate(event.date)}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && (
          <div className="coach-summary__actions">
            <button type="button" className="ghost ghost--emphasis" onClick={() => download(selected)}>
              Download summary
            </button>
            <button type="button" className="ghost" onClick={() => void copy(selected)}>
              Copy summary
            </button>
            <button type="button" className="ghost" onClick={printSummary}>
              Print
            </button>
          </div>
        )}
      </div>
      {selected && (
        <article className="coach-summary__sheet">
          <header>
            <h3>{selected.eventName}</h3>
            <p>
              {formatEntryDate(selected.date)} · {selected.squadName}
              {selected.athletes.length === 1
                ? ' · 1 athlete'
                : ` · ${selected.athletes.length} athletes`}
            </p>
            {selected.sourceUrl && (
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                Results
              </a>
            )}
          </header>
          <ul>
            {selected.athletes.map((athlete) => (
              <li key={athlete.name}>
                <strong>{athlete.name}</strong>
                {athlete.meta && <span>{athlete.meta}</span>}
                {athlete.line && <em>{athlete.line}</em>}
                {athlete.result && athlete.result !== athlete.line && (
                  <p className="coach-summary__result">{athlete.result}</p>
                )}
                {athlete.maintain && (
                  <p>
                    <span>Maintain</span>
                    {athlete.maintain}
                  </p>
                )}
                {athlete.focus && (
                  <p>
                    <span>Focus on</span>
                    {athlete.focus}
                  </p>
                )}
                {athlete.videoUrl && (
                  <a href={athlete.videoUrl} target="_blank" rel="noreferrer">
                    Video
                  </a>
                )}
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  )
}
