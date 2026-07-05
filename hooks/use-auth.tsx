'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { logEvent } from '@/lib/debug-log'
import type { User } from '@/lib/photobooth'

type Profile = {
  id: string
  name: string
  username: string
  avatar_url: string | null
  email_consent: boolean
}

type AuthContextValue = {
  user: User | null
  loading: boolean
  error: string | null
  signUp: (
    email: string,
    password: string,
    opts: { username: string; name: string; emailConsent: boolean },
  ) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: {
    name?: string
    username?: string
    emailConsent?: boolean
  }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function profileToUser(email: string, p: Profile): User {
  return {
    email,
    name: p.name,
    username: p.username,
    avatar: p.avatar_url,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(
    async (userId: string, email: string) => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, email_consent')
        .eq('id', userId)
        .single()

      if (profileError) {
        // The row is created by a DB trigger on signup; if it hasn't landed
        // yet (race on first sign-in), fall back to a minimal user object.
        setUser({ email, name: email.split('@')[0], username: '', avatar: null })
        return
      }
      setUser(profileToUser(email, data as Profile))
    },
    [supabase],
  )

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        loadProfile(session.user.id, session.user.email ?? '').finally(() =>
          setLoading(false),
        )
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id, session.user.email ?? '')
      } else {
        setUser(null)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabase, loadProfile])

  const clearError = useCallback(() => setError(null), [])

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password, { username, name, emailConsent }) => {
      setError(null)
      logEvent('auth', `signUp: ${email} from origin ${window.location.origin}`)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // If "Confirm email" is on in the Supabase dashboard, the
          // confirmation link otherwise falls back to whatever "Site URL"
          // is configured there — which breaks when testing from a LAN IP
          // or a tunnel. Using the real origin the request came from means
          // it always points back to wherever the user actually is, as
          // long as that origin is also added to Authentication -> URL
          // Configuration -> Redirect URLs in the Supabase dashboard.
          emailRedirectTo: window.location.origin,
        },
      })
      if (signUpError) {
        logEvent('auth', `signUp failed: ${signUpError.message}`, undefined, 'error')
        setError(signUpError.message)
        throw signUpError
      }
      if (!data.user) return

      // The trigger already inserted a default row; patch it with the
      // details the user entered on the sign-up form.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ name, username, email_consent: emailConsent })
        .eq('id', data.user.id)

      if (updateError) {
        // Likely a username collision — surface it, but auth already
        // succeeded so we don't roll that back.
        setError(updateError.message)
      }
    },
    [supabase],
  )

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      setError(null)
      logEvent('auth', `signIn: ${email}`)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        logEvent('auth', `signIn failed: ${signInError.message}`, undefined, 'error')
        setError(signInError.message)
        throw signInError
      }
      logEvent('auth', 'signIn succeeded')
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [supabase])

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (patch) => {
      setError(null)
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) return

      const dbPatch: Record<string, unknown> = {}
      if (patch.name !== undefined) dbPatch.name = patch.name
      if (patch.username !== undefined) dbPatch.username = patch.username
      if (patch.emailConsent !== undefined)
        dbPatch.email_consent = patch.emailConsent

      const { error: updateError } = await supabase
        .from('profiles')
        .update(dbPatch)
        .eq('id', authUser.id)

      if (updateError) {
        setError(updateError.message)
        throw updateError
      }
      await loadProfile(authUser.id, authUser.email ?? '')
    },
    [supabase, loadProfile],
  )

  const uploadAvatar = useCallback(
    async (file: File) => {
      setError(null)
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) return

      const ext = file.name.split('.').pop() || 'png'
      const path = `${authUser.id}/avatar-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) {
        setError(uploadError.message)
        throw uploadError
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', authUser.id)

      if (updateError) {
        setError(updateError.message)
        throw updateError
      }
      await loadProfile(authUser.id, authUser.email ?? '')
    },
    [supabase, loadProfile],
  )

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    updateProfile,
    uploadAvatar,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}