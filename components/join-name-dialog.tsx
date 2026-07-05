'use client'

import { ArrowRight, Users } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'

type JoinNameDialogProps = {
  open: boolean
  roomCode: string
  defaultName: string
  onSubmit: (name: string) => void
}

export function JoinNameDialog({
  open,
  roomCode,
  defaultName,
  onSubmit,
}: JoinNameDialogProps) {
  const [name, setName] = useState(defaultName)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(name.trim() || defaultName)
  }

  return (
    <Modal
      open={open}
      // Dismissing without a name still works fine — falls back to the
      // unique auto-generated guest name rather than blocking entry.
      onClose={() => onSubmit(defaultName)}
      labelledBy="join-title"
    >
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Users className="size-6" />
        </span>
        <h2 id="join-title" className="text-xl font-semibold tracking-tight">
          Joining room /r/{roomCode}
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
          What should we call you? This is just for this session — sign in
          instead if you want it saved for next time.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Display name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
            maxLength={24}
            className="h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <Button type="submit" size="lg" className="h-11 w-full text-sm">
          Continue <ArrowRight className="size-4" />
        </Button>
      </form>
    </Modal>
  )
}