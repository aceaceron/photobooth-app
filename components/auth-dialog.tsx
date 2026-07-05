'use client'

import { Camera, Check, Loader2, LogOut, Mail, Sparkles, Lock } from 'lucide-react'
import { useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

type AuthDialogProps = {
  open: boolean
  onClose: () => void
}

export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { user } = useAuth()

  return (
    <Modal open={open} onClose={onClose} labelledBy="auth-title">
      {user ? (
        <ProfileForm onClose={onClose} />
      ) : (
        <AuthForm onClose={onClose} />
      )}
    </Modal>
  )
}

function AuthForm({ onClose }: { onClose: () => void }) {
  const { signIn, signUp, error, clearError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        const handle =
          username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '')
        await signUp(email, password, {
          username: handle,
          name: name.trim() || email.split('@')[0],
          emailConsent: consent,
        })
      } else {
        await signIn(email, password)
      }
      onClose()
    } catch {
      // error state is already surfaced via useAuth().error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </span>
        <h2 id="auth-title" className="text-xl font-semibold tracking-tight">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {mode === 'signup'
            ? 'Save your profile and hop into rooms with friends.'
            : 'Sign in to pick up where you left off.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Display name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ari Rivera"
              className="h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email address
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-xl border border-input bg-background/70 pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-11 w-full rounded-xl border border-input bg-background/70 pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </label>

        {mode === 'signup' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                consent
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background'
              }`}
            >
              {consent && <Check className="size-3.5" />}
            </span>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="sr-only"
            />
            <span className="text-muted-foreground">
              I consent to receive marketing and transactional emails from Snapory.
            </span>
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="h-11 w-full text-sm" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : mode === 'signup' ? (
            'Create account'
          ) : (
            'Sign in'
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            clearError()
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          }}
          className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {mode === 'signup'
            ? 'Already have an account? Sign in'
            : "New here? Create an account"}
        </button>
      </form>
    </div>
  )
}

function ProfileForm({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, uploadAvatar, signOut, error, clearError } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    clearError()
    try {
      await uploadAvatar(file)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    clearError()
    try {
      await updateProfile({ name, username })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch {
      // surfaced via error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div className="mb-5">
        <h2 id="auth-title" className="text-xl font-semibold tracking-tight">
          Your profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user.email}
        </p>
      </div>

      <div className="mb-5 flex items-center gap-4">
        <div className="relative">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar || '/placeholder.svg'}
              alt="Your profile"
              className="size-20 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary">
              {name.charAt(0).toUpperCase() || 'S'}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Upload profile picture"
            disabled={uploading}
            className="absolute -bottom-2 -right-2 flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="sr-only"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Profile picture</p>
          <p>PNG or JPG, stored in your private Supabase avatar bucket.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Username
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              @
            </span>
            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              className="h-11 w-full rounded-xl border border-input bg-background/70 pl-7 pr-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" size="lg" className="h-11 flex-1 text-sm" disabled={submitting}>
          {saved ? (
            <>
              <Check className="size-4" /> Saved
            </>
          ) : submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            'Save changes'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={async () => {
            await signOut()
            onClose()
          }}
          className="h-11 text-sm"
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </form>
  )
}
