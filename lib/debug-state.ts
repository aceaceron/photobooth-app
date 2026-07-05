'use client'

import { useSyncExternalStore } from 'react'

type DebugState = Record<string, string | number | boolean | null | undefined>

let state: DebugState = {}
const listeners = new Set<() => void>()

// Same reasoning as lib/debug-log.ts: never notify subscribers
// synchronously from setDebugState's call site, no matter what that call
// site is. Deferring by one (coalesced) microtask guarantees the
// notification always lands outside whatever triggered it.
let scheduled = false
function emitChange() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    listeners.forEach((listener) => listener())
  })
}

/** Merge a partial state update in from anywhere in the app. */
export function setDebugState(patch: DebugState) {
  state = { ...state, ...patch }
  emitChange()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function useDebugState(): DebugState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}