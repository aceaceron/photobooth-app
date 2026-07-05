'use client'

import { Bug, Play, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { clearLog, useDebugLog } from '@/lib/debug-log'
import { useDebugState } from '@/lib/debug-state'
import { runRealtimeDiagnostic } from '@/lib/supabase/diagnostics'

/**
 * Floating debug panel. The toggle tab is always a small, fixed-size
 * corner button so it can never itself grow into a full-screen overlay
 * that would block taps — the exact failure mode we're hunting for
 * elsewhere in the UI.
 */
export function DebugOverlay() {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const log = useDebugLog()
  const state = useDebugState()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open debug panel"
        className="fixed bottom-4 right-4 z-[999] flex size-11 items-center justify-center rounded-full bg-black/80 text-white shadow-lg"
      >
        <Bug className="size-5" />
      </button>
    )
  }

  return (
    <div className="fixed inset-x-2 bottom-2 z-[999] max-h-[70vh] overflow-hidden rounded-2xl border border-white/10 bg-black/90 text-white shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/70">
          <Bug className="size-3.5" /> Debug
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearLog}
            aria-label="Clear log"
            className="flex size-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close debug panel"
            className="flex size-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setRunning(true)
            runRealtimeDiagnostic().finally(() => setRunning(false))
          }}
          disabled={running}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white hover:bg-white/20 disabled:opacity-50"
        >
          <Play className="size-3" /> {running ? 'Running…' : 'Test Realtime connection'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-white/10 px-3 py-2 font-mono text-[11px]">
        {Object.entries(state).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-white/50">{k}</span>
            <span className="truncate text-right text-white">{String(v)}</span>
          </div>
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {log.length === 0 && <p className="text-white/40">No events yet.</p>}
        {log
          .slice()
          .reverse()
          .map((entry) => (
            <div
              key={entry.id}
              className={
                entry.level === 'error'
                  ? 'text-red-400'
                  : entry.level === 'warn'
                    ? 'text-amber-300'
                    : 'text-white/80'
              }
            >
              <span className="text-white/40">{entry.time}</span>{' '}
              <span className="text-white/60">[{entry.scope}]</span>{' '}
              {entry.message}
              {entry.data !== undefined && (
                <span className="text-white/40">
                  {' '}
                  {typeof entry.data === 'string'
                    ? entry.data
                    : JSON.stringify(entry.data)}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}