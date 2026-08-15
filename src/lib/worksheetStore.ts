import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  STORAGE_KEY,
  normalizeWorksheet,
  type WorksheetResponse,
} from './worksheet'
import { countFilledMoves } from './worksheetToGraph'

export type SyncStatus =
  | 'local_only'
  | 'need_name'
  | 'saving'
  | 'synced'
  | 'restored'
  | 'error'
  | 'offline'

export function normalizeIdentity(name: string, email: string) {
  return {
    athleteName: name.trim(),
    athleteEmail: email.trim().toLowerCase(),
  }
}

export function loadLocalWorksheet(): WorksheetResponse {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY)
    if (v2) return normalizeWorksheet(JSON.parse(v2))
    const v1 = localStorage.getItem('bjj-automata-worksheet-v1')
    if (v1) return normalizeWorksheet(JSON.parse(v1))
  } catch {
    /* ignore */
  }
  return normalizeWorksheet(null)
}

export function saveLocalWorksheet(form: WorksheetResponse) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
}

export async function fetchCloudWorksheet(
  athleteName: string,
  athleteEmail: string,
): Promise<{ form: WorksheetResponse; updatedAt: string } | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { athleteName: name, athleteEmail: email } = normalizeIdentity(
    athleteName,
    athleteEmail,
  )
  if (!name) return null

  const { data, error } = await sb
    .from('worksheets')
    .select('payload, updated_at, filled_moves')
    .eq('athlete_name', name)
    .eq('athlete_email', email)
    .maybeSingle()

  if (error) throw error
  if (!data?.payload) return null
  return {
    form: normalizeWorksheet(data.payload),
    updatedAt: data.updated_at as string,
  }
}

export async function upsertCloudWorksheet(
  form: WorksheetResponse,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { athleteName, athleteEmail } = normalizeIdentity(
    form.athleteName,
    form.athleteEmail ?? '',
  )
  if (!athleteName) return

  const payload = {
    ...form,
    athleteName,
    athleteEmail,
  }

  const { error } = await sb.from('worksheets').upsert(
    {
      athlete_name: athleteName,
      athlete_email: athleteEmail,
      payload,
      filled_moves: countFilledMoves(payload),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_name,athlete_email' },
  )

  if (error) throw error
}

/** Prefer cloud when it has more filled moves, or equal moves but newer timestamp. */
export function shouldPreferCloud(
  local: WorksheetResponse,
  cloud: WorksheetResponse,
  cloudUpdatedAt: string,
  localSavedAtMs: number | null,
): boolean {
  const localFilled = countFilledMoves(local)
  const cloudFilled = countFilledMoves(cloud)
  if (cloudFilled > localFilled) return true
  if (cloudFilled < localFilled) return false
  if (!localSavedAtMs) return cloudFilled > 0
  return Date.parse(cloudUpdatedAt) > localSavedAtMs
}

export function cloudAvailable(): boolean {
  return isSupabaseConfigured()
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'local_only':
      return 'Saved in this browser (cloud not configured)'
    case 'need_name':
      return 'Enter your name to sync to the cloud'
    case 'saving':
      return 'Saving to cloud…'
    case 'synced':
      return 'Synced to cloud'
    case 'restored':
      return 'Restored from cloud'
    case 'error':
      return 'Cloud sync failed — still saved in this browser'
    case 'offline':
      return 'Offline — saved in this browser'
    default:
      return 'Saved in this browser'
  }
}
