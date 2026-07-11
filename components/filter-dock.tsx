'use client'

import { motion } from 'framer-motion'
import { Inter } from 'next/font/google'
import { FILTERS, type FilterId } from '@/lib/ar-filters'
import { cn } from '@/lib/utils'

// Scoped to the dock rather than swapping the app's global font (Geist) —
// keeps this new surface crisp and consistent in isolation without
// changing the rest of Snapory's established type system. To use Inter
// everywhere, swap the Geist import for this one in app/layout.tsx.
const inter = Inter({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-dock' })

type FilterDockProps = {
  active: FilterId
  onChange: (id: FilterId) => void
  disabled?: boolean
}

/**
 * Floating, centered filter dock. A single `motion.span` with a shared
 * `layoutId` slides between buttons as the active filter changes (Framer
 * Motion computes the FLIP transform automatically), and each icon
 * spring-scales up on selection.
 */
export function FilterDock({ active, onChange, disabled }: FilterDockProps) {
  return (
    <div className={cn(inter.className, 'flex w-full justify-center px-4')}>
      <div
        role="radiogroup"
        aria-label="AR filters"
        className={cn(
          'flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border/60 bg-card/80 p-1.5 shadow-xl shadow-foreground/10 backdrop-blur-xl transition-opacity',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          disabled && 'opacity-60',
        )}
      >
        {FILTERS.map((f) => {
          const isActive = f.id === active
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={f.name}
              disabled={disabled}
              onClick={() => onChange(f.id)}
              className="relative flex shrink-0 flex-col items-center gap-1 rounded-full px-2.5 py-1.5 text-center disabled:pointer-events-none"
            >
              {isActive && (
                <motion.span
                  layoutId="filter-dock-active-pill"
                  className="absolute inset-0 rounded-full bg-primary/10 ring-1 ring-primary/25"
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                />
              )}
              <motion.span
                initial={false}
                animate={{ scale: isActive ? 1.15 : 1, y: isActive ? -1 : 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                className={cn(
                  'relative z-10 flex size-8 items-center justify-center rounded-full text-base leading-none',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {f.emoji}
              </motion.span>
              <span
                className={cn(
                  'relative z-10 whitespace-nowrap text-[10.5px] font-medium leading-none tracking-tight',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {f.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}