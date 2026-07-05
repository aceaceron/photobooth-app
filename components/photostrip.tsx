'use client'

import { cn } from '@/lib/utils'
import type { LayoutId } from '@/lib/photobooth'

type PhotostripProps = {
  layout: LayoutId
  backgroundClass: string
  backgroundStyle?: React.CSSProperties
  filterCss?: string
  cells?: React.ReactNode[]
  showLogo?: boolean
  className?: string
}

function Cell({
  children,
  filterCss,
  className,
}: {
  children?: React.ReactNode
  filterCss?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-foreground/10',
        className,
      )}
      style={filterCss ? { filter: filterCss } : undefined}
    >
      {children ?? (
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-foreground/20" />
      )}
    </div>
  )
}

export function Photostrip({
  layout,
  backgroundClass,
  backgroundStyle,
  filterCss,
  cells = [],
  showLogo = true,
  className,
}: PhotostripProps) {
  const get = (i: number) => cells[i]

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl p-2.5 shadow-lg shadow-foreground/10',
        backgroundClass,
        className,
      )}
      style={backgroundStyle}
    >
      {layout === 'strip' && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Cell key={i} filterCss={filterCss} className="aspect-[4/3]">
              {get(i)}
            </Cell>
          ))}
        </div>
      )}

      {layout === 'asymmetric' && (
        <div className="grid grid-cols-3 grid-rows-3 gap-2">
          <Cell filterCss={filterCss} className="col-span-2 row-span-3">
            {get(0)}
          </Cell>
          <Cell filterCss={filterCss} className="aspect-square">
            {get(1)}
          </Cell>
          <Cell filterCss={filterCss} className="aspect-square">
            {get(2)}
          </Cell>
          <Cell filterCss={filterCss} className="aspect-square">
            {get(3)}
          </Cell>
        </div>
      )}

      {layout === 'grid' && (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Cell key={i} filterCss={filterCss} className="aspect-square">
              {get(i)}
            </Cell>
          ))}
        </div>
      )}

      {layout === 'polaroid' && (
        <div className="flex flex-col gap-2">
          <Cell filterCss={filterCss} className="aspect-square">
            {get(0)}
          </Cell>
          <div className="h-8" />
        </div>
      )}

      {showLogo && (
        <p className="pb-0.5 text-center font-mono text-[9px] font-medium tracking-widest text-foreground/50 uppercase mix-blend-luminosity">
          Snapory · {new Date().getFullYear()}
        </p>
      )}
    </div>
  )
}
