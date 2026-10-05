import {
  loadCoachLog,
  saveCoachLog,
  type CoachEntry,
  type CoachLogData,
  type SquadId,
} from './coachStore'

export const DEFAULT_BJJ_TEAMS = 'Navy Jiu Jitsu, Naval Academy, USNA'

export type ImportedAthlete = {
  name: string
  club: string
  level: string
  weight: string
  result: string
}

export type ParsedSmoothcomp = {
  eventId: string
  name: string
  date: string
  url: string
  athletes: ImportedAthlete[]
}

type Placement = {
  placement?: number
  club?: { name?: string } | null
  affiliation?: { name?: string } | string | null
  target?: { fullname?: string; firstname?: string; lastname?: string }
}

type Bracket = {
  group?: { name?: string }
  top3?: Placement[]
  after3?: Placement[]
}

export function resultSummary(result: string): string {
  const places = [...result.matchAll(/\d+(?:st|nd|rd|th)/gi)].map((match) =>
    match[0].toLowerCase(),
  )
  if (places.length) return [...new Set(places)].join(', ')
  return result.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}

export function teamKeywords(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

export function matchesTeam(club: string, keywords: string[]): boolean {
  const hay = club.toLowerCase()
  return keywords.some((keyword) => hay.includes(keyword))
}

/** Wins-losses such as 2-0. Other text is kept as typed. */
export function normalizeRecord(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
  if (!match) return trimmed
  return `${match[1]}-${match[2]}`
}

export function resultLine(result: string, record?: string): string {
  const place = result.trim() ? resultSummary(result) : ''
  const score = record ? normalizeRecord(record) : ''
  return [place, score].filter(Boolean).join(' · ')
}

function rosterFingerprint(log: CoachLogData): string {
  const athletes = log.athletes
    .map((athlete) =>
      [athlete.squadId, athlete.name, athlete.club ?? '', athlete.level, athlete.weight].join('|'),
    )
    .sort()
  const entries = log.entries
    .map((entry) =>
      [
        entry.athleteId,
        entry.sourceId ?? '',
        entry.date,
        entry.eventName,
        entry.result,
        entry.record ?? '',
        entry.focus,
        entry.maintain,
      ].join('|'),
    )
    .sort()
  return JSON.stringify({ athletes, entries })
}

export function importSmoothcompPayload(raw: unknown): {
  ok: boolean
  changed: boolean
  message: string
} {
  const record = asRecord(raw)
  const keywords =
    record && typeof record.keywords === 'string' ? record.keywords : DEFAULT_BJJ_TEAMS
  const parsed = parseSmoothcompPayload(raw)
  if (!parsed) return { ok: false, changed: false, message: 'Those results could not be read.' }
  const keys = teamKeywords(keywords)
  if (!keys.length) {
    return { ok: false, changed: false, message: 'Add at least one team name.' }
  }
  const matched = parsed.athletes.filter((athlete) => matchesTeam(athlete.club, keys))
  if (!matched.length) {
    return { ok: false, changed: false, message: 'No Navy or Naval Academy athletes were in those results.' }
  }
  const log = loadCoachLog()
  const notes = notesForEvent(log, 'navy-bjj', parsed)
  const seededRecords = seededRecordMap(record?.records)
  const rows = matched.map((athlete) => {
    const note = notes[athleteKey(athlete.name)] ?? { focus: '', maintain: '', record: '' }
    const seeded = seededRecords[athleteKey(athlete.name)] ?? ''
    return { ...athlete, ...note, record: note.record || seeded }
  })
  const applied = applyEventImport(log, 'navy-bjj', parsed, rows)
  if (rosterFingerprint(applied.log) === rosterFingerprint(log)) {
    return { ok: true, changed: false, message: '' }
  }
  saveCoachLog(applied.log)
  const withRecords = rows.filter((row) => row.record).length
  const message = withRecords
    ? `Loaded ${matched.length} athletes from ${parsed.name}, with records for ${withRecords}.`
    : `Loaded ${matched.length} athletes from ${parsed.name}.`
  return { ok: true, changed: true, message }
}

function seededRecordMap(raw: unknown): Record<string, string> {
  const record = asRecord(raw)
  if (!record) return {}
  const map: Record<string, string> = {}
  for (const [name, value] of Object.entries(record)) {
    if (typeof value !== 'string') continue
    const normalized = normalizeRecord(value)
    if (normalized) map[athleteKey(name)] = normalized
  }
  return map
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function personName(target: Placement['target']): string {
  if (!target) return ''
  const full = target.fullname?.trim()
  if (full) return full
  return [target.firstname, target.lastname].filter(Boolean).join(' ').trim()
}

function teamOf(placement: Placement): string {
  const club = placement.club?.name?.trim() || ''
  const affiliation =
    typeof placement.affiliation === 'string'
      ? placement.affiliation.trim()
      : placement.affiliation?.name?.trim() || ''
  if (club && affiliation && club.toLowerCase() !== affiliation.toLowerCase()) {
    return `${club} / ${affiliation}`
  }
  return club || affiliation
}

function ordinal(place: number): string {
  const mod100 = place % 100
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`
  switch (place % 10) {
    case 1:
      return `${place}st`
    case 2:
      return `${place}nd`
    case 3:
      return `${place}rd`
    default:
      return `${place}th`
  }
}

function beltFromDivision(division: string): string {
  const match = division.match(/\(([^)]+)\)/)
  if (!match) return ''
  const text = match[1]
  if (/white/i.test(text)) return 'White'
  if (/\bblue\b/i.test(text)) return 'Blue'
  if (/purple/i.test(text) && /brown|black/i.test(text)) return 'Advanced'
  if (/purple/i.test(text)) return 'Purple'
  if (/brown/i.test(text)) return 'Brown'
  if (/black/i.test(text)) return 'Black'
  return ''
}

function weightFromDivision(division: string): string {
  if (/open weight/i.test(division)) return ''
  const pounds = division.match(/\d+(?:\.\d+)?\+?\s*lbs/i)
  if (pounds) return pounds[0].replace(/\s+/g, ' ')
  const kilos = division.match(/\d+(?:\.\d+)?\+?\s*kg/i)
  return kilos ? kilos[0].replace(/\s+/g, ' ') : ''
}

function eventDate(startDate: string): string | null {
  const match = startDate.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function parseSmoothcompPayload(raw: unknown): ParsedSmoothcomp | null {
  const record = asRecord(raw)
  if (!record || record.source !== 'smoothcomp') return null
  if (typeof record.eventId !== 'string' || !record.eventId.trim()) return null
  if (!Array.isArray(record.eventResults)) return null
  const date = eventDate(typeof record.startDate === 'string' ? record.startDate : '')
  if (!date) return null
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!name) return null

  const grouped = new Map<
    string,
    {
      name: string
      club: string
      level: string
      absoluteLevel: string
      absoluteConflict: boolean
      weight: string
      lines: Array<{ place: number; division: string }>
    }
  >()

  for (const item of record.eventResults) {
    const bracket = item as Bracket
    const division = bracket.group?.name?.trim() || 'Division'
    const placements = [...(bracket.top3 ?? []), ...(bracket.after3 ?? [])]
    const weighed = !/absolute|open weight/i.test(division)
    for (const placement of placements) {
      const athleteName = personName(placement.target)
      const place = placement.placement
      if (!athleteName || typeof place !== 'number') continue
      const key = normalizeName(athleteName)
      const club = teamOf(placement)
      const current = grouped.get(key) ?? {
        name: athleteName,
        club,
        level: '',
        absoluteLevel: '',
        absoluteConflict: false,
        weight: '',
        lines: [],
      }
      if (!current.club && club) current.club = club
      const level = beltFromDivision(division)
      const weight = weightFromDivision(division)
      if (weighed) {
        if (level) current.level = level
        if (weight) current.weight = weight
      } else if (level && !current.absoluteConflict) {
        if (!current.absoluteLevel || current.absoluteLevel === level) {
          current.absoluteLevel = level
        } else {
          current.absoluteLevel = ''
          current.absoluteConflict = true
        }
      }
      current.lines.push({ place, division })
      grouped.set(key, current)
    }
  }

  const athletes = [...grouped.values()]
    .map((athlete) => ({
      name: athlete.name,
      club: athlete.club,
      level: athlete.level || athlete.absoluteLevel,
      weight: athlete.weight,
      result: athlete.lines
        .sort((a, b) => a.place - b.place || a.division.localeCompare(b.division))
        .map((line) => `${ordinal(line.place)} · ${line.division}`)
        .join('\n'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    eventId: record.eventId.trim(),
    name,
    date,
    url: typeof record.url === 'string' ? record.url.trim() : '',
    athletes,
  }
}

export function sourceIdFor(eventId: string): string {
  return `smoothcomp:${eventId}`
}

export function applyEventImport(
  log: CoachLogData,
  squadId: SquadId,
  event: ParsedSmoothcomp,
  rows: Array<ImportedAthlete & { focus: string; maintain: string; record: string }>,
): { log: CoachLogData; firstAthleteId: string | null; added: number; updated: number } {
  const athletes = [...log.athletes]
  const entries = [...log.entries]
  const sourceId = sourceIdFor(event.eventId)
  let firstAthleteId: string | null = null
  let added = 0
  let updated = 0

  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    const key = normalizeName(name)
    let athlete = athletes.find(
      (item) => item.squadId === squadId && normalizeName(item.name) === key,
    )
    if (!athlete) {
      athlete = {
        id: crypto.randomUUID(),
        squadId,
        name,
        level: row.level,
        weight: row.weight,
        ...(row.club ? { club: row.club } : {}),
      }
      athletes.push(athlete)
    } else {
      const index = athletes.indexOf(athlete)
      athletes[index] = {
        ...athlete,
        level: athlete.level || row.level,
        weight: athlete.weight || row.weight,
        ...(row.club ? { club: row.club } : {}),
      }
      athlete = athletes[index]
    }
    if (!firstAthleteId) firstAthleteId = athlete.id

    const existing = entries.find(
      (entry) => entry.athleteId === athlete!.id && entry.sourceId === sourceId,
    )
    if (existing) {
      const index = entries.indexOf(existing)
      const record = normalizeRecord(row.record)
      const next = {
        ...existing,
        date: event.date,
        eventName: event.name,
        result: row.result,
        focus: row.focus.trim(),
        maintain: row.maintain.trim(),
        sourceUrl: event.url || existing.sourceUrl,
      }
      if (record) next.record = record
      else delete next.record
      entries[index] = next
      updated += 1
      continue
    }
    added += 1

    const created: CoachEntry = {
      id: crypto.randomUUID(),
      athleteId: athlete.id,
      date: event.date,
      kind: 'competition',
      eventName: event.name,
      result: row.result,
      focus: row.focus.trim(),
      maintain: row.maintain.trim(),
      ...(normalizeRecord(row.record) ? { record: normalizeRecord(row.record) } : {}),
      videoUrl: '',
      hasVideoFile: false,
      videoFileName: '',
      hasNoteImage: false,
      noteImageName: '',
      createdAt: new Date().toISOString(),
      sourceId,
      ...(event.url ? { sourceUrl: event.url } : {}),
    }
    entries.push(created)
  }

  return { log: { athletes, entries }, firstAthleteId, added, updated }
}

export function notesForEvent(
  log: CoachLogData,
  squadId: SquadId,
  event: ParsedSmoothcomp,
): Record<string, { focus: string; maintain: string; record: string }> {
  const sourceId = sourceIdFor(event.eventId)
  const notes: Record<string, { focus: string; maintain: string; record: string }> = {}
  for (const athlete of event.athletes) {
    const key = normalizeName(athlete.name)
    const saved = log.athletes.find(
      (item) => item.squadId === squadId && normalizeName(item.name) === key,
    )
    const entry = saved
      ? log.entries.find((item) => item.athleteId === saved.id && item.sourceId === sourceId)
      : undefined
    notes[key] = {
      focus: entry?.focus ?? '',
      maintain: entry?.maintain ?? '',
      record: entry?.record ?? '',
    }
  }
  return notes
}

export function athleteKey(name: string): string {
  return normalizeName(name)
}
