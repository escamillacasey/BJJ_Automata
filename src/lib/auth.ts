import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './supabase'

export function appOriginRedirect(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? base : `${base}/`
  return `${window.location.origin}${path}`
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

export async function getUser(): Promise<User | null> {
  const session = await getSession()
  return session?.user ?? null
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  const sb = getSupabase()
  if (!sb) return { error: 'Cloud not configured' }
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appOriginRedirect(),
      queryParams: {
        prompt: 'select_account',
      },
    },
  })
  if (error) return { error: error.message }
  return {}
}

export async function signOut(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
}

export function displayNameFromUser(user: User): string {
  const meta = user.user_metadata ?? {}
  return (
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Athlete'
  )
}

export function emailFromUser(user: User): string {
  return (user.email ?? '').trim().toLowerCase()
}

export function subscribeAuth(
  onChange: (session: Session | null) => void,
): () => void {
  const sb = getSupabase()
  if (!sb) {
    onChange(null)
    return () => {}
  }
  void sb.auth.getSession().then(({ data }) => onChange(data.session))
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    onChange(session)
  })
  return () => data.subscription.unsubscribe()
}

export function authAvailable(): boolean {
  return isSupabaseConfigured()
}
