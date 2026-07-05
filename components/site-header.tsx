'use client'

import { Aperture, Moon, Sun, User as UserIcon } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'
import type { User } from '@/lib/photobooth'
import { Button } from '@/components/ui/button'

type SiteHeaderProps = {
  user: User | null
  onProfileClick: () => void
  onHome: () => void
}

export function SiteHeader({ user, onProfileClick, onHome }: SiteHeaderProps) {
  const { theme, toggleTheme, mounted } = useTheme()

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <Aperture className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Snapory</span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="rounded-full"
          >
            {mounted && theme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>

          <button
            type="button"
            onClick={onProfileClick}
            className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar || '/placeholder.svg'}
                alt=""
                className="size-7 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserIcon className="size-4" />
              </span>
            )}
            <span className="hidden sm:inline">
              {user ? user.name.split(' ')[0] || 'Profile' : 'Sign in'}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
