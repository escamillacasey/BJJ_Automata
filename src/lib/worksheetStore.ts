import type { User } from '@supabase/supabase-js'
import { displayNameFromUser, emailFromUser } from './auth'
import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  STORAGE_KEY,
  normalizeWorksheet,
  type WorksheetResponse,
} from './worksheet'
import { countFilledMoves } from './worksheetToGraph'

export type SyncStatus =
  | 'local_only'
  | 'signed_out'
  | 'saving'
  | 'synced'
  | 'loaded'
  | 'created'
  | 'error'
  | 'offline'

/** Sentinel pin_hash for Google-linked rows (satisfies NOT NULL + unique with email). */
export const GOOGLE_PIN_SENTINEL = 'google-oauth'

export function cloudAvailable(): boolean {
  return isSupabaseConfigured()
}

/** Payload stored in DB — never includes a local PIN. */
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

export async function fetchSheetByUserId(
  userId: string,
): Promise<{ form: WorksheetResponse; updatedAt: string; filledMoves: number } | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data, error } = await sb
    .from('worksheets')
    .select('payload, updated_at, filled_moves, athlete_name, athlete_email')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.payload) return null

  const form = normalizeWorksheet(data.payload)
  form.athleteName =
    (data.athlete_name as string) || form.athleteName
  form.athleteEmail =
    (data.athlete_email as string) || form.athleteEmail
  form.pin = ''
  return {
    form,
    updatedAt: data.updated_at as string,
    filledMoves: Number(data.filled_moves) || countFilledMoves(form),
  }
}

/**
 * Load the signed-in user's sheet, or create one linked to their Google account.
 * On first login, claims the fullest existing cloud row with the same email (PIN-era sheets).
 */
export async function loadOrCreateUserSheet(
  user: User,
  localDraft: WorksheetResponse,
): Promise<{ form: WorksheetResponse; status: 'loaded' | 'created' }> {
  const existing = await fetchSheetByUserId(user.id)
  if (existing) {
    return { form: existing.form, status: 'loaded' }
  }

  const claimed = await claimSheetByEmail(user)
  if (claimed) {
    return { form: claimed, status: 'loaded' }
  }

  const name = displayNameFromUser(user)
  const email = emailFromUser(user)
  const seed: WorksheetResponse = {
    ...localDraft,
    athleteName: localDraft.athleteName.trim() || name,
    athleteEmail: email,
    pin: '',
  }

  await insertUserSheet(user, seed)
  return { form: seed, status: 'created' }
}

/** Link the best unmatched cloud row for this Gmail to the auth user. */
async function claimSheetByEmail(
  user: User,
): Promise<WorksheetResponse | null> {
  const sb = getSupabase()
  if (!sb) return null
  const email = emailFromUser(user)
  if (!email) return null

  const { data, error } = await sb
    .from('worksheets')
    .select('id, payload, athlete_name, athlete_email, filled_moves')
    .eq('athlete_email', email)
    .is('user_id', null)
    .order('filled_moves', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) return null

  const { error: updateError } = await sb
    .from('worksheets')
    .update({
      user_id: user.id,
      athlete_email: email,
      pin_hash: GOOGLE_PIN_SENTINEL,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .is('user_id', null)

  if (updateError) throw new Error(updateError.message)

  const form = normalizeWorksheet(row.payload)
  form.athleteName =
    (row.athlete_name as string) || form.athleteName || displayNameFromUser(user)
  form.athleteEmail = email
  form.pin = ''
  return form
}

async function insertUserSheet(
  user: User,
  form: WorksheetResponse,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('no_cloud')

  const email = emailFromUser(user)
  const athleteName = form.athleteName.trim() || displayNameFromUser(user)
  const payload = cloudPayload({
    ...form,
    athleteName,
    athleteEmail: email,
  })

  const { error } = await sb.from('worksheets').insert({
    user_id: user.id,
    athlete_name: athleteName,
    athlete_email: email,
    pin_hash: GOOGLE_PIN_SENTINEL,
    payload,
    filled_moves: countFilledMoves(payload),
    updated_at: new Date().toISOString(),
  })

  if (error) throw new Error(error.message)
}

export async function upsertUserSheet(
  user: User,
  form: WorksheetResponse,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  const email = emailFromUser(user)
  const athleteName = form.athleteName.trim() || displayNameFromUser(user)
  const payload = cloudPayload({
    ...form,
    athleteName,
    athleteEmail: email,
  })

  // Prefer update-by-user_id; insert if missing (race after first login)
  const existing = await fetchSheetByUserId(user.id)
  if (!existing) {
    await insertUserSheet(user, form)
    return
  }

  const { error } = await sb
    .from('worksheets')
    .update({
      athlete_name: athleteName,
      athlete_email: email,
      payload,
      filled_moves: countFilledMoves(payload),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'local_only':
      return 'Saved in this browser (cloud not configured)'
    case 'signed_out':
      return 'Sign in with Google to save to the cloud'
    case 'saving':
      return 'Autosaving…'
    case 'synced':
      return 'Autosaved to cloud'
    case 'loaded':
      return 'Loaded your cloud sheet'
    case 'created':
      return 'Cloud sheet created — autosave on'
    case 'error':
      return 'Cloud sync failed — still saved in this browser'
    case 'offline':
      return 'Offline — saved in this browser'
    default:
      return 'Saved in this browser'
  }
}
