'use client'

import { ArrowLeft, ArrowRight, Check, Copy, ImagePlus, Sparkles, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { Photostrip } from '@/components/photostrip'
import { Button } from '@/components/ui/button'
import { BACKGROUNDS, LAYOUTS, backgroundStyle, type BackgroundOption, type LayoutId } from '@/lib/photobooth'
import { cn } from '@/lib/utils'

type SetupViewProps = {
  mode: 'solo' | 'room'
  isHost: boolean
  roomCode: string
  layout: LayoutId
  onLayoutChange: (id: LayoutId) => void
  background: BackgroundOption
  onBackgroundChange: (bg: BackgroundOption) => void
  onBack: () => void
  onStart: () => void
}

export function SetupView({ mode, isHost, roomCode, layout, onLayoutChange, background, onBackgroundChange, onBack, onStart }: SetupViewProps) {
  const [cropOpen, setCropOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCustomUrl(reader.result as string)
      setCropOpen(true)
    }
    reader.readAsDataURL(file)
  }

  function copyCode() {
    const link = typeof window !== 'undefined' ? `${window.location.origin}/r/${roomCode}` : `/r/${roomCode}`
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const isDarkBg = background.id === 'ink'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {mode === 'room' ? (isHost ? 'Set up your room' : 'Waiting for host') : 'Set up your shoot'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isHost ? 'Pick a layout and a backdrop for your strip.' : 'The host will choose the layout design shortly.'}
          </p>
        </div>

        {mode === 'room' && isHost && (
          <button type="button" onClick={copyCode} className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 py-2 pl-4 pr-2 text-sm backdrop-blur transition-colors hover:bg-muted">
            <span className="text-muted-foreground">Invite link</span>
            <span className="font-mono font-medium">/r/{roomCode}</span>
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </span>
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-8">
          {isHost ? (
            <>
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Layout</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {LAYOUTS.map((opt) => {
                    const active = opt.id === layout
                    return (
                      <button key={opt.id} type="button" onClick={() => onLayoutChange(opt.id)} className={cn('group flex flex-col items-center gap-3 rounded-2xl border p-4 text-center transition-all', active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/60 bg-card/50 hover:border-primary/40')}>
                        <div className="flex h-28 w-full items-center justify-center">
                          <Photostrip layout={opt.id} backgroundClass={background.className} backgroundStyle={backgroundStyle(background)} showLogo={false} isDarkBg={isDarkBg} className={cn('h-full', opt.id === 'strip' ? 'w-14' : 'w-24')} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{opt.name}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Backdrop</h2>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="size-4" /> Upload custom
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="sr-only" />
                </div>
                <div className="flex flex-wrap gap-3">
                  {customUrl && (
                    <button type="button" onClick={() => onBackgroundChange({ id: 'custom', name: 'Custom', className: 'bg-cover bg-center', swatch: customUrl })} className={cn('relative size-16 overflow-hidden rounded-2xl border-2 bg-cover bg-center transition-transform hover:scale-105', background.id === 'custom' ? 'border-primary ring-2 ring-primary/30' : 'border-border')} style={{ backgroundImage: `url(${customUrl})` }} />
                  )}
                  {BACKGROUNDS.map((bg) => {
                    const active = bg.id === background.id
                    return (
                      <button key={bg.id} type="button" onClick={() => onBackgroundChange(bg)} title={bg.name} className={cn('relative size-16 overflow-hidden rounded-2xl border-2 transition-transform hover:scale-105', active ? 'border-primary ring-2 ring-primary/30' : 'border-border')} style={{ background: bg.swatch }}>
                        {active && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Check className="size-5 text-primary-foreground drop-shadow" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center text-muted-foreground bg-card/50 rounded-3xl border border-border/60 p-8">
              <Sparkles className="size-10 text-primary mb-4 animate-pulse" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Almost ready</h2>
              <p>The host is currently configuring the strip's layout and style. Click Enter below to join them in the booth when you're ready.</p>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-border/60 bg-card/50 p-5 backdrop-blur">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="size-4 text-primary" /> {isHost ? 'Preview' : "Host's Design"}
            </p>
            <div className="mx-auto flex justify-center">
              <Photostrip layout={layout} backgroundClass={background.className} backgroundStyle={backgroundStyle(background)} isDarkBg={isDarkBg} className={cn('w-40', layout === 'strip' && 'w-28')} />
            </div>
            <Button size="lg" className="mt-5 h-11 w-full" onClick={onStart}>
              Enter the booth <ArrowRight className="size-4" />
            </Button>
          </div>
        </aside>
      </div>

      <Modal open={cropOpen} onClose={() => setCropOpen(false)} labelledBy="crop-title">
        <h2 id="crop-title" className="mb-1 text-lg font-semibold">Crop your backdrop</h2>
        <p className="mb-4 text-sm text-muted-foreground">Drag to reposition. This is a preview of the cropping tool.</p>
        <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-border bg-muted">
          {customUrl && <img src={customUrl || '/placeholder.svg'} alt="Preview" className="size-full object-cover" />}
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-primary-foreground/80" />
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setCropOpen(false)}>Cancel</Button>
          <Button className="flex-1" onClick={() => { if (customUrl) { onBackgroundChange({ id: 'custom', name: 'Custom', className: 'bg-cover bg-center', swatch: customUrl }) } setCropOpen(false) }}>
            <Upload className="size-4" /> Apply backdrop
          </Button>
        </div>
      </Modal>
    </div>
  )
}