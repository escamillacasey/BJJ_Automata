import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  STORAGE_KEY,
  normalizeWorksheet,
  type WorksheetResponse,
} from './worksheet'
import { countFilledMoves } from './worksheetToGraph'

export type SyncStatus =
  | 'local_only'
  | 'need_credentials'
  | 'need_pin'
  | 'saving'
  | 'synced'
  | 'loaded'
  | 'not_found'
  | 'error'
  | 'offline'

/** App-side salt — PIN is hashed before it leaves the browser. */
const PIN_SALT = 'bjj-automata-pin-v1'

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${PIN_SALT}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function normalizeIdentity(name: string, email: string) {
  return {
    athleteName: name.trim(),
    athleteEmail: email.trim().toLowerCase(),
  }
}

/** Payload stored in DB — never includes the PIN. */
export function cloudPayload(form: WorksheetResponse): WorksheetResponse {
  const { pin: _pin, ...rest } = form
  return {
    ...rest,
    athleteName: form.athleteName.trim(),
    athleteEmail: (form.athleteEmail ?? '').trim().toLowerCase(),
    pin: '',
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
  pin: string,
): Promise<{ form: WorksheetResponse; updatedAt: string } | null> {
  const sb = getSupabase()
  if (!sb) return null
  if (!isValidPin(pin)) throw new Error('invalid_pin')

  const { athleteName: name, athleteEmail: email } = normalizeIdentity(
    athleteName,
    athleteEmail,
  )
  if (!name) return null

  const pinHash = await hashPin(pin)
  const { data, error } = await sb
    .from('worksheets')
    .select('payload, updated_at, filled_moves')
    .eq('athlete_name', name)
    .eq('athlete_email', email)
    .eq('pin_hash', pinHash)
    .maybeSingle()

  if (error) throw error
  if (!data?.payload) return null

  const form = normalizeWorksheet(data.payload)
  // Restore the PIN into local form so autosave keeps working after Load
  form.pin = pin
  form.athleteName = name
  form.athleteEmail = email
  return { form, updatedAt: data.updated_at as string }
}

export async function upsertCloudWorksheet(
  form: WorksheetResponse,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  const pin = form.pin ?? ''
  if (!isValidPin(pin)) throw new Error('invalid_pin')

  const { athleteName, athleteEmail } = normalizeIdentity(
    form.athleteName,
    form.athleteEmail ?? '',
  )
  if (!athleteName) return

  const pinHash = await hashPin(pin)
  const payload = cloudPayload({ ...form, athleteName, athleteEmail })

  const { error } = await sb.from('worksheets').upsert(
    {
      athlete_name: athleteName,
      athlete_email: athleteEmail,
      pin_hash: pinHash,
      payload,
      filled_moves: countFilledMoves(payload),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_name,athlete_email,pin_hash' },
  )

  if (error) throw error
}

export function cloudAvailable(): boolean {
  return isSupabaseConfigured()
}

export function canAutosave(form: WorksheetResponse): boolean {
  return Boolean(form.athleteName.trim()) && isValidPin(form.pin ?? '')
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'local_only':
      return 'Saved in this browser (cloud not configured)'
    case 'need_credentials':
      return 'Enter name + PIN to autosave'
    case 'need_pin':
      return 'PIN must be 4–6 digits'
    case 'saving':
      return 'Autosaving…'
    case 'synced':
      return 'Autosaved to cloud'
    case 'loaded':
      return 'Loaded from cloud'
    case 'not_found':
      return 'No sheet for that name + PIN'
    case 'error':
      return 'Cloud sync failed — still saved in this browser'
    case 'offline':
      return 'Offline — saved in this browser'
    default:
      return 'Saved in this browser'
  }
}
