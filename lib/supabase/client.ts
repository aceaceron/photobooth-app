import { createBrowserClient } from '@supabase/ssr'

/**
 * Normalizes NEXT_PUBLIC_SUPABASE_URL down to its origin. A common
 * misconfiguration is pasting the REST endpoint from the dashboard
 * (".../rest/v1") instead of the bare Project URL — supabase-js then
 * builds the Realtime WebSocket URL by appending "/realtime/v1/websocket"
 * to whatever you gave it, producing a broken double path like
 * ".../rest/v1/realtime/v1/websocket" that fails with a silent transport
 * error and no indication of why. Stripping to origin here makes that
 * class of mistake harmless instead of a multi-hour debugging session.
 */
function normalizeSupabaseUrl(raw: string | undefined): {
  url: string
  hadExtraPath: boolean
} {
  if (!raw) return { url: '', hadExtraPath: false }
  try {
    const parsed = new URL(raw)
    return { url: parsed.origin, hadExtraPath: parsed.pathname !== '/' && parsed.pathname !== '' }
  } catch {
    return { url: raw, hadExtraPath: false }
  }
}

/**
 * Supabase client for use in Client Components ('use client').
 * Reads the public anon key + URL from env — safe to expose to the browser.
 *
 * Deliberately does NOT touch the debug store here. This factory gets
 * called from useMemo/useRef initializers (see hooks/use-auth.tsx and
 * lib/webrtc/use-room-connection.ts), which run inline as part of some
 * other component's render, and touching a subscriber-based store
 * synchronously from that call stack has repeatedly proven unsafe. See
 * checkSupabaseEnv() below for the safe way to surface diagnostics: compute
 * it here, but only *publish* it to the debug store from inside a
 * useEffect in an actual component.
 */
export function createClient() {
  const { url } = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createBrowserClient(url, anonKey ?? '')
}

/** Pure, side-effect-free — safe to call from anywhere, including render. */
export function checkSupabaseEnv(): {
  url: string
  looksPlaceholder: boolean
  hadExtraPath: boolean
} {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  const { url, hadExtraPath } = normalizeSupabaseUrl(raw)
  const looksPlaceholder = !raw || raw.includes('YOUR-PROJECT-REF')
  return {
    url: url ? url.replace(/^https?:\/\//, '') : 'MISSING',
    looksPlaceholder,
    hadExtraPath,
  }
}