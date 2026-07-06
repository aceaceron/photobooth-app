'use client'

import { ArrowLeft, Check, Download, RotateCcw, Sparkles } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { Photostrip } from '@/components/photostrip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { drawImageCover, loadImage, roundRect } from '@/lib/canvas-compose'
import {
  DEFAULT_FILTERS,
  LAYOUTS,
  backgroundStyle,
  filterToCss,
  type BackgroundOption,
  type CapturedFrame,
  type FilterState,
  type LayoutId,
  type Participant,
} from '@/lib/photobooth'

type EditViewProps = {
  isHost?: boolean
  layout: LayoutId
  background: BackgroundOption
  participants: Participant[]
  frames: CapturedFrame[]
  videoUrl: string | null
  chatMessages: { sender: string; text: string; isAction?: boolean }[]
  onSendMessage: (text: string, isAction?: boolean) => void
  syncedFilters: FilterState | null
  onHostFilterUpdate: (filters: FilterState) => void
  hostFinalized: boolean
  onHostFinalize: () => void
  onRetake: () => void
  onDone: () => void
}

export function EditView({
  isHost = true,
  layout,
  background,
  participants,
  frames,
  videoUrl,
  chatMessages,
  onSendMessage,
  syncedFilters,
  onHostFilterUpdate,
  hostFinalized,
  onHostFinalize,
  onRetake,
  onDone,
}: EditViewProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const shots = LAYOUTS.find((l) => l.id === layout)?.shots ?? 4
  const filterCss = filterToCss(filters)
  
  const isDarkBg = background.id === 'ink'

  useEffect(() => {
    if (!isHost && syncedFilters) {
      setFilters(syncedFilters)
    }
  }, [isHost, syncedFilters])

  const shotFrames = useMemo(() => {
    return Array.from({ length: shots }, (_, shotIndex) =>
      participants
        .map((p) => frames.find((f) => f.shotIndex === shotIndex && f.participantId === p.id))
        .filter((f): f is CapturedFrame => !!f)
        .map((f) => f.dataUrl),
    )
  }, [frames, participants, shots])

  const cells = shotFrames.map((dataUrls, i) => (
    <ShotMosaic key={i} dataUrls={dataUrls} filterCss={filterCss} isDarkBg={isDarkBg} />
  ))

  function update<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    if (isHost) onHostFilterUpdate(next)
  }

  function handleResetFilters() {
    setFilters(DEFAULT_FILTERS)
    if (isHost) onHostFilterUpdate(DEFAULT_FILTERS)
  }

  function applyFiltersToCellCtx(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: FilterState) {
    const imgData = ctx.getImageData(x, y, w, h)
    const data = imgData.data

    const bMult = f.brightness / 100
    const cMult = f.contrast / 100
    const sMult = f.saturation / 100

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]

      r *= bMult
      g *= bMult
      b *= bMult

      r = (r - 128) * cMult + 128
      g = (g - 128) * cMult + 128
      b = (b - 128) * cMult + 128

      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      if (f.bw) {
        r = g = b = luma
      } else {
        r = luma + (r - luma) * sMult
        g = luma + (g - luma) * sMult
        b = luma + (b - luma) * sMult
      }

      if (f.vintage) {
        r = r * 0.9 + luma * 0.1 + 30
        g = g * 0.9 + luma * 0.1 + 15
        b = b * 0.9 + luma * 0.1
      }
      if (f.warmth !== 0) {
        r += f.warmth * 0.5
        b -= f.warmth * 0.5
      }

      data[i] = Math.min(255, Math.max(0, r))
      data[i + 1] = Math.min(255, Math.max(0, g))
      data[i + 2] = Math.min(255, Math.max(0, b))
    }

    ctx.putImageData(imgData, x, y)
  }

  async function saveToDevice() {
    setExporting(true)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      let W = 900
      const pad = 48
      const gap = 32
      let cellDefs: { x: number; y: number; w: number; h: number }[] = []
      let H = 0

      if (layout === 'strip') {
        if (participants.length >= 3) W = 1200
        const cw = W - pad * 2
        let ratio = 0.75
        if (participants.length === 2) ratio = 2 / 3
        if (participants.length === 3) ratio = 9 / 21
        if (participants.length >= 4) ratio = 9 / 16
        const ch = cw * ratio
        H = pad * 2 + ch * 4 + gap * 3 + 70
        cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad, y: pad + i * (ch + gap), w: cw, h: ch }))
      } else if (layout === 'grid') {
        const cw = (W - pad * 2 - gap) / 2
        H = pad * 2 + cw * 2 + gap + 70
        cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad + (i % 2) * (cw + gap), y: pad + Math.floor(i / 2) * (cw + gap), w: cw, h: cw }))
      } else if (layout === 'asymmetric') {
        const colWidth = (W - pad * 2 - gap * 2) / 3
        const bigW = colWidth * 2 + gap
        const bigH = colWidth * 3 + gap * 2
        H = pad * 2 + bigH + 70
        cellDefs = [
          { x: pad, y: pad, w: bigW, h: bigH },
          { x: pad + bigW + gap, y: pad, w: colWidth, h: colWidth },
          { x: pad + bigW + gap, y: pad + colWidth + gap, w: colWidth, h: colWidth },
          { x: pad + bigW + gap, y: pad + (colWidth + gap) * 2, w: colWidth, h: colWidth },
        ]
      } else {
        const cw = W - pad * 2
        H = pad * 2 + cw + 100
        cellDefs = [{ x: pad, y: pad, w: cw, h: cw }]
      }

      canvas.width = W
      canvas.height = H

      if (background.id === 'sunset') {
        const g = ctx.createLinearGradient(0, 0, W, H)
        g.addColorStop(0, '#f7b267')
        g.addColorStop(1, '#f25f5c')
        ctx.fillStyle = g
      } else if (background.id === 'custom') {
        try {
          const bgImg = await loadImage(background.swatch)
          ctx.save()
          drawImageCover(ctx, bgImg, 0, 0, W, H)
          ctx.restore()
        } catch {
          ctx.fillStyle = '#fdf3ec'
        }
      } else {
        ctx.fillStyle = background.swatch.startsWith('linear') ? '#fdf3ec' : background.swatch
      }
      if (background.id !== 'custom') ctx.fillRect(0, 0, W, H)

      for (let i = 0; i < cellDefs.length; i++) {
        const c = cellDefs[i]
        const dataUrls = shotFrames[i] ?? []
        ctx.save()
        roundRect(ctx, c.x, c.y, c.w, c.h, 24)
        ctx.clip()

        if (dataUrls.length === 0) {
          ctx.fillStyle = '#e5e0d8'
          ctx.fillRect(c.x, c.y, c.w, c.h)
        } else {
          const len = dataUrls.length
          const cols = len === 1 ? 1 : len === 3 ? 3 : 2
          const rows = Math.ceil(len / cols)
          const gapPx = 2
          
          const subW_gross = (c.w - (cols - 1) * gapPx) / cols
          const subH_gross = (c.h - (rows - 1) * gapPx) / rows

          const imgs = await Promise.all(dataUrls.map(loadImage))
          imgs.forEach((img, idx) => {
            const col = idx % cols
            const row = Math.floor(idx / cols)
            const dx = c.x + col * (subW_gross + gapPx)
            const dy = c.y + row * (subH_gross + gapPx)
            drawImageCover(ctx, img, dx, dy, subW_gross, subH_gross)
          })
          
          applyFiltersToCellCtx(ctx, c.x, c.y, c.w, c.h, filters)
        }
        ctx.restore()
      }

      ctx.fillStyle = isDarkBg ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
      ctx.font = '600 22px monospace'
      ctx.textAlign = 'center'
      if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '0.3em' }
      ctx.fillText(`SNAPORY · ${new Date().getFullYear()}`, W / 2, H - 32)

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return

      const fileName = `snapory-strip-${Date.now()}.png`

      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.canShare && navigator.share) {
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Snapory Photostrip',
          })
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          return
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to export photo strip:', err)
    } finally {
      setExporting(false)
    }
  }

  function downloadVideo() {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl
    a.download = `snapory-video-strip-${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        {isHost && !hostFinalized && (
          <Button variant="ghost" size="sm" onClick={onRetake} className="-ml-2">
            <ArrowLeft className="size-4" /> Retake
          </Button>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {isHost ? 'Edit & export' : 'Your snapshot'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isHost ? 'Tune your strip, then save it straight to your device.' : 'Save the final result to your device.'}
        </p>
      </div>

      <div className={cn("grid gap-8", isHost || chatMessages.length > 0 ? "lg:grid-cols-[1fr_380px]" : "grid-cols-1 max-w-3xl mx-auto")}>
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-start justify-center rounded-3xl border border-border/60 bg-muted/30 p-6 sm:p-10 w-full">
            <Photostrip
              layout={layout}
              backgroundClass={background.className}
              backgroundStyle={backgroundStyle(background)}
              filterCss={filterCss}
              cells={cells}
              participantCount={participants.length}
              isDarkBg={isDarkBg}
              className={cn('w-full max-w-[220px]', layout === 'strip' && participants.length < 3 && 'max-w-[150px]')}
            />
          </div>
          {videoUrl && (
            <div className="w-full max-w-[320px] rounded-3xl overflow-hidden border border-border/60 shadow-lg bg-black">
              <p className="text-xs text-center py-2 text-white/50 bg-zinc-900 font-semibold tracking-widest uppercase">Video Strip</p>
              <video src={videoUrl} controls autoPlay loop playsInline className="w-full" style={{ filter: filterCss }} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
          {participants.length > 1 && (!hostFinalized || chatMessages.length > 0) && (
             <div className="rounded-3xl border border-border/60 bg-card/50 p-5 backdrop-blur flex flex-col h-56">
                <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
                  Chat & Suggestions
                </h2>
                <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-2 border-b border-border/50 pb-2">
                  {chatMessages.map((c, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-bold text-primary">{c.sender}: </span>
                        <span className={c.isAction ? "italic text-muted-foreground" : "text-foreground"}>{c.text}</span>
                      </div>
                  ))}
                  {chatMessages.length === 0 && <div className="text-sm text-muted-foreground italic opacity-50">No messages yet...</div>}
                </div>
                {!hostFinalized && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onSendMessage('Make it brighter! ☀️', true)}>Brighter</Button>
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onSendMessage('Make it darker 🌙', true)}>Darker</Button>
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onSendMessage('Try Vintage 🎞️', true)}>Vintage</Button>
                  </div>
                )}
             </div>
          )}

          {isHost && !hostFinalized && (
            <>
              <section className="rounded-3xl border border-border/60 bg-card/50 p-5 backdrop-blur">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-4 text-primary" /> Adjust
                </h2>
                <div className="flex flex-col gap-5">
                  <Slider label="Skin tone" value={filters.saturation} min={0} max={200} onChange={(v) => update('saturation', v)} suffix="%" />
                  <Slider label="Brightness" value={filters.brightness} min={50} max={150} onChange={(v) => update('brightness', v)} suffix="%" />
                  <Slider label="Contrast" value={filters.contrast} min={50} max={150} onChange={(v) => update('contrast', v)} suffix="%" />
                  <Slider label="Warmth" value={filters.warmth} min={-40} max={80} onChange={(v) => update('warmth', v)} />
                </div>
              </section>

              <section className="rounded-3xl border border-border/60 bg-card/50 p-5 backdrop-blur">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Filters</h2>
                <div className="flex flex-wrap gap-2">
                  <PresetToggle active={!filters.vintage && !filters.bw} onClick={() => update('vintage', false)} label="Original" />
                  <PresetToggle active={filters.vintage} onClick={() => update('vintage', !filters.vintage)} label="Vintage" />
                  <PresetToggle active={filters.bw} onClick={() => update('bw', !filters.bw)} label="B&W" />
                  <button type="button" onClick={handleResetFilters} className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <RotateCcw className="size-3.5" /> Reset
                  </button>
                </div>
              </section>
            </>
          )}

          <div className="flex flex-col gap-2">
            {!isHost && !hostFinalized ? (
               <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-2xl border text-center animate-pulse">
                  <Sparkles className="size-6 text-primary mb-2" />
                  <p className="font-semibold text-sm">Waiting for Host to finalize edits...</p>
               </div>
            ) : (
              <>
                {isHost && !hostFinalized && (
                  <Button size="lg" className="h-12 w-full text-sm bg-green-600 hover:bg-green-700 text-white mb-4" onClick={onHostFinalize}>
                    <Check className="size-4 mr-2" /> Done Editing
                  </Button>
                )}
                <Button size="lg" className="h-12 w-full text-sm" onClick={saveToDevice} disabled={exporting}>
                  {saved ? <><Check className="size-4" /> Saved Successfully</> : exporting ? 'Exporting\u2026' : <><Download className="size-4" /> Save Photo Strip</>}
                </Button>
                {videoUrl && (
                  <Button variant="secondary" size="lg" className="h-12 w-full text-sm" onClick={downloadVideo}>
                    <Download className="size-4" /> Save Video Strip
                  </Button>
                )}
              </>
            )}

            <Button variant="outline" size="lg" className="h-11 w-full text-sm mt-4" onClick={onDone}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ShotMosaic({
  dataUrls,
  filterCss,
  isDarkBg
}: {
  dataUrls: string[]
  filterCss: string
  isDarkBg: boolean
}) {
  if (dataUrls.length === 0) return <div className={cn("absolute inset-0 bg-gradient-to-br", isDarkBg ? "from-white/5 to-white/20" : "from-black/5 to-black/20")} />
  
  const cols = dataUrls.length === 1 ? 1 : dataUrls.length === 3 ? 3 : 2
  return (
    <div className="absolute inset-0 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, filter: filterCss }}>
      {dataUrls.map((src, i) => (
        <img key={i} src={src} alt="" className="size-full object-cover" />
      ))}
    </div>
  )
}

function Slider({
  label, value, min, max, onChange, suffix = '',
}: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string
}) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary" />
    </label>
  )
}

function PresetToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('rounded-full border px-4 py-1.5 text-sm font-medium transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted')}>
      {label}
    </button>
  )
}