'use client'

import {
  AlertTriangle,
  Camera,
  LogOut,
  Mic,
  MicOff,
  ShieldCheck,
  Timer,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  LAYOUTS,
  colorForId,
  type CapturedFrame,
  type LayoutId,
  type BackgroundOption,
  type Participant,
} from '@/lib/photobooth'
import {
  MAX_PEERS,
  useRoomConnection,
  type CountdownMessage,
} from '@/lib/webrtc/use-room-connection'
import { logEvent } from '@/lib/debug-log'
import { setDebugState } from '@/lib/debug-state'

type BoothViewProps = {
  mode: 'solo' | 'room'
  roomCode: string
  layout: LayoutId
  background: BackgroundOption
  displayName: string
  isHost: boolean 
  onLeave: () => void
  onSync?: (layoutId: string, backgroundId: string) => void
  onComplete: (frames: CapturedFrame[], participants: Participant[]) => void
}

const COUNTDOWN_MS = 3000
const GAP_MS = 700
const SHOT_INTERVAL_MS = COUNTDOWN_MS + GAP_MS
const FINALIZE_GRACE_MS = 900

type LocalPlan = CountdownMessage & { startAtEpochMs: number }

export function BoothView({
  mode,
  roomCode,
  layout,
  background,
  displayName,
  isHost,
  onLeave,
  onSync,
  onComplete,
}: BoothViewProps) {
  const shots = LAYOUTS.find((l) => l.id === layout)?.shots ?? 4

  const [permissionOpen, setPermissionOpen] = useState(true)
  const [granted, setGranted] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  const [plan, setPlan] = useState<LocalPlan | null>(null)
  const [nowTick, setNowTick] = useState(0)
  const [flash, setFlash] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const framesRef = useRef<CapturedFrame[]>([])
  const capturedShotsRef = useRef<Set<number>>(new Set())
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const localColor = colorForId(displayName + roomCode)

  const handleFrame = useCallback(
    (senderId: string, msg: { shotIndex: number; dataUrl: string }) => {
      framesRef.current = [
        ...framesRef.current.filter((f) => f.shotIndex !== msg.shotIndex),
        { participantId: 'you', shotIndex: msg.shotIndex, dataUrl: msg.dataUrl },
      ]
    },
    [],
  )

  const handleCountdown = useCallback((msg: CountdownMessage) => {
    capturedShotsRef.current = new Set()
    framesRef.current = [] 
    setCapturing(true)
    
    // Sync guest's UI to host's configuration
    if (onSync) onSync(msg.layoutId, msg.backgroundId)
    
    // Evaluate Date.now() strictly upon local receipt to eliminate system clock discrepancies
    setPlan({
      ...msg,
      startAtEpochMs: Date.now() + msg.delayMs
    })
  }, [onSync])

  const {
    peerId,
    remotePeers,
    roomFull,
    channelStatus,
    reconnectAttempt,
    broadcastCountdown,
    sendFrameToAll,
    setMicEnabled,
  } = useRoomConnection({
    roomCode,
    localMeta: { name: displayName, color: localColor },
    localStream,
    enabled: mode === 'room' && granted,
    onFrame: handleFrame,
    onCountdown: handleCountdown,
  })

  const participants: Participant[] = [
    { id: 'you', name: displayName, isYou: true, color: localColor },
    ...Array.from(remotePeers.values())
      .slice(0, MAX_PEERS - 1)
      .map((p) => ({ id: p.peerId, name: p.meta.name, color: p.meta.color })),
  ]

  async function requestAccess() {
    setRequesting(true)
    setMediaError(null)

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMediaError('Camera access requires a secure connection. Over a local network this means HTTPS.')
      setRequesting(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      })
      setLocalStream(stream)
      setGranted(true)
      setPermissionOpen(false)
    } catch (err) {
      setMediaError('Could not access your camera. Please check permissions and try again.')
    } finally {
      setRequesting(false)
    }
  }

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((t) => t.stop())
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current)
    }
  }, [localStream])

  useEffect(() => {
    setMicEnabled(micOn)
  }, [micOn, setMicEnabled])

  function captureMergedFrame(shotIndex: number) {
    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.readyState >= 2)
    if (videos.length === 0) return

    const canvas = document.createElement('canvas')
    // Determine strict target aspect ratios (Strip = 4:3, everything else = 1:1)
    const isSquare = layout !== 'strip'
    const canvasW = 800
    const canvasH = isSquare ? 800 : 600
    canvas.width = canvasW
    canvas.height = canvasH
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const count = videos.length
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellW = canvasW / cols
    const cellH = canvasH / rows

    videos.forEach((video, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const cx = col * cellW
      const cy = row * cellH

      const vidW = video.videoWidth
      const vidH = video.videoHeight
      const vidAspect = vidW / vidH
      const cellAspect = cellW / cellH
      
      // Calculate object-cover clipping mathematics to prevent image stretching
      let drawW = vidW, drawH = vidH, sx = 0, sy = 0
      if (vidAspect > cellAspect) {
        drawW = vidH * cellAspect
        sx = (vidW - drawW) / 2
      } else {
        drawH = vidW / cellAspect
        sy = (vidH - drawH) / 2
      }

      ctx.save()
      ctx.translate(cx + cellW, cy)
      ctx.scale(-1, 1) 
      ctx.drawImage(video, sx, sy, drawW, drawH, 0, 0, cellW, cellH)
      ctx.restore()
    })

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    framesRef.current = [
      ...framesRef.current.filter((f) => f.shotIndex !== shotIndex),
      { participantId: 'you', shotIndex, dataUrl },
    ]
    
    if (mode === 'room') sendFrameToAll(shotIndex, dataUrl)
  }

  useEffect(() => {
    if (!plan) return
    const id = setInterval(() => setNowTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [plan])

  useEffect(() => {
    if (!plan) return
    const elapsed = Date.now() - plan.startAtEpochMs
    const rawIndex = Math.floor(elapsed / plan.intervalMs)
    const shotIndex = Math.min(Math.max(rawIndex, 0), plan.totalShots - 1)

    if (
      elapsed >= shotIndex * plan.intervalMs + COUNTDOWN_MS &&
      !capturedShotsRef.current.has(shotIndex) &&
      elapsed >= 0
    ) {
      capturedShotsRef.current.add(shotIndex)
      
      if (plan.instigatorId === peerId || mode === 'solo') {
        captureMergedFrame(shotIndex)
      }

      setFlash(true)
      setTimeout(() => setFlash(false), 250)
    }

    const done =
      elapsed >= (plan.totalShots - 1) * plan.intervalMs + COUNTDOWN_MS &&
      capturedShotsRef.current.size >= plan.totalShots
      
    if (done && !finalizeTimerRef.current) {
      finalizeTimerRef.current = setTimeout(() => {
        finalizeTimerRef.current = null
        setPlan(null)
        setCapturing(false)
        onComplete(framesRef.current, participants)
      }, FINALIZE_GRACE_MS)
    }
  }, [nowTick, plan])

  function startCapture() {
    if (capturing || !granted || (!isHost && mode === 'room')) return
    
    const newPlan: CountdownMessage = {
      instigatorId: peerId,
      totalShots: shots,
      delayMs: 1500, // Send relative delay
      intervalMs: SHOT_INTERVAL_MS,
      layoutId: layout,
      backgroundId: background.id
    }
    
    if (mode === 'room') {
      broadcastCountdown(newPlan)
      handleCountdown(newPlan) // Trigger locally immediately 
    } else {
      handleCountdown(newPlan)
    }
  }

  const displayCount = (() => {
    if (!plan) return null
    const elapsed = Date.now() - plan.startAtEpochMs
    if (elapsed < 0) return 3 
    const shotIndex = Math.min(
      Math.max(Math.floor(elapsed / plan.intervalMs), 0),
      plan.totalShots - 1,
    )
    const timeIntoShot = elapsed - shotIndex * plan.intervalMs
    if (timeIntoShot >= COUNTDOWN_MS) return null
    return Math.max(1, Math.ceil((COUNTDOWN_MS - timeIntoShot) / 1000))
  })()

  const currentShotIndex = plan
    ? Math.min(
        Math.max(
          Math.floor((Date.now() - plan.startAtEpochMs) / plan.intervalMs),
          0,
        ),
        plan.totalShots - 1,
      )
    : 0

  const gridCols =
    participants.length <= 1
      ? 'grid-cols-1'
      : participants.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : participants.length <= 4
          ? 'grid-cols-2'
          : 'grid-cols-2 sm:grid-cols-3'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            {mode === 'room' ? `Room /r/${roomCode}` : 'Solo shoot'}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {participants.length} {participants.length === 1 ? 'person' : 'people'} ·{' '}
            {shots} shots
          </span>
        </div>
        <Button variant="destructive" size="sm" onClick={onLeave}>
          <LogOut className="size-4" /> Leave room
        </Button>
      </div>

      <div className={cn('grid gap-3', gridCols)}>
        {participants.map((p) => (
          <div
            key={p.id}
            className="relative aspect-video overflow-hidden rounded-3xl border border-border/60 bg-muted"
          >
            {p.isYou && granted ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 size-full scale-x-[-1] object-cover"
              />
            ) : !p.isYou ? (
              <RemoteVideoTile stream={remotePeers.get(p.id)?.stream ?? null} />
            ) : null}

            {(!p.isYou || !granted) && !remotePeers.get(p.id)?.stream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-zinc-900/50">
                <span className="flex items-center gap-1 text-xs">
                  <Camera className="size-3.5" />
                  {p.isYou ? 'camera off' : 'connecting…'}
                </span>
              </div>
            )}

            {plan && currentShotIndex >= 0 && displayCount !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
                <span className="text-6xl font-bold text-background drop-shadow-lg">
                  {displayCount}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => setMicOn((m) => !m)}
            className={cn(
              'flex size-12 items-center justify-center rounded-full border transition-colors',
              micOn
                ? 'border-border bg-card hover:bg-muted'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </button>

          <button
            type="button"
            onClick={startCapture}
            disabled={capturing || !granted || (!isHost && mode === 'room')}
            className="group relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            <span className="absolute inset-1.5 rounded-full border-4 border-primary-foreground/80" />
            <Camera className="size-7" />
          </button>

          <div className="flex w-24 items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm">
            <Timer className="size-4 text-primary" />
            <span className="font-medium">3s</span>
          </div>
        </div>

        <p className="text-center text-sm font-medium text-muted-foreground">
          {!granted
            ? 'Allow camera access to start shooting.'
            : capturing
              ? `Taking shot ${currentShotIndex + 1} of ${shots}…`
              : !isHost && mode === 'room'
                ? 'Waiting for Host to start the photoshoot...'
                : `Tap the shutter to capture ${shots} ${shots === 1 ? 'photo' : 'photos'}.`}
        </p>
      </div>

      {flash && (
        <div className="pointer-events-none fixed inset-0 z-50 bg-background animate-out fade-out duration-300" />
      )}

      <Modal open={permissionOpen} onClose={() => setPermissionOpen(false)}>
        <div className="flex flex-col items-center text-center">
          <h2 className="text-xl font-semibold tracking-tight">Allow camera access</h2>
          <Button size="lg" className="mt-4" onClick={requestAccess} disabled={requesting}>
            {requesting ? 'Requesting…' : 'Allow access'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function RemoteVideoTile({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream
  }, [stream])
  if (!stream) return null
  return <video ref={ref} autoPlay playsInline className="absolute inset-0 size-full scale-x-[-1] object-cover" />
}