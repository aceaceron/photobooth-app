'use client'

import {
  ArrowRight,
  Camera,
  Link2,
  Shield,
  Sparkles,
  User as UserIcon,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { User } from '@/lib/photobooth'

type LandingViewProps = {
  user: User | null
  onCreateRoom: () => void
  onSolo: () => void
  onJoin: (code: string) => void
}

export function LandingView({
  user,
  onCreateRoom,
  onSolo,
  onJoin,
}: LandingViewProps) {
  const [code, setCode] = useState('')

  return (
    <div className="relative overflow-hidden">
      {/* soft ambient accents */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-0 size-72 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-40 size-72 rounded-full bg-accent/40 blur-3xl"
      />

      <section className="relative mx-auto max-w-6xl px-4 pt-14 pb-6 sm:px-6 sm:pt-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-primary" />
            Photobooth for you and up to 5 friends
          </span>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Strike a pose,{' '}
            <span className="text-primary">together</span>, from anywhere.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            {user ? `Welcome back, ${user.name}. ` : ''}
            Create a room, sync your countdowns, and print instant photostrips
            with friends across the world. Everything stays in your browser.
          </p>
        </div>

        {/* Action cards */}
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          <ActionCard
            featured
            icon={<Users className="size-5" />}
            title="Create a Room"
            description="Host a multiplayer session and invite up to 5 friends with a shareable link."
            action={
              <Button size="lg" className="h-11 w-full" onClick={onCreateRoom}>
                Create a room <ArrowRight className="size-4" />
              </Button>
            }
          />

          <ActionCard
            icon={<Link2 className="size-5" />}
            title="Join via Link"
            description="Got an invite code from a friend? Punch it in and jump straight into the booth."
            action={
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  onJoin(code.trim() || 'SNAP42')
                }}
                className="flex w-full flex-col gap-2"
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter room code"
                  aria-label="Room code"
                  className="h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-center font-mono text-sm tracking-widest outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  className="h-11 w-full"
                >
                  Join room
                </Button>
              </form>
            }
          />

          <ActionCard
            icon={<UserIcon className="size-5" />}
            title="Solo Photoshoot"
            description="Just you and the camera. Perfect for profile pics, selfies and quick strips."
            action={
              <Button
                variant="outline"
                size="lg"
                className="h-11 w-full"
                onClick={onSolo}
              >
                Start solo <Camera className="size-4" />
              </Button>
            }
          />
        </div>

        {/* trust row */}
        <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card/50 px-4 py-3 text-center text-sm text-muted-foreground backdrop-blur">
          <Shield className="size-4 shrink-0 text-primary" />
          <span className="text-pretty">
            <strong className="font-medium text-foreground">
              100% private:
            </strong>{' '}
            photos are processed locally and never saved to our databases.
          </span>
        </div>
      </section>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  description,
  action,
  featured,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action: React.ReactNode
  featured?: boolean
}) {
  return (
    <div
      className={`flex flex-col rounded-3xl border p-6 backdrop-blur transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-foreground/5 ${
        featured
          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border/60 bg-card/50'
      }`}
    >
      <span
        className={`mb-4 flex size-11 items-center justify-center rounded-2xl ${
          featured
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {icon}
      </span>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm text-muted-foreground text-pretty">
        {description}
      </p>
      <div className="mt-5">{action}</div>
    </div>
  )
}
