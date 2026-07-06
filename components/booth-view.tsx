'use client'

import { AlertTriangle, Camera, LogOut, Mic, MicOff, Timer, Video, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EditView } from '@/components/edit-view'
import { BACKGROUNDS, LAYOUTS, colorForId, type CapturedFrame, type LayoutId, type BackgroundOption, type Participant, type FilterState } from '@/lib/photobooth'
import { MAX_PEERS, useRoomConnection, type CountdownMessage } from '@/lib/webrtc/use-room-connection'
import { roundRect, drawImageCover } from '@/lib/canvas-compose'

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

type LocalPlan = CountdownMessage & { startAtEpochMs: number }

export function BoothView({ mode, isHost, roomCode, layout, background, displayName, onLeave, onSyncTemplate }: BoothViewProps) {
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

  const [shootResult, setShootResult] = useState<{frames: CapturedFrame[], participants: Participant[]} | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<{sender: string, text: string, isAction?: boolean}[]>([])
  const [syncedFilters, setSyncedFilters] = useState<FilterState | null>(null)
  const [hostFinalized, setHostFinalized] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const framesRef = useRef<CapturedFrame[]>([])
  const capturedShotsRef = useRef<Set<number>>(new Set())
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Isolated Video Recording Refs
  const rawCanvasRef = useRef<HTMLCanvasElement>(null)
  const stripCanvasRef = useRef<HTMLCanvasElement>(null)
  const rawRecordersRef = useRef<(MediaRecorder | null)[]>([])
  const rawChunksRef = useRef<Blob[][]>([[], [], [], []])
  const rAFRef = useRef<number | null>(null)
  
  const liveRecorderStartedRef = useRef(false)
  const layoutRef = useRef(layout)
  const backgroundRef = useRef(background)
  
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
    
    if (onSyncTemplate) {
      const resolvedBackground = BACKGROUNDS.find((b) => b.id === msg.backgroundId) ?? (msg.backgroundId === background.id ? background : BACKGROUNDS[0])
      onSyncTemplate(msg.layoutId, resolvedBackground)
    }
    
    setPlan({
      ...msg,
      startAtEpochMs: Date.now() + msg.delayMs
    })
  }, [onSyncTemplate, background])

  const handleChat = useCallback((msg: any) => setChatMessages(prev => [...prev, msg]), [])
  const handleSyncFilters = useCallback((filters: any) => setSyncedFilters(filters), [])
  const handleFinalize = useCallback(() => setHostFinalized(true), [])

  const { peerId, remotePeers, broadcastCountdown, sendFrameToAll, broadcastData, setMicEnabled } = useRoomConnection({
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
    ...Array.from(remotePeers.values()).slice(0, MAX_PEERS - 1).map((p) => ({ id: p.peerId, name: p.meta.name, color: p.meta.color })),
  ].sort((a, b) => a.id.localeCompare(b.id)) 

  const participantsRef = useRef(participants)
  
  useEffect(() => {
    layoutRef.current = layout
    backgroundRef.current = background
    participantsRef.current = participants
  }, [layout, background, participants])

  async function requestAccess() {
    setRequesting(true)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMediaError('Camera access requires a secure connection. Over a local network this means HTTPS.')
      setRequesting(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
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
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((t) => t.stop())
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current)
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current)
    }
  }, [localStream])

  useEffect(() => { setMicEnabled(micOn) }, [micOn, setMicEnabled])

  const drawLiveLoop = useCallback(() => {
    const canvas = rawCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.readyState >= 2 && v.id !== 'simultaneous-playback-vids')

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const len = participantsRef.current.length
    const cols = len === 1 ? 1 : len === 3 ? 3 : 2
    const rows = Math.ceil(len / cols)
    const subW = canvas.width / cols
    const subH = canvas.height / rows

    videos.forEach((video, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const dx = col * subW
      const dy = row * subH

      ctx.save()
      ctx.translate(dx + subW, dy)
      ctx.scale(-1, 1)
      drawImageCover(ctx, video, 0, 0, subW, subH)
      ctx.restore()
    })

    rAFRef.current = requestAnimationFrame(drawLiveLoop)
  }, [])

  function startShotRecording(index: number) {
    const canvas = rawCanvasRef.current
    if (!canvas) return
    canvas.width = 1280
    canvas.height = 720

    if (!rAFRef.current) drawLiveLoop()

    const stream = canvas.captureStream(30)
    const options = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ? { mimeType: 'video/mp4;codecs=h264' } : { mimeType: 'video/webm' }
    const recorder = new MediaRecorder(stream, options)
    
    rawChunksRef.current[index] = []
    recorder.ondataavailable = e => { if (e.data.size > 0) rawChunksRef.current[index].push(e.data) }
    recorder.start()
    rawRecordersRef.current[index] = recorder
  }

  function stopShotRecording(index: number) {
    const recorder = rawRecordersRef.current[index]
    if (recorder && recorder.state === 'recording') {
        recorder.stop()
    }
  }

  // Compiler perfectly aligned with Edit View layout dimensions
  async function compileVideoStrip() {
    const vids: HTMLVideoElement[] = []
    const objectUrls: string[] = []

    for (let i = 0; i < shots; i++) {
        const chunks = rawChunksRef.current[i] || []
        const blob = new Blob(chunks, { type: MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ? 'video/mp4' : 'video/webm' })
        const url = URL.createObjectURL(blob)
        objectUrls.push(url)

        const v = document.createElement('video')
        v.src = url
        v.muted = true
        v.playsInline = true
        v.crossOrigin = 'anonymous'
        v.id = 'simultaneous-playback-vids'
        v.load()
        
        await new Promise<void>(res => {
            v.onloadeddata = () => res()
            v.onerror = () => res()
        })
        vids.push(v)
    }

    const canvas = stripCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let W = 900
    const pad = 40
    const gap = 28
    let cellDefs: { x: number; y: number; w: number; h: number }[] = []
    let H = 0
    const currentLayout = layoutRef.current
    const currentBg = backgroundRef.current
    const pCount = participantsRef.current.length

    if (currentLayout === 'strip') {
       if (pCount >= 3) W = 1200
       const cw = W - pad * 2
       let ratio = 0.75
       if (pCount === 2) ratio = 2 / 3
       if (pCount === 3) ratio = 9 / 21
       if (pCount >= 4) ratio = 9 / 16
       const ch = cw * ratio
       H = pad * 2 + ch * 4 + gap * 3 + 56
       cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad, y: pad + i * (ch + gap), w: cw, h: ch }))
    } else if (currentLayout === 'grid') {
       const cw = (W - pad * 2 - gap) / 2
       H = pad * 2 + cw * 2 + gap + 56
       cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad + (i % 2) * (cw + gap), y: pad + Math.floor(i / 2) * (cw + gap), w: cw, h: cw }))
    } else if (currentLayout === 'asymmetric') {
       const colWidth = (W - pad * 2 - gap * 2) / 3
       const bigW = colWidth * 2 + gap
       const bigH = colWidth * 3 + gap * 2
       H = pad * 2 + bigH + 56
       cellDefs = [
          { x: pad, y: pad, w: bigW, h: bigH },
          { x: pad + bigW + gap, y: pad, w: colWidth, h: colWidth },
          { x: pad + bigW + gap, y: pad + colWidth + gap, w: colWidth, h: colWidth },
          { x: pad + bigW + gap, y: pad + (colWidth + gap) * 2, w: colWidth, h: colWidth },
       ]
    } else {
       const cw = W - pad * 2
       H = pad * 2 + cw + 90
       cellDefs = [{ x: pad, y: pad, w: cw, h: cw }]
    }

    canvas.width = W
    canvas.height = H

    const stream = canvas.captureStream(30)
    const options = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ? {mimeType: 'video/mp4;codecs=h264'} : {mimeType: 'video/webm'}
    const stripRecorder = new MediaRecorder(stream, options)
    const stripChunks: Blob[] = []
    
    stripRecorder.ondataavailable = e => { if (e.data.size > 0) stripChunks.push(e.data) }
    stripRecorder.onstop = () => {
       const finalBlob = new Blob(stripChunks, { type: options.mimeType })
       setVideoUrl(URL.createObjectURL(finalBlob))
       objectUrls.forEach(u => URL.revokeObjectURL(u))
    }

    stripRecorder.start()
    vids.forEach(v => v.play().catch(()=>{}))

    const startTime = performance.now()
    let frozen = false

    const drawStripFrame = () => {
       if (stripRecorder.state !== 'recording') return
       const elapsed = performance.now() - startTime

       if (elapsed >= COUNTDOWN_MS && !frozen) {
          frozen = true
          vids.forEach(v => v.pause())
       }

       if (elapsed >= COUNTDOWN_MS + 2000) { 
          stripRecorder.stop()
          return
       }

       if (currentBg.id === 'sunset') {
          const g = ctx.createLinearGradient(0, 0, W, H)
          g.addColorStop(0, '#f7b267')
          g.addColorStop(1, '#f25f5c')
          ctx.fillStyle = g
       } else {
          ctx.fillStyle = currentBg.swatch.startsWith('linear') ? '#fdf3ec' : currentBg.swatch
       }
       ctx.fillRect(0, 0, W, H)

       cellDefs.forEach((c, i) => {
          if (i >= shots) return
          ctx.save()
          roundRect(ctx, c.x, c.y, c.w, c.h, 16) 
          ctx.clip()
          if (vids[i] && vids[i].readyState >= 2) {
             drawImageCover(ctx, vids[i], c.x, c.y, c.w, c.h)
          } else {
             ctx.fillStyle = '#e5e0d8'
             ctx.fillRect(c.x, c.y, c.w, c.h)
          }
          ctx.restore()
       })

       const isDarkBg = currentBg.id === 'ink'
       ctx.fillStyle = isDarkBg ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
       ctx.font = '600 18px monospace' 
       ctx.textAlign = 'center'
       ctx.fillText(`SNAPORY · ${new Date().getFullYear()}`, W / 2, H - 28)

       requestAnimationFrame(drawStripFrame)
    }
    
    requestAnimationFrame(drawStripFrame)
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
    if (!plan) {
       liveRecorderStartedRef.current = false
       return
    }
    const id = setInterval(() => setNowTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [plan])

  useEffect(() => {
    if (!plan) return
    const elapsed = Date.now() - plan.startAtEpochMs

    if (elapsed >= 0 && !liveRecorderStartedRef.current) {
       liveRecorderStartedRef.current = true
       
       // Schedule independent recording containers for each shot
       for (let i = 0; i < plan.totalShots; i++) {
          const shotStartMs = plan.startAtEpochMs + i * plan.intervalMs
          const shotEndMs = shotStartMs + COUNTDOWN_MS
          
          const delayToStart = Math.max(0, shotStartMs - Date.now())
          const delayToEnd = Math.max(0, shotEndMs - Date.now())
          
          setTimeout(() => startShotRecording(i), delayToStart)
          setTimeout(() => stopShotRecording(i), delayToEnd)
       }
    }

    const rawIndex = Math.floor(elapsed / plan.intervalMs)
    const shotIndex = Math.min(Math.max(rawIndex, 0), plan.totalShots - 1)

    if (elapsed >= shotIndex * plan.intervalMs + COUNTDOWN_MS && !capturedShotsRef.current.has(shotIndex) && elapsed >= 0) {
      capturedShotsRef.current.add(shotIndex)
      captureLocalFrame(shotIndex)
      setFlash(true)
      setTimeout(() => setFlash(false), 250)
    }

    const done = elapsed >= (plan.totalShots - 1) * plan.intervalMs + COUNTDOWN_MS
    if (done && !finalizeTimerRef.current) {
      finalizeTimerRef.current = setTimeout(() => {
        if (rAFRef.current) {
            cancelAnimationFrame(rAFRef.current)
            rAFRef.current = null
        }
        compileVideoStrip()
        finalizeTimerRef.current = null
        setPlan(null)
        setCapturing(false)
        setShootResult({ frames: framesRef.current, participants: participantsRef.current })
      }, 500)
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-zinc-900/50">
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

      {/* Hidden processing render engines */}
      <canvas ref={rawCanvasRef} className="hidden" />
      <canvas ref={stripCanvasRef} className="hidden" />

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