'use client'

import { FILTERS, type FilterId } from '@/lib/ar-filters'
import { cn } from '@/lib/utils'

type FilterMenuProps = {
  active: FilterId
  onChange: (id: FilterId) => void
  disabled?: boolean
}

export function FilterMenu({ active, onChange, disabled }: FilterMenuProps) {
  return (
    <div
      className="flex w-full snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="radiogroup"
      aria-label="AR filters"
    >
      {FILTERS.map((f) => {
        const isActive = f.id === active
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(f.id)}
            className={cn(
              'flex shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 transition-all duration-200 ease-out',
              isActive
                ? 'scale-[1.03] border-primary bg-primary/10 ring-1 ring-primary/30'
                : 'border-border/60 bg-card/50 hover:border-primary/30 hover:bg-muted',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-full text-lg transition-all duration-200',
                isActive ? 'scale-110 bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {f.emoji}
            </span>
            <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">{f.name}</span>
          </button>
        )
      })}
    </div>
  )
}