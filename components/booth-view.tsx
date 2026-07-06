'use client'

import {
  AlertTriangle,
  Camera,
  LogOut,
  Mic,
  MicOff,
  Timer,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EditView } from '@/components/edit-view'
import {
  LAYOUTS,
  colorForId,
  type CapturedFrame,
  type LayoutId,
  type BackgroundOption,
  type Participant,
  type FilterState,
} from '@/lib/photobooth'
import {
  MAX_PEERS,
  useRoomConnection,
  type CountdownMessage,
} from '@/lib/webrtc/use-room-connection'
import { roundRect } from '@/lib/canvas-compose'

type BoothViewProps = {
  mode: 'solo' | 'room'
  roomCode: string
  layout: LayoutId
  background: BackgroundOption
  displayName: string
  isHost: boolean 
  onLeave: () => void
  onSyncTemplate: (layoutId: string, background: BackgroundOption) => void
}

const COUNTDOWN_MS = 3000
const GAP_MS = 700
const SHOT_INTERVAL_MS = COUNTDOWN_MS + GAP_MS
const FINALIZE_GRACE_MS = 900

type LocalPlan = CountdownMessage & { startAtEpochMs: number }

export function BoothView({
  mode,
  isHost,
  roomCode,
  layout,
  background,
  displayName,
  onLeave,
  onSyncTemplate,
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

  // Editing & Recording State
  const [shootResult, setShootResult] = useState<{frames: CapturedFrame[], participants: Participant[]} | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<{sender: string, text: string, isAction?: boolean}[]>([])
  const [syncedFilters, setSyncedFilters] = useState<FilterState | null>(null)
  const [hostFinalized, setHostFinalized] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const framesRef = useRef<CapturedFrame[]>([])
  const capturedShotsRef = useRef<Set<number>>(new Set())
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const combinedCanvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const currentActiveShotIndexRef = useRef<number>(0)

  const localColor = colorForId(displayName + roomCode)

  const handleFrame = useCallback((senderId: string, msg: { shotIndex: number; dataUrl: string }) => {
      framesRef.current = [
        ...framesRef.current.filter((f) => !(f.participantId === senderId && f.shotIndex === msg.shotIndex)),
        { participantId: senderId, shotIndex: msg.shotIndex, dataUrl: msg.dataUrl },
      ]
  }, [])

  const handleCountdown = useCallback((msg: CountdownMessage) => {
    capturedShotsRef.current = new Set()
    framesRef.current = [] 
    setCapturing(true)
    
    if (onSyncTemplate) onSyncTemplate(msg.layoutId, { id: msg.backgroundId } as BackgroundOption)
    
    setPlan({
      ...msg,
      startAtEpochMs: Date.now() + msg.delayMs
    })
  }, [onSyncTemplate])

  const handleChat = useCallback((msg: any) => setChatMessages(prev => [...prev, msg]), [])
  const handleSyncFilters = useCallback((filters: any) => setSyncedFilters(filters), [])
  const handleFinalize = useCallback(() => setHostFinalized(true), [])

  const {
    peerId,
    remotePeers,
    broadcastCountdown,
    sendFrameToAll,
    broadcastData,
    setMicEnabled,
  } = useRoomConnection({
    roomCode,
    localMeta: { name: displayName, color: localColor },
    localStream,
    enabled: mode === 'room' && granted,
    onFrame: handleFrame,
    onCountdown: handleCountdown,
    onChat: handleChat,
    onSyncFilters: handleSyncFilters,
    onFinalize: handleFinalize
  })

  const participants: Participant[] = [
    { id: peerId, name: displayName, isYou: true, color: localColor },
    ...Array.from(remotePeers.values())
      .slice(0, MAX_PEERS - 1)
      .map((p) => ({ id: p.peerId, name: p.meta.name, color: p.meta.color })),
  ].sort((a, b) => a.id.localeCompare(b.id)) 

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

  // Continuous loop combining real-time elements into the geometric specifications of the strip
  const drawVideoLoop = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'recording') return
    const canvas = combinedCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    // Draw Background Layer matching the layout configuration parameters
    if (background.id === 'sunset') {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      g.addColorStop(0, '#f7b267')
      g.addColorStop(1, '#f25f5c')
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = background.swatch.startsWith('linear') ? '#fdf3ec' : background.swatch
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.readyState >= 2)
    
    let W = canvas.width
    const pad = 40
    const gap = 28
    let cellDefs: { x: number; y: number; w: number; h: number }[] = []

    if (layout === 'strip') {
      const cw = W - pad * 2
      let ratio = 0.75
      if (participants.length === 2) ratio = 2 / 3
      if (participants.length === 3) ratio = 9 / 21
      if (participants.length >= 4) ratio = 9 / 16
      const ch = cw * ratio
      cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad, y: pad + i * (ch + gap), w: cw, h: ch }))
    } else if (layout === 'grid') {
      const cw = (W - pad * 2 - gap) / 2
      cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad + (i % 2) * (cw + gap), y: pad + Math.floor(i / 2) * (cw + gap), w: cw, h: cw }))
    } else if (layout === 'asymmetric') {
      const big = ((W - pad * 2) * 2) / 3 - gap / 2
      const small = (W - pad * 2) / 3 - gap / 2
      cellDefs = [
        { x: pad, y: pad, w: big, h: big },
        { x: pad + big + gap, y: pad, w: small, h: small },
        { x: pad + big + gap, y: pad + small + gap, w: small, h: small },
        { x: pad + big + gap, y: pad + (small + gap) * 2, w: small, h: small },
      ]
    } else {
      const cw = W - pad * 2
      cellDefs = [{ x: pad, y: pad, w: cw, h: cw }]
    }

    cellDefs.forEach((c, i) => {
      ctx.save()
      roundRect(ctx, c.x, c.y, c.w, c.h, 16)
      ctx.clip()

      // If the current countdown slot is running or complete, overlay feed animations
      if (i <= currentActiveShotIndexRef.current && videos.length > 0) {
        const len = videos.length
        const cols = len === 1 ? 1 : len === 3 ? 3 : 2
        const rows = Math.ceil(len / cols)
        const gapPx = 2
        
        const subW_gross = (c.w - (cols - 1) * gapPx) / cols
        const subH_gross = (c.h - (rows - 1) * gapPx) / rows

        videos.forEach((video, idx) => {
          const col = idx % cols
          const row = Math.floor(idx / cols)
          const dx = c.x + col * (subW_gross + gapPx)
          const dy = c.y + row * (subH_gross + gapPx)

          ctx.save()
          // Mirror context frame arrays
          ctx.translate(dx + subW_gross, dy)
          ctx.scale(-1, 1)
          
          const srcRatio = video.videoWidth / video.videoHeight
          const dstRatio = subW_gross / subH_gross
          let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight

          if (srcRatio > dstRatio) {
            sw = video.videoHeight * dstRatio
            sx = (video.videoWidth - sw) / 2
          } else {
            sh = video.videoWidth / dstRatio
            sy = (video.videoHeight - sh) / 2
          }

          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, subW_gross, subH_gross)
          ctx.restore()
        })
      } else {
        ctx.fillStyle = '#e5e0d8'
        ctx.fillRect(c.x, c.y, c.w, c.h)
      }
      ctx.restore()
    })

    requestAnimationFrame(drawVideoLoop)
  }, [layout, background, participants.length])

  function startVideoRecording() {
    const canvas = combinedCanvasRef.current
    if (!canvas) return
    
    // Set dynamic canvas bounding parameters to emulate structure output
    let canvasW = 900
    let canvasH = 1600
    if (layout === 'grid') canvasH = 1050
    if (layout === 'polaroid') canvasH = 1050

    canvas.width = canvasW
    canvas.height = canvasH

    try {
      const stream = canvas.captureStream(30)
      
      // Force high compliance standard MP4 containers when matching engine rules allow
      const options = MediaRecorder.isTypeSupported('video/mp4;codecs=h264')
        ? { mimeType: 'video/mp4;codecs=h264' }
        : { mimeType: 'video/webm' }

      const recorder = new MediaRecorder(stream, options)
      recordedChunksRef.current = []
      
      recorder.ondataavailable = (e) => { 
        if (e.data.size > 0) recordedChunksRef.current.push(e.data) 
      }
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: options.mimeType })
        setVideoUrl(URL.createObjectURL(blob))
      }
      
      recorder.start()
      mediaRecorderRef.current = recorder
      requestAnimationFrame(drawVideoLoop)
    } catch (err) {
      console.error("Video layout synchronization streaming failed:", err)
    }
  }

  function stopVideoRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
    }
  }

  function captureLocalFrame(shotIndex: number) {
    const video = localVideoRef.current
    if (!video || video.readyState < 2) return
    
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    framesRef.current = [
      ...framesRef.current.filter((f) => !(f.participantId === peerId && f.shotIndex === shotIndex)),
      { participantId: peerId, shotIndex, dataUrl },
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
    currentActiveShotIndexRef.current = shotIndex

    if (elapsed >= shotIndex * plan.intervalMs + COUNTDOWN_MS && !capturedShotsRef.current.has(shotIndex) && elapsed >= 0) {
      capturedShotsRef.current.add(shotIndex)
      captureLocalFrame(shotIndex)
      setFlash(true)
      setTimeout(() => setFlash(false), 250)
    }

    const done = elapsed >= (plan.totalShots - 1) * plan.intervalMs + COUNTDOWN_MS && capturedShotsRef.current.size >= plan.totalShots
      
    if (done && !finalizeTimerRef.current) {
      stopVideoRecording()
      finalizeTimerRef.current = setTimeout(() => {
        finalizeTimerRef.current = null
        setPlan(null)
        setCapturing(false)
        setShootResult({ frames: framesRef.current, participants })
      }, FINALIZE_GRACE_MS)
    }
  }, [nowTick, plan])

  function startCapture() {
    if (capturing || !granted || (!isHost && mode === 'room')) return
    
    const newPlan: CountdownMessage = {
      instigatorId: peerId,
      totalShots: shots,
      delayMs: 1500, 
      intervalMs: SHOT_INTERVAL_MS,
      layoutId: layout,
      backgroundId: background.id
    }
    
    startVideoRecording()

    if (mode === 'room') {
      broadcastCountdown(newPlan)
      handleCountdown(newPlan) 
    } else {
      handleCountdown(newPlan)
    }
  }

  const displayCount = (() => {
    if (!plan) return null
    const elapsed = Date.now() - plan.startAtEpochMs
    if (elapsed < 0) return 3 
    const shotIndex = Math.min(Math.max(Math.floor(elapsed / plan.intervalMs), 0), plan.totalShots - 1)
    const timeIntoShot = elapsed - shotIndex * plan.intervalMs
    if (timeIntoShot >= COUNTDOWN_MS) return null
    return Math.max(1, Math.ceil((COUNTDOWN_MS - timeIntoShot) / 1000))
  })()

  const currentShotIndex = plan ? Math.min(Math.max(Math.floor((Date.now() - plan.startAtEpochMs) / plan.intervalMs), 0), plan.totalShots - 1) : 0

  if (shootResult) {
    return (
      <EditView
        isHost={isHost}
        layout={layout}
        background={background}
        participants={shootResult.participants}
        frames={shootResult.frames}
        videoUrl={videoUrl}
        chatMessages={chatMessages}
        onSendMessage={(text, isAction) => {
          const msg = { sender: displayName, text, isAction }
          handleChat(msg)
          broadcastData({ type: 'chat', ...msg })
        }}
        syncedFilters={syncedFilters}
        onHostFilterUpdate={(filters) => broadcastData({ type: 'sync_filters', filters })}
        hostFinalized={hostFinalized}
        onHostFinalize={() => {
          setHostFinalized(true)
          broadcastData({ type: 'finalize' })
        }}
        onRetake={() => {
           setShootResult(null)
           setVideoUrl(null)
           setHostFinalized(false)
           setChatMessages([])
        }}
        onDone={onLeave}
      />
    )
  }

  const gridCols = participants.length <= 1 ? 'grid-cols-1' : participants.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : participants.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            {mode === 'room' ? `Room /r/${roomCode}` : 'Solo shoot'}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {participants.length} {participants.length === 1 ? 'person' : 'people'} · {shots} shots
          </span>
        </div>
        <Button variant="destructive" size="sm" onClick={onLeave}>
          <LogOut className="size-4" /> Leave room
        </Button>
      </div>

      <div className={cn('grid gap-3', gridCols)}>
        {participants.map((p) => (
          <div key={p.id} className="relative aspect-video overflow-hidden rounded-3xl border border-border/60 bg-muted">
            {p.isYou && granted ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 size-full scale-x-[-1] object-cover" />
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
                <span className="text-6xl font-bold text-background drop-shadow-lg">{displayCount}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <canvas ref={combinedCanvasRef} className="hidden" />

      <div className="mt-6 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center justify-center gap-6">
          <button type="button" onClick={() => setMicOn((m) => !m)} className={cn('flex size-12 items-center justify-center rounded-full border transition-colors', micOn ? 'border-border bg-card hover:bg-muted' : 'border-destructive/40 bg-destructive/10 text-destructive')}>
            {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </button>
          <button type="button" onClick={startCapture} disabled={capturing || !granted || (!isHost && mode === 'room')} className="group relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100">
            <span className="absolute inset-1.5 rounded-full border-4 border-primary-foreground/80" />
            <Camera className="size-7" />
          </button>
          <div className="flex w-24 items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm">
            <Timer className="size-4 text-primary" />
            <span className="font-medium">3s</span>
          </div>
        </div>
        <p className="text-center text-sm font-medium text-muted-foreground">
          {!granted ? 'Allow camera access to start shooting.' : capturing ? `Taking shot ${currentShotIndex + 1} of ${shots}…` : !isHost && mode === 'room' ? 'Waiting for Host to start the photoshoot...' : `Tap the shutter to capture ${shots} ${shots === 1 ? 'photo' : 'photos'}.`}
        </p>
      </div>

      {flash && <div className="pointer-events-none fixed inset-0 z-50 bg-background animate-out fade-out duration-300" />}

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