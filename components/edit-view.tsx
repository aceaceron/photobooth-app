'use client'

import { ArrowLeft, Check, Download, RotateCcw, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Photostrip } from '@/components/photostrip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  drawImageCover,
  loadImage,
  mosaicRects,
  roundRect,
} from '@/lib/canvas-compose'
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
  onRetake: () => void
  onDone: () => void
}

export function EditView({
  isHost = true,
  layout,
  background,
  participants,
  frames,
  onRetake,
  onDone,
}: EditViewProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const shots = LAYOUTS.find((l) => l.id === layout)?.shots ?? 4
  const filterCss = filterToCss(filters)

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
    setFilters((f) => ({ ...f, [key]: value }))
  }

  async function saveToDevice() {
    setExporting(true)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const W = 900
      const pad = 40
      const gap = 28
      let cellDefs: { x: number; y: number; w: number; h: number }[] = []
      let H = 0

      if (layout === 'strip') {
        const cw = W - pad * 2
        const ch = cw * 0.75
        H = pad * 2 + ch * 4 + gap * 3 + 56
        cellDefs = [0, 1, 2, 3].map((i) => ({
          x: pad,
          y: pad + i * (ch + gap),
          w: cw,
          h: ch,
        }))
      } else if (layout === 'grid') {
        const cw = (W - pad * 2 - gap) / 2
        H = pad * 2 + cw * 2 + gap + 56
        cellDefs = [0, 1, 2, 3].map((i) => ({
          x: pad + (i % 2) * (cw + gap),
          y: pad + Math.floor(i / 2) * (cw + gap),
          w: cw,
          h: cw,
        }))
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
          ctx.save()
          drawImageCover(ctx, bgImg, 0, 0, W, H)
          ctx.restore()
        } catch {
          ctx.fillStyle = '#fdf3ec'
        }
      } else {
        ctx.fillStyle = background.swatch.startsWith('linear')
          ? '#fdf3ec'
          : background.swatch
      }
      if (!(background.id === 'custom')) ctx.fillRect(0, 0, W, H)

      for (let i = 0; i < cellDefs.length; i++) {
        const c = cellDefs[i]
        const dataUrls = shotFrames[i] ?? []
        ctx.save()
        roundRect(ctx, c.x, c.y, c.w, c.h, 16)
        ctx.clip()
        ctx.filter = filterCss

        if (dataUrls.length === 0) {
          ctx.fillStyle = '#e5e0d8'
          ctx.fillRect(c.x, c.y, c.w, c.h)
        } else {
          const rects = mosaicRects(dataUrls.length, c.w, c.h)
          const imgs = await Promise.all(dataUrls.map(loadImage))
          imgs.forEach((img, idx) => {
            const r = rects[idx]
            drawImageCover(ctx, img, c.x + r.x, c.y + r.y, r.w, r.h)
          })
        }
        ctx.filter = 'none'
        ctx.restore()
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.font = '600 18px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`SNAPORY \u00b7 ${new Date().getFullYear()}`, W / 2, H - 28)

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `snapory-strip-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        {isHost && (
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

      <div className={cn("grid gap-8", isHost ? "lg:grid-cols-[1fr_360px]" : "grid-cols-1 max-w-3xl mx-auto")}>
        <div className="flex items-start justify-center rounded-3xl border border-border/60 bg-muted/30 p-6 sm:p-10">
          <Photostrip
            layout={layout}
            backgroundClass={background.className}
            backgroundStyle={backgroundStyle(background)}
            filterCss={filterCss}
            cells={cells}
            className={cn('w-full max-w-[220px]', layout === 'strip' && 'max-w-[150px]')}
          />
        </div>

        <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
          {isHost && (
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
                  <PresetToggle active={!filters.vintage && !filters.bw} onClick={() => setFilters(DEFAULT_FILTERS)} label="Original" />
                  <PresetToggle active={filters.vintage} onClick={() => update('vintage', !filters.vintage)} label="Vintage" />
                  <PresetToggle active={filters.bw} onClick={() => update('bw', !filters.bw)} label="B&W" />
                  <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <RotateCcw className="size-3.5" /> Reset
                  </button>
                </div>
              </section>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Button size="lg" className="h-12 w-full text-sm" onClick={saveToDevice} disabled={exporting}>
              {saved ? <><Check className="size-4" /> Saved to device</> : exporting ? 'Exporting\u2026' : <><Download className="size-4" /> Save to device</>}
            </Button>
            <Button variant="outline" size="lg" className="h-11 w-full text-sm" onClick={onDone}>
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
}: {
  dataUrls: string[]
  filterCss: string
}) {
  if (dataUrls.length === 0) return <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-foreground/20" />
  const cols = dataUrls.length <= 1 ? 1 : dataUrls.length <= 4 ? 2 : 3
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