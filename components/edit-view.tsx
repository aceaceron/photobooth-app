'use client'

import { ArrowLeft, Check, Download, RotateCcw, Sparkles, Share2 } from 'lucide-react'
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
  const [isMobile, setIsMobile] = useState(false)
  const shots = LAYOUTS.find((l) => l.id === layout)?.shots ?? 4
  const filterCss = filterToCss(filters)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

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
    <ShotMosaic key={i} dataUrls={dataUrls} filterCss={filterCss} />
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

  async function generateCompositeCanvas(): Promise<HTMLCanvasElement | null> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    let W = 900
    const pad = 40
    const gap = 28
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
      H = pad * 2 + ch * 4 + gap * 3 + 56
      cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad, y: pad + i * (ch + gap), w: cw, h: ch }))
    } else if (layout === 'grid') {
      const cw = (W - pad * 2 - gap) / 2
      H = pad * 2 + cw * 2 + gap + 56
      cellDefs = [0, 1, 2, 3].map((i) => ({ x: pad + (i % 2) * (cw + gap), y: pad + Math.floor(i / 2) * (cw + gap), w: cw, h: cw }))
    } else if (layout === 'asymmetric') {
      const big = ((W - pad * 2) * 2) / 3 - gap / 2
      const small = (W - pad * 2) / 3 - gap / 2
      H = pad * 2 + big + 56
      cellDefs = [
        { x: pad, y: pad, w: big, h: big },
        { x: pad + big + gap, y: pad, w: small, h: small },
        { x: pad + big + gap, y: pad + small + gap, w: small, h: small },
        { x: pad + big + gap, y: pad + (small + gap) * 2, w: small, h: small },
      ]
    } else {
      const cw = W - pad * 2
      H = pad * 2 + cw + 90
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
        drawImageCover(ctx, bgImg, 0, 0, W, H)
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
      roundRect(ctx, c.x, c.y, c.w, c.h, 16)
      ctx.clip()
      
      // Handle mobile fallback for canvas filters
      if (ctx.filter) ctx.filter = filterCss

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
      }
      ctx.filter = 'none'
      ctx.restore()
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.font = '600 18px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`SNAPORY \u00b7 ${new Date().getFullYear()}`, W / 2, H - 28)

    return canvas
  }

  async function saveToDevice() {
    setExporting(true)
    try {
      const canvas = await generateCompositeCanvas()
      if (!canvas) return

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return

      const filename = `snapory-strip-${Date.now()}.png`

      // Mobile Safe: Try using native sharing container for instant roll saves
      if (isMobile && navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'image/png' })] })) {
        const file = new File([blob], filename, { type: 'image/png' })
        await navigator.share({
          files: [file],
          title: 'Your Snapory Photostrip',
        })
      } else {
        // Desktop / Fallback standard download link
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Export context error:', err)
    } finally {
      setExporting(false)
    }
  }

  function downloadVideo() {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl
    // Explicitly enforce mp4 layout extension definitions
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
              className={cn('w-full max-w-[220px]', layout === 'strip' && participants.length < 3 && 'max-w-[150px]')}
            />
          </div>
          {videoUrl && (
            <div className="w-full max-w-[320px] rounded-3xl overflow-hidden border border-border/60 shadow-lg bg-black">
              <p className="text-xs text-center py-2 text-white/50 bg-zinc-900 font-semibold tracking-widest uppercase">Video Strip (.mp4)</p>
              <video src={videoUrl} controls autoPlay loop className="w-full" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
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
            </>
          )}

          <div className="flex flex-col gap-2">
            {isHost && !hostFinalized && (
              <Button size="lg" className="h-12 w-full text-sm bg-green-600 hover:bg-green-700 text-white mb-4" onClick={onHostFinalize}>
                <Check className="size-4 mr-2" /> Done Editing
              </Button>
            )}
            <Button size="lg" className="h-12 w-full text-sm" onClick={saveToDevice} disabled={exporting}>
              {saved ? <><Check className="size-4" /> Saved</> : exporting ? 'Processing...' : <><Download className="size-4" /> Save Photo Strip (.png)</>}
            </Button>
            {videoUrl && (
              <Button variant="secondary" size="lg" className="h-12 w-full text-sm" onClick={downloadVideo}>
                <Download className="size-4" /> Save Video Strip (.mp4)
              </Button>
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

function ShotMosaic({ dataUrls, filterCss }: { dataUrls: string[]; filterCss: string }) {
  if (dataUrls.length === 0) return <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-foreground/20" />
  const cols = dataUrls.length === 1 ? 1 : dataUrls.length === 3 ? 3 : 2
  return (
    <div className="absolute inset-0 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, filter: filterCss }}>
      {dataUrls.map((src, i) => (
        <img key={i} src={src} alt="" className="size-full object-cover" />
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, onChange, suffix = '' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
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