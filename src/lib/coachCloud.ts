import {
  parseCoachLog,
  saveCoachLog,
  type Athlete,
  type CoachEntry,
  type CoachLogData,
} from './coachStore'
import { getSupabase, isSupabaseConfigured } from './supabase'

const TEAM_ROW = 'team'

export function coachCloudAvailable(): boolean {
  return isSupabaseConfigured()
}

export function coachCloudErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Could not reach the coach log.'
  if (/coach_logs|schema cache|42P01|PGRST205/i.test(message)) {
    return 'The coach log table is not in Supabase yet. Run supabase/coach-log.sql in the SQL editor, then sign in again.'
  }
  return message
}

function nameKey(athlete: Athlete): string {
  return `${athlete.squadId}|${athlete.name.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

function noteScore(entry: CoachEntry): number {
  return (
    entry.maintain.trim().length +
    entry.focus.trim().length +
    (entry.videoUrl.trim() ? 20 : 0) +
    (entry.hasNoteImage ? 10 : 0) +
    (entry.hasVideoFile ? 10 : 0)
  )
}

function pickText(current: string, extra: string): string {
  if (!current.trim()) return extra
  if (!extra.trim()) return current
  return extra.trim().length > current.trim().length ? extra : current
}

function richer(kept: CoachEntry, extra: CoachEntry): CoachEntry {
  return {
    ...kept,
    result: pickText(kept.result, extra.result),
    ...(kept.record || extra.record ? { record: kept.record || extra.record } : {}),
    focus: pickText(kept.focus, extra.focus),
    maintain: pickText(kept.maintain, extra.maintain),
    eventName: kept.eventName.trim() || extra.eventName,
    videoUrl: kept.videoUrl.trim() || extra.videoUrl,
    hasVideoFile: kept.hasVideoFile || extra.hasVideoFile,
    videoFileName: kept.videoFileName || extra.videoFileName,
    hasNoteImage: kept.hasNoteImage || extra.hasNoteImage,
    noteImageName: kept.noteImageName || extra.noteImageName,
    ...(kept.sourceId || extra.sourceId
      ? { sourceId: kept.sourceId || extra.sourceId }
      : {}),
    ...(kept.sourceUrl || extra.sourceUrl
      ? { sourceUrl: kept.sourceUrl || extra.sourceUrl }
      : {}),
  }
}

/** Combine this browser and the team row. The team row keeps ids when both have the same athlete. */
export function mergeCoachLogs(local: CoachLogData, remote: CoachLogData): CoachLogData {
  const athletes: Athlete[] = []
  const byName = new Map<string, Athlete>()
  const localToCanonical = new Map<string, string>()

  for (const athlete of remote.athletes) {
    byName.set(nameKey(athlete), { ...athlete })
    athletes.push(byName.get(nameKey(athlete))!)
  }
  for (const athlete of local.athletes) {
    const key = nameKey(athlete)
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...athlete })
      athletes.push(byName.get(key)!)
      localToCanonical.set(athlete.id, athlete.id)
      continue
    }
    localToCanonical.set(athlete.id, existing.id)
    existing.level = existing.level || athlete.level
    existing.weight = existing.weight || athlete.weight
    if (!existing.club && athlete.club) existing.club = athlete.club
  }

  const entries = new Map<string, CoachEntry>()
  const take = (entry: CoachEntry, athleteId: string, preferExistingId: boolean) => {
    const key = entry.sourceId ? `${athleteId}|${entry.sourceId}` : entry.id
    const next = { ...entry, athleteId }
    const prev = entries.get(key)
    if (!prev) {
      entries.set(key, next)
      return
    }
    const kept = preferExistingId || noteScore(prev) >= noteScore(next) ? prev : next
    const extra = kept === prev ? next : prev
    const merged = richer(kept, extra)
    if (preferExistingId) merged.id = prev.id
    entries.set(key, merged)
  }

  for (const entry of remote.entries) take(entry, entry.athleteId, false)
  for (const entry of local.entries) {
    const athleteId = localToCanonical.get(entry.athleteId) ?? entry.athleteId
    take(entry, athleteId, true)
  }

  return { athletes, entries: [...entries.values()] }
}

function fingerprint(log: CoachLogData): string {
  const athletes = log.athletes
    .map((athlete) =>
      [athlete.id, athlete.squadId, athlete.name, athlete.club ?? '', athlete.level, athlete.weight].join('|'),
    )
    .sort()
  const entries = log.entries
    .map((entry) =>
      [
        entry.id,
        entry.athleteId,
        entry.sourceId ?? '',
        entry.date,
        entry.kind,
        entry.eventName,
        entry.result,
        entry.record ?? '',
        entry.focus,
        entry.maintain,
        entry.videoUrl,
      ].join('|'),
    )
    .sort()
  return JSON.stringify({ athletes, entries })
}

async function readTeamLog(): Promise<CoachLogData | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from('coach_logs')
    .select('payload')
    .eq('id', TEAM_ROW)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.payload) return null
  return parseCoachLog(data.payload)
}

export async function saveTeamLog(log: CoachLogData): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('coach_logs').upsert({
    id: TEAM_ROW,
    payload: { version: 1, ...log },
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function syncCoachLog(
  local: CoachLogData,
): Promise<{ log: CoachLogData; pushed: boolean; pulled: boolean }> {
  const remote = await readTeamLog()
  if (!remote) {
    await saveTeamLog(local)
    return { log: local, pushed: true, pulled: false }
  }
  const merged = mergeCoachLogs(local, remote)
  const changedRemote = fingerprint(merged) !== fingerprint(remote)
  const changedLocal = fingerprint(merged) !== fingerprint(local)
  if (changedRemote) await saveTeamLog(merged)
  if (changedLocal || changedRemote) saveCoachLog(merged)
  return { log: merged, pushed: changedRemote, pulled: changedLocal && !changedRemote }
}
