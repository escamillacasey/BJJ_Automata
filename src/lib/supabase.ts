import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
/** Prefer publishable key; anon is the legacy name for the same client key. */
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey)
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(url!, publishableKey!)
  }
  return client
}

export type WorksheetRow = {
  id: string
  athlete_name: string
  athlete_email: string
  payload: unknown
  filled_moves: number
  updated_at: string
}
