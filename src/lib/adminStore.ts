import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  WORKSHEET_SEATS,
  normalizeWorksheet,
  type WorksheetResponse,
} from './worksheet'
import { countFilledMoves } from './worksheetToGraph'

const ADMIN_SESSION_KEY = 'bjj-automata-admin-v1'

export type AdminSheetRow = {
  id: string
  athleteName: string
  athleteEmail: string
  pinHash: string
  filledMoves: number
  updatedAt: string
  form: WorksheetResponse
}

export type ListedMove = {
  seatId: string
  seatLabel: string
  role: string
  rank: number
  name: string
  endsIn: string
  endsInLabel: string
  belt: string
  notes: string
}

export function isAdminConfigured(): boolean {
  return Boolean(import.meta.env.VITE_ADMIN_PASSWORD) && isSupabaseConfigured()
}

export function isAdminUnlocked(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function unlockAdmin(password: string): boolean {
  const expected = import.meta.env.VITE_ADMIN_PASSWORD
  if (!expected) return false
  if (password !== expected) return false
  sessionStorage.setItem(ADMIN_SESSION_KEY, '1')
  return true
}

export function lockAdmin() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}

function seatLabel(seatId: string): { label: string; role: string } {
  const seat = WORKSHEET_SEATS.find((s) => s.id === seatId)
  if (!seat) return { label: seatId, role: '' }
  return { label: seat.label, role: seat.role }
}

function endsInLabel(endsIn: string): string {
  if (endsIn === 'submitted') return 'Submission'
  const s = seatLabel(endsIn)
  if (!s.role || s.role === 'neutral' || s.role === 'attacking') return s.label
  return `${s.label} (${s.role === 'top' ? 'Top' : 'Bottom'})`
}

export function listFilledMoves(form: WorksheetResponse): ListedMove[] {
  const out: ListedMove[] = []
  for (const seat of form.seats) {
    const meta = seatLabel(seat.seatId)
    for (const m of seat.moves) {
      if (!m.name.trim()) continue
      out.push({
        seatId: seat.seatId,
        seatLabel: meta.label,
        role: meta.role,
        rank: m.rank,
        name: m.name.trim(),
        endsIn: m.endsIn,
        endsInLabel: endsInLabel(m.endsIn || 'submitted'),
        belt: m.belt || 'unrated',
        notes: m.notes.trim(),
      })
    }
  }
  return out
}

export function listSubmissions(form: WorksheetResponse): ListedMove[] {
  return listFilledMoves(form).filter(
    (m) => m.endsIn === 'submitted' || m.endsInLabel === 'Submission',
  )
}

export function sheetOptionLabel(row: AdminSheetRow): string {
  const email = row.athleteEmail || '(no email)'
  const pin = row.pinHash
    ? row.pinHash.length > 12
      ? 'PIN set'
      : `PIN ${row.pinHash}`
    : 'no PIN'
  const when = row.updatedAt
    ? new Date(row.updatedAt).toLocaleString()
    : 'unknown'
  return `${row.athleteName || '(unnamed)'} · ${email} · ${row.filledMoves} moves · ${pin} · ${when}`
}

export async function fetchAllAdminSheets(): Promise<AdminSheetRow[]> {
  const sb = getSupabase()
  if (!sb) throw new Error('Cloud not configured')

  const { data, error } = await sb
    .from('worksheets')
    .select('id, athlete_name, athlete_email, pin_hash, filled_moves, updated_at, payload')
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const form = normalizeWorksheet(row.payload)
    // Prefer DB identity columns over payload (payload may drift)
    form.athleteName = (row.athlete_name as string) || form.athleteName
    form.athleteEmail = (row.athlete_email as string) || form.athleteEmail
    form.pin = ''
    const filled =
      Number(row.filled_moves) || countFilledMoves(form)
    return {
      id: row.id as string,
      athleteName: form.athleteName,
      athleteEmail: form.athleteEmail ?? '',
      pinHash: (row.pin_hash as string) || '',
      filledMoves: filled,
      updatedAt: (row.updated_at as string) || '',
      form,
    }
  })
}
