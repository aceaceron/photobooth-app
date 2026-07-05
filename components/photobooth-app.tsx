'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AuthDialog } from '@/components/auth-dialog'
import { BoothView } from '@/components/booth-view'
import { EditView } from '@/components/edit-view'
import { JoinNameDialog } from '@/components/join-name-dialog'
import { LandingView } from '@/components/landing-view'
import { SetupView } from '@/components/setup-view'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { useAuth } from '@/hooks/use-auth'
import { logEvent } from '@/lib/debug-log'
import { setDebugState } from '@/lib/debug-state'
import { DebugOverlay } from '@/components/debug-overlay'
import {
  BACKGROUNDS,
  generateRoomCode,
  sanitizeRoomCode,
  type AppView,
  type BackgroundOption,
  type CapturedFrame,
  type LayoutId,
  type Participant,
} from '@/lib/photobooth'

const GUEST_NAME_KEY = 'snapory-guest-name'

function makeGuestName() {
  return `Guest ${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export function PhotoboothApp({
  initialRoomCode,
  roomCodeLooksValid = true,
}: {
  initialRoomCode?: string
  roomCodeLooksValid?: boolean
}) {
  const router = useRouter()
  const { user, loading } = useAuth()

  const [view, setView] = useState<AppView>(initialRoomCode ? 'setup' : 'landing')
  const [mode, setMode] = useState<'solo' | 'room'>(initialRoomCode ? 'room' : 'solo')
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? '')
  const [layout, setLayout] = useState<LayoutId>('strip')
  const [background, setBackground] = useState<BackgroundOption>(BACKGROUNDS[0])
  const [authOpen, setAuthOpen] = useState(false)
  
  const [isHost, setIsHost] = useState(mode === 'solo' || !initialRoomCode)

  const [guestName, setGuestName] = useState<string | null>(null)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const guestInitRef = useRef(false)

  // FIX: Restore Host privileges if the page reloaded after navigation or refresh
  useEffect(() => {
    if (initialRoomCode && typeof window !== 'undefined') {
      const isHostOfThisRoom = sessionStorage.getItem(`snapory_host_${initialRoomCode}`) === 'true'
      if (isHostOfThisRoom) {
        setIsHost(true)
      }
    }
  }, [initialRoomCode])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
          logEvent('sw', `unregistering stray service worker: ${reg.scope}`, undefined, 'warn')
          reg.unregister()
        })
      })
    }
  }, [])

  useEffect(() => {
    if (mode !== 'room' || loading || user || guestInitRef.current) return
    guestInitRef.current = true

    const stored =
      typeof window !== 'undefined' ? sessionStorage.getItem(GUEST_NAME_KEY) : null
    const initial = stored || makeGuestName()
    setGuestName(initial)
    if (typeof window !== 'undefined') sessionStorage.setItem(GUEST_NAME_KEY, initial)
    setJoinDialogOpen(true)
  }, [mode, loading, user])

  const [shootResult, setShootResult] = useState<{
    frames: CapturedFrame[]
    participants: Participant[]
  } | null>(null)

  function handleCreateRoom() {
    logEvent('nav', 'Create Room tapped')
    const code = generateRoomCode()
    
    // FIX: Save a host ticket in sessionStorage so it persists across the Next.js navigation remount
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`snapory_host_${code}`, 'true')
    }

    setMode('room')
    setRoomCode(code)
    setIsHost(true)
    setView('setup')
    router.push(`/r/${code}`)
  }

  function handleSolo() {
    logEvent('nav', 'Start Solo tapped')
    setMode('solo')
    setRoomCode('')
    setIsHost(true)
    setView('setup')
    router.push('/')
  }

  function handleJoin(code: string) {
    logEvent('nav', 'Join Room tapped', code)
    const clean = sanitizeRoomCode(code)
    if (!clean) return
    setMode('room')
    setRoomCode(clean)
    setIsHost(false)
    setView('setup')
    router.push(`/r/${clean}`)
  }

  function handleLeave() {
    setView('landing')
    setShootResult(null)
    router.push('/')
  }

  const displayName = user?.name || guestName || 'Guest'
  const authResolving = mode === 'room' && loading

  useEffect(() => {
    try {
      const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
      let url = raw ?? ''
      let hadExtraPath = false
      if (raw) {
        try {
          const parsed = new URL(raw)
          url = parsed.origin
          hadExtraPath = parsed.pathname !== '/' && parsed.pathname !== ''
        } catch { }
      }
      const looksPlaceholder = !raw || raw.includes('YOUR-PROJECT-REF')

      setDebugState({
        supabaseUrl: url ? url.replace(/^https?:\/\//, '') : 'MISSING',
        supabaseUrlIsPlaceholder: looksPlaceholder,
      })
    } catch (err) {
      setDebugState({ supabaseUrl: '(diagnostic unavailable — see console)' })
    }
  }, [])

  useEffect(() => {
    setDebugState({
      origin: typeof window !== 'undefined' ? window.location.origin : 'n/a',
      view,
      mode,
      roomCode: roomCode || 'none',
      roomCodeLooksValid,
      authLoading: loading,
      userEmail: user?.email ?? 'none (guest)',
      guestName: guestName ?? 'not set',
    })
  }, [view, mode, roomCode, roomCodeLooksValid, loading, user, guestName])

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader user={user} onProfileClick={() => setAuthOpen(true)} onHome={handleLeave} />

      <main className="flex-1">
        {!roomCodeLooksValid && mode === 'room' && (
          <div className="mx-auto mt-4 flex max-w-2xl items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            That invite link looks incomplete. You can still continue with room code{' '}
            <span className="font-mono font-medium">{roomCode || '(empty)'}</span>.
          </div>
        )}

        {authResolving ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
            Checking your session…
          </div>
        ) : (
          <>
            {view === 'landing' && (
              <LandingView
                user={user}
                onCreateRoom={handleCreateRoom}
                onSolo={handleSolo}
                onJoin={handleJoin}
              />
            )}

            {view === 'setup' && (
              <SetupView
                mode={mode}
                isHost={isHost}
                roomCode={roomCode}
                layout={layout}
                onLayoutChange={setLayout}
                background={background}
                onBackgroundChange={setBackground}
                onBack={handleLeave}
                onStart={() => setView('booth')}
              />
            )}

            {view === 'booth' && (
              <BoothView
                mode={mode}
                isHost={isHost}
                roomCode={roomCode}
                layout={layout}
                background={background}
                displayName={displayName}
                onLeave={handleLeave}
                onSync={(syncedLayout, syncedBgId) => {
                  setLayout(syncedLayout as LayoutId)
                  const bg = BACKGROUNDS.find(b => b.id === syncedBgId)
                  if (bg) setBackground(bg)
                }}
                onComplete={(frames, participants) => {
                  setShootResult({ frames, participants })
                  setView('edit')
                }}
              />
            )}

            {view === 'edit' && shootResult && (
              <EditView
                isHost={isHost}
                layout={layout}
                background={background}
                participants={shootResult.participants}
                frames={shootResult.frames}
                onRetake={() => setView('booth')}
                onDone={handleLeave}
              />
            )}
          </>
        )}
      </main>

      <SiteFooter />

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />

      {mode === 'room' && !user && guestName && (
        <JoinNameDialog
          open={joinDialogOpen}
          roomCode={roomCode}
          defaultName={guestName}
          onSubmit={(name) => {
            setGuestName(name)
            if (typeof window !== 'undefined')
              sessionStorage.setItem(GUEST_NAME_KEY, name)
            setJoinDialogOpen(false)
          }}
        />
      )}

      <DebugOverlay />
    </div>
  )
}