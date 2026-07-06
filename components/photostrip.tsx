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
  participantCount?: number
  isDarkBg?: boolean
}

function Cell({
  children,
  filterCss,
  className,
  style,
  isDarkBg
}: {
  children?: React.ReactNode
  filterCss?: string
  className?: string
  style?: React.CSSProperties
  isDarkBg?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[16px]',
        isDarkBg ? 'bg-white/10' : 'bg-black/10',
        className,
      )}
      style={{ ...(filterCss ? { filter: filterCss } : {}), ...style }}
    >
      {children ?? (
        <div className={cn("absolute inset-0 bg-gradient-to-br", isDarkBg ? "from-white/5 to-white/20" : "from-black/5 to-black/20")} />
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
  participantCount = 1,
  isDarkBg = false,
}: PhotostripProps) {
  const get = (i: number) => cells[i]

  let stripRatio = 4 / 3
  if (participantCount === 2) stripRatio = 3 / 2
  if (participantCount === 3) stripRatio = 21 / 9
  if (participantCount >= 4) stripRatio = 16 / 9

  return (
    <div
      className={cn(
        'flex flex-col gap-[28px] rounded-xl p-[40px] shadow-lg shadow-black/10',
        backgroundClass,
        className,
      )}
      style={backgroundStyle}
    >
      {layout === 'strip' && (
        <div className="flex flex-col gap-[28px]">
          {[0, 1, 2, 3].map((i) => (
            <Cell key={i} filterCss={filterCss} isDarkBg={isDarkBg} className="w-full" style={{ aspectRatio: stripRatio }}>
              {get(i)}
            </Cell>
          ))}
        </div>
      )}

      {layout === 'asymmetric' && (
        <div className="grid grid-cols-3 grid-rows-3 gap-[28px]">
          <Cell filterCss={filterCss} isDarkBg={isDarkBg} className="col-span-2 row-span-3">
            {get(0)}
          </Cell>
          <Cell filterCss={filterCss} isDarkBg={isDarkBg} className="aspect-square">
            {get(1)}
          </Cell>
          <Cell filterCss={filterCss} isDarkBg={isDarkBg} className="aspect-square">
            {get(2)}
          </Cell>
          <Cell filterCss={filterCss} isDarkBg={isDarkBg} className="aspect-square">
            {get(3)}
          </Cell>
        </div>
      )}

      {layout === 'grid' && (
        <div className="grid grid-cols-2 gap-[28px]">
          {[0, 1, 2, 3].map((i) => (
            <Cell key={i} filterCss={filterCss} isDarkBg={isDarkBg} className="aspect-square">
              {get(i)}
            </Cell>
          ))}
        </div>
      )}

      {layout === 'polaroid' && (
        <div className="flex flex-col gap-[28px]">
          <Cell filterCss={filterCss} isDarkBg={isDarkBg} className="aspect-square">
            {get(0)}
          </Cell>
          <div className="h-[90px]" />
        </div>
      )}

      {showLogo && (
        <p className={cn("text-center font-mono text-[18px] font-semibold tracking-widest uppercase", isDarkBg ? "text-white/55" : "text-black/55")}>
          SNAPORY · {new Date().getFullYear()}
        </p>
      )}
    </div>
  )
}