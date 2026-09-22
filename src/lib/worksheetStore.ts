import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  STORAGE_KEY,
  normalizeWorksheet,
  type WorksheetResponse,
} from './worksheet'
import { countFilledMoves } from './worksheetToGraph'

export type SyncStatus =
  | 'local_only'
  | 'unbound'
  | 'need_credentials'
  | 'need_pin'
  | 'saving'
  | 'synced'
  | 'created'
  | 'loaded'
  | 'exists'
  | 'not_found'
  | 'identity_changed'
  | 'error'
  | 'offline'

export type CloudBind = {
  athleteName: string
  athleteEmail: string
  pin: string
}

const BIND_KEY = 'bjj-automata-cloud-bind-v1'
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

export function identityKey(form: Pick<WorksheetResponse, 'athleteName' | 'athleteEmail' | 'pin'>) {
  const { athleteName, athleteEmail } = normalizeIdentity(
    form.athleteName,
    form.athleteEmail ?? '',
  )
  return `${athleteName}|${athleteEmail}|${form.pin ?? ''}`
}

export function sameBind(a: CloudBind, form: WorksheetResponse): boolean {
  return identityKey(a) === identityKey(form)
}

export function loadCloudBind(): CloudBind | null {
  try {
    const raw = localStorage.getItem(BIND_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<CloudBind>
    if (
      typeof data.athleteName === 'string' &&
      typeof data.athleteEmail === 'string' &&
      typeof data.pin === 'string' &&
      data.athleteName.trim() &&
      isValidPin(data.pin)
    ) {
      return {
        athleteName: data.athleteName.trim(),
        athleteEmail: data.athleteEmail.trim().toLowerCase(),
        pin: data.pin,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveCloudBind(bind: CloudBind) {
  localStorage.setItem(BIND_KEY, JSON.stringify(bind))
}

export function clearCloudBind() {
  localStorage.removeItem(BIND_KEY)
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
): Promise<{ form: WorksheetResponse; updatedAt: string; filledMoves: number } | null> {
  const sb = getSupabase()
  if (!sb) return null
  if (!isValidPin(pin)) throw new Error('invalid_pin')

  const { athleteName: name, athleteEmail: email } = normalizeIdentity(
    athleteName,
    athleteEmail,
  )
  if (!name) return null

  const pinHash = await hashPin(pin)

  // Prefer the densest matching row. Try hashed PIN first, then legacy plaintext pin_hash.
  const pickBest = async (pinValue: string) => {
    const { data, error } = await sb
      .from('worksheets')
      .select('payload, updated_at, filled_moves')
      .eq('athlete_name', name)
      .eq('athlete_email', email)
      .eq('pin_hash', pinValue)
      .order('filled_moves', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  }

  let data = await pickBest(pinHash)
  if (!data?.payload) {
    data = await pickBest(pin) // legacy rows that stored the PIN itself
  }
  // Legacy blank-pin rows (pre-PIN) — only if email+name match and pin was never set
  if (!data?.payload && pin) {
    const { data: blank, error } = await sb
      .from('worksheets')
      .select('payload, updated_at, filled_moves')
      .eq('athlete_name', name)
      .eq('athlete_email', email)
      .or('pin_hash.is.null,pin_hash.eq.')
      .order('filled_moves', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    data = blank
  }

  if (!data?.payload) return null

  const form = normalizeWorksheet(data.payload)
  form.pin = pin
  form.athleteName = name
  form.athleteEmail = email
  return {
    form,
    updatedAt: data.updated_at as string,
    filledMoves: Number(data.filled_moves) || countFilledMoves(form),
  }
}

/** Create a brand-new cloud row. Fails if that identity already exists. */
export async function createCloudWorksheet(
  form: WorksheetResponse,
): Promise<'created' | 'exists'> {
  const sb = getSupabase()
  if (!sb) throw new Error('no_cloud')

  const pin = form.pin ?? ''
  if (!isValidPin(pin)) throw new Error('invalid_pin')

  const { athleteName, athleteEmail } = normalizeIdentity(
    form.athleteName,
    form.athleteEmail ?? '',
  )
  if (!athleteName) throw new Error('need_name')

  const existing = await fetchCloudWorksheet(athleteName, athleteEmail, pin)
  if (existing) return 'exists'


  const pinHash = await hashPin(pin)
  const payload = cloudPayload({ ...form, athleteName, athleteEmail })

  const { error } = await sb.from('worksheets').insert({
    athlete_name: athleteName,
    athlete_email: athleteEmail,
    pin_hash: pinHash,
    payload,
    filled_moves: countFilledMoves(payload),
    updated_at: new Date().toISOString(),
  })

  if (error) {
    // Unique race → treat as exists
    if (error.code === '23505') return 'exists'
    throw error
  }
  return 'created'
}

/** Update the already-bound cloud row only (upsert on that identity). */
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

export function credentialsReady(form: WorksheetResponse): boolean {
  return Boolean(form.athleteName.trim()) && isValidPin(form.pin ?? '')
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'local_only':
      return 'Saved in this browser (cloud not configured)'
    case 'unbound':
      return 'Browser only — Create or Load to use the cloud'
    case 'need_credentials':
      return 'Enter name + PIN, then Create or Load'
    case 'need_pin':
      return 'PIN must be 4–6 digits'
    case 'saving':
      return 'Autosaving…'
    case 'synced':
      return 'Autosaved to cloud'
    case 'created':
      return 'Cloud sheet created — autosave on'
    case 'loaded':
      return 'Loaded — autosave on'
    case 'exists':
      return 'That name + PIN already has a sheet — use Load'
    case 'not_found':
      return 'No sheet for that name + PIN — use Create'
    case 'identity_changed':
      return 'Name/PIN changed — Create or Load again to cloud-save'
    case 'error':
      return 'Cloud sync failed — still saved in this browser'
    case 'offline':
      return 'Offline — saved in this browser'
    default:
      return 'Saved in this browser'
  }
}
