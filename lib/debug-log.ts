'use client'

import { useSyncExternalStore } from 'react'

export type LogEntry = {
  id: number
  time: string
  scope: string
  message: string
  data?: unknown
  level: 'info' | 'warn' | 'error'
}

const MAX_ENTRIES = 80
let entries: LogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

// The fix that actually holds regardless of call site: never notify
// subscribers synchronously, full stop. logEvent() can be called from a
// render body, a useEffect, an event handler, or a WebRTC callback — any
// of those can, depending on exact timing, coincide with React's window
// for "currently rendering some component." Deferring the notification by
// one microtask guarantees it always lands in its own separate task,
// after whatever triggered it has fully finished. The `scheduled` guard
// also coalesces bursts of rapid logEvent() calls into one notification.
let scheduled = false
function emitChange() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    listeners.forEach((listener) => listener())
  })
}

export function logEvent(
  scope: string,
  message: string,
  data?: unknown,
  level: LogEntry['level'] = 'info',
) {
  const entry: LogEntry = {
    id: nextId++,
    time: new Date().toLocaleTimeString(undefined, {
      hour12: false,
      minute: '2-digit',
      second: '2-digit',
    }),
    scope,
    message,
    data,
    level,
  }
  entries = [...entries, entry].slice(-MAX_ENTRIES)

  // Deliberately never console.error() here: Next.js dev mode's error
  // overlay intercepts ANY console.error call, anywhere, and covers the
  // whole app with a full-screen "error" — including for conditions we
  // handle gracefully (a channel retry, a declined camera prompt).
  const consoleFn = level === 'info' ? console.log : console.warn
  consoleFn(`[${scope}] ${message}`, data ?? '')

  emitChange()
}

export function clearLog() {
  entries = []
  emitChange()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return entries
}

export function useDebugLog(): LogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}