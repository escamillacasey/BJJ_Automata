import {
  formatEntryDate,
  squadById,
  type Athlete,
  type CoachEntry,
  type CoachLogData,
  type SquadId,
} from './coachStore'
import { resultLine, resultSummary } from './eventResults'

export type SummaryAthlete = {
  name: string
  meta: string
  line: string
  result: string
  focus: string
  maintain: string
  videoUrl: string
}

export type CompetitionSummary = {
  key: string
  eventName: string
  date: string
  squadId: SquadId
  squadName: string
  sourceUrl: string
  athletes: SummaryAthlete[]
}

function eventKey(entry: CoachEntry, squadId: SquadId): string {
  if (entry.sourceId) return `${squadId}|${entry.sourceId}`
  return `${squadId}|${entry.date}|${entry.eventName.trim().toLowerCase()}`
}

function placeRank(result: string): number {
  const match = resultSummary(result).match(/^(\d+)/)
  return match ? Number(match[1]) : 1000
}

function athleteMeta(athlete: Athlete): string {
  return [athlete.club, athlete.level, athlete.weight].filter(Boolean).join(' · ')
}

export function competitionSummaries(log: CoachLogData): CompetitionSummary[] {
  const athletes = new Map(log.athletes.map((athlete) => [athlete.id, athlete]))
  const groups = new Map<string, { entry: CoachEntry; athlete: Athlete }[]>()

  for (const entry of log.entries) {
    if (entry.kind !== 'competition') continue
    const athlete = athletes.get(entry.athleteId)
    if (!athlete) continue
    const key = eventKey(entry, athlete.squadId)
    const rows = groups.get(key) ?? []
    rows.push({ entry, athlete })
    groups.set(key, rows)
  }

  const summaries: CompetitionSummary[] = []
  for (const [key, rows] of groups) {
    const first = rows[0]
    const squad = squadById(first.athlete.squadId)
    const sorted = rows.slice().sort((a, b) => {
      const place = placeRank(a.entry.result) - placeRank(b.entry.result)
      if (place !== 0) return place
      return a.athlete.name.localeCompare(b.athlete.name)
    })
    summaries.push({
      key,
      eventName: first.entry.eventName.trim() || 'Competition',
      date: first.entry.date,
      squadId: first.athlete.squadId,
      squadName: squad.name,
      sourceUrl: rows.find((row) => row.entry.sourceUrl)?.entry.sourceUrl ?? '',
      athletes: sorted.map(({ entry, athlete }) => ({
        name: athlete.name,
        meta: athleteMeta(athlete),
        line: resultLine(entry.result, entry.record),
        result: entry.result.trim(),
        focus: entry.focus.trim(),
        maintain: entry.maintain.trim(),
        videoUrl: entry.videoUrl.trim(),
      })),
    })
  }

  return summaries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.eventName.localeCompare(b.eventName)
  })
}

export function summaryText(summary: CompetitionSummary): string {
  const lines = [
    summary.eventName,
    `${formatEntryDate(summary.date)} · ${summary.squadName}`,
  ]
  if (summary.sourceUrl) lines.push(summary.sourceUrl)
  lines.push('')

  for (const athlete of summary.athletes) {
    lines.push(athlete.name)
    if (athlete.meta) lines.push(athlete.meta)
    if (athlete.line) lines.push(athlete.line)
    if (athlete.result && athlete.result !== athlete.line) lines.push(athlete.result)
    if (athlete.maintain) {
      lines.push('')
      lines.push('Maintain')
      lines.push(athlete.maintain)
    }
    if (athlete.focus) {
      lines.push('')
      lines.push('Focus on')
      lines.push(athlete.focus)
    }
    if (athlete.videoUrl) lines.push(athlete.videoUrl)
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

export function summaryFileName(summary: CompetitionSummary): string {
  const slug =
    summary.eventName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'competition'
  return `${slug}-${summary.date}.txt`
}
