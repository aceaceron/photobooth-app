'use client'

import { createClient, checkSupabaseEnv } from '@/lib/supabase/client'
import { logEvent } from '@/lib/debug-log'

/**
 * Opens a disposable Realtime channel with no relation to any room and
 * reports exactly what happens. Run this from the debug panel to tell
 * apart "my Supabase project/network is misconfigured" from "something in
 * the room-join code path is broken" — CHANNEL_ERROR here means the
 * problem is upstream of our app code entirely.
 */
export async function runRealtimeDiagnostic() {
  const { url, looksPlaceholder } = checkSupabaseEnv()
  logEvent('diagnostic', `Supabase URL: ${url}${looksPlaceholder ? ' (placeholder!)' : ''}`)

  if (looksPlaceholder) {
    logEvent(
      'diagnostic',
      'Stopping here — fix NEXT_PUBLIC_SUPABASE_URL first, everything below will fail.',
      undefined,
      'error',
    )
    return
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logEvent('diagnostic', 'navigator.onLine is false — this device has no network at all.', undefined, 'error')
    return
  }

  const supabase = createClient()
  const channelName = `debug-ping-${Date.now()}`
  logEvent('diagnostic', `Opening throwaway channel "${channelName}"…`)

  const result = await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => resolve('TIMEOUT (10s, no callback at all)'), 10000)
    const channel = supabase.channel(channelName)
    channel.subscribe((status, err) => {
      logEvent('diagnostic', `status: ${status}`, err?.message)
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout)
        channel.unsubscribe()
        resolve(status)
      }
    })
  })

  if (result === 'SUBSCRIBED') {
    logEvent('diagnostic', 'SUCCESS — Realtime connects fine outside the room flow. If rooms still fail, the bug is in room-specific code, not your Supabase project/network.')
  } else {
    logEvent(
      'diagnostic',
      `FAILED (${result}) on a plain channel with no app logic involved — this points to the Supabase project or network, not our code. Check: project not paused, correct anon key for THIS project, and that wss://*.supabase.co isn't blocked on this network.`,
      undefined,
      'error',
    )
  }
}