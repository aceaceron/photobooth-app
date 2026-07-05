'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { logEvent } from '@/lib/debug-log'

export const MAX_PEERS = 6

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export type PeerMeta = { name: string; color: string }

export type RemotePeer = {
  peerId: string
  meta: PeerMeta
  stream: MediaStream | null
  connectionState: RTCPeerConnectionState
}

export type FrameMessage = {
  type: 'frame'
  shotIndex: number
  dataUrl: string
}

export type CountdownMessage = {
  instigatorId: string 
  totalShots: number
  delayMs: number
  intervalMs: number
  layoutId: string
  backgroundId: string 
}

type SignalPayload = {
  from: string
  to: string
  kind: 'offer' | 'answer' | 'ice-candidate'
  data: RTCSessionDescriptionInit | RTCIceCandidateInit
}

type PeerHandle = {
  pc: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  makingOffer: boolean
  polite: boolean
}

type UseRoomConnectionArgs = {
  roomCode: string
  localMeta: PeerMeta
  localStream: MediaStream | null
  enabled: boolean
  onFrame?: (peerId: string, msg: FrameMessage) => void
  onCountdown?: (msg: CountdownMessage) => void
  onChat?: (msg: { sender: string, text: string, isAction?: boolean }) => void
  onSyncFilters?: (filters: any) => void
  onSyncTemplate?: (layoutId: string, background: any) => void
  onFinalize?: () => void
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function useRoomConnection({
  roomCode,
  localMeta,
  localStream,
  enabled,
  onFrame,
  onCountdown,
  onChat,
  onSyncFilters,
  onSyncTemplate,
  onFinalize
}: UseRoomConnectionArgs) {
  const supabase = useMemoClient()
  const [peerId] = useState(() => generateUUID())
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map())
  const [full, setFull] = useState(false)
  const [channelStatus, setChannelStatus] = useState<
    'idle' | 'connecting' | 'subscribed' | 'error' | 'closed' | 'timed_out'
  >('idle')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const peersRef = useRef<Map<string, PeerHandle>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(localStream)
  
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const onFrameRef = useRef(onFrame)
  const onCountdownRef = useRef(onCountdown)
  const onChatRef = useRef(onChat)
  const onSyncFiltersRef = useRef(onSyncFilters)
  const onSyncTemplateRef = useRef(onSyncTemplate)
  const onFinalizeRef = useRef(onFinalize)

  onFrameRef.current = onFrame
  onCountdownRef.current = onCountdown
  onChatRef.current = onChat
  onSyncFiltersRef.current = onSyncFilters
  onSyncTemplateRef.current = onSyncTemplate
  onFinalizeRef.current = onFinalize
  localStreamRef.current = localStream

  const MAX_RETRIES = 4

  const updateRemote = useCallback(
    (id: string, patch: Partial<RemotePeer>) => {
      setRemotePeers((prev) => {
        const next = new Map(prev)
        const existing = next.get(id)
        if (!existing) return next
        next.set(id, { ...existing, ...patch })
        return next
      })
    },
    [],
  )

  const sendSignal = useCallback(
    (to: string, kind: SignalPayload['kind'], data: SignalPayload['data']) => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'rtc-signal',
        payload: { from: peerId, to, kind, data } satisfies SignalPayload,
      })
    },
    [peerId],
  )

  const attachDataChannel = useCallback(
    (id: string, dc: RTCDataChannel) => {
      dc.onopen = () => logEvent('webrtc', `data channel open with ${id.slice(0, 8)}`)
      dc.onclose = () => logEvent('webrtc', `data channel closed with ${id.slice(0, 8)}`, undefined, 'warn')
      dc.onerror = (ev) => logEvent('webrtc', `data channel error with ${id.slice(0, 8)}`, ev, 'error')
      dc.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'frame') onFrameRef.current?.(id, msg)
          else if (msg.type === 'chat') onChatRef.current?.(msg)
          else if (msg.type === 'sync_filters') onSyncFiltersRef.current?.(msg.filters)
          else if (msg.type === 'sync_template') onSyncTemplateRef.current?.(msg.layoutId, msg.background)
          else if (msg.type === 'finalize') onFinalizeRef.current?.()
        } catch {}
      }
      const handle = peersRef.current.get(id)
      if (handle) handle.dataChannel = dc
    },
    [],
  )

  const createPeer = useCallback(
    (id: string, meta: PeerMeta) => {
      if (peersRef.current.has(id)) return
      const polite = peerId < id

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const handle: PeerHandle = { pc, dataChannel: null, makingOffer: false, polite }
      peersRef.current.set(id, handle)

      setRemotePeers((prev) => {
        const next = new Map(prev)
        next.set(id, { peerId: id, meta, stream: null, connectionState: 'new' })
        return next
      })

      localStreamRef.current
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current!))

      if (!polite) {
        const dc = pc.createDataChannel('photobooth')
        attachDataChannel(id, dc)
      }
      pc.ondatachannel = (ev) => attachDataChannel(id, ev.channel)

      pc.onnegotiationneeded = async () => {
        try {
          handle.makingOffer = true
          await pc.setLocalDescription()
          if (pc.localDescription) {
            sendSignal(id, 'offer', pc.localDescription)
          }
        } catch (err) {
          console.error('negotiation error', err)
        } finally {
          handle.makingOffer = false
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal(id, 'ice-candidate', ev.candidate.toJSON())
      }

      pc.ontrack = (ev) => {
        updateRemote(id, { stream: ev.streams[0] ?? null })
      }

      pc.onconnectionstatechange = () => {
        logEvent('webrtc', `peer ${id.slice(0, 8)} connection: ${pc.connectionState}`)
        updateRemote(id, { connectionState: pc.connectionState })
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          destroyPeer(id)
        }
      }

      pc.oniceconnectionstatechange = () => {
        logEvent('webrtc', `peer ${id.slice(0, 8)} ICE: ${pc.iceConnectionState}`)
      }

      return handle
    },
    [peerId, sendSignal, updateRemote, attachDataChannel],
  )

  const destroyPeer = useCallback((id: string) => {
    const handle = peersRef.current.get(id)
    if (handle) {
      handle.dataChannel?.close()
      handle.pc.close()
      peersRef.current.delete(id)
    }
    setRemotePeers((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (payload.to !== peerId) return
      const id = payload.from
      let handle = peersRef.current.get(id)
      if (!handle) {
        handle = createPeer(id, { name: 'Guest', color: '#999' })
      }
      if (!handle) return
      const { pc, polite } = handle

      try {
        if (payload.kind === 'offer') {
          const offerCollision =
            handle.makingOffer || pc.signalingState !== 'stable'
          const ignoreOffer = !polite && offerCollision
          if (ignoreOffer) return

          await pc.setRemoteDescription(
            payload.data as RTCSessionDescriptionInit,
          )
          await pc.setLocalDescription()
          if (pc.localDescription) {
            sendSignal(id, 'answer', pc.localDescription)
          }
        } else if (payload.kind === 'answer') {
          await pc.setRemoteDescription(
            payload.data as RTCSessionDescriptionInit,
          )
        } else if (payload.kind === 'ice-candidate') {
          try {
            await pc.addIceCandidate(payload.data as RTCIceCandidateInit)
          } catch (err) {}
        }
      } catch (err) {
        console.error('signal handling error', err)
      }
    },
    [peerId, createPeer, sendSignal],
  )

  useEffect(() => {
    if (!enabled || !roomCode) return
    setChannelStatus('connecting')
    logEvent('realtime', `connecting to room:${roomCode}`)

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { presence: { key: peerId }, broadcast: { self: true } },
    })
    channelRef.current = channel

    channel.on('broadcast', { event: 'rtc-signal' }, ({ payload }) =>
      handleSignal(payload as SignalPayload),
    )

    channel.on('broadcast', { event: 'countdown' }, ({ payload }) =>
      onCountdownRef.current?.(payload as CountdownMessage),
    )

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PeerMeta & { peerId: string }>()
      const ids = Object.keys(state).filter((id) => id !== peerId)
      logEvent('realtime', `presence sync: ${ids.length} other peer(s)`, ids)
      setFull(ids.length + 1 >= MAX_PEERS)

      ids.forEach((id) => {
        if (!peersRef.current.has(id)) {
          const entry = state[id]?.[0]
          createPeer(id, { name: entry?.name ?? 'Guest', color: entry?.color ?? '#999' })
        }
      })
      Array.from(peersRef.current.keys()).forEach((id) => {
        if (!ids.includes(id)) destroyPeer(id)
      })
    })

    channel.subscribe(async (status, err) => {
      logEvent(
        'realtime',
        `channel status: ${status}`,
        err?.message,
        status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'warn' : 'info',
      )
      if (status === 'SUBSCRIBED') {
        setChannelStatus('subscribed')
        setReconnectAttempt(0)
        await channel.track({ peerId, ...localMeta })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setChannelStatus(status === 'CHANNEL_ERROR' ? 'error' : 'timed_out')
        setReconnectAttempt((n) => {
          const attempt = n + 1
          if (attempt > MAX_RETRIES) {
            logEvent(
              'realtime',
              `giving up after ${MAX_RETRIES} reconnect attempts`,
              undefined,
              'warn',
            )
            return n
          }
          const delayMs = Math.min(1500 * 2 ** (attempt - 1), 12000)
          logEvent('realtime', `reconnecting in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`)
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(() => {
            setRetryTrigger((t) => t + 1)
          }, delayMs)
          return attempt
        })
      } else if (status === 'CLOSED') {
        setChannelStatus('closed')
      }
    })

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      peersRef.current.forEach((_, id) => destroyPeer(id))
      channel.unsubscribe()
      channelRef.current = null
      setChannelStatus('closed')
    }
  }, [enabled, roomCode, peerId, retryTrigger])

  const broadcastCountdown = useCallback((msg: CountdownMessage) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'countdown',
      payload: msg,
    })
  }, [])

  const broadcastData = useCallback((msg: any) => {
    const payload = JSON.stringify(msg)
    peersRef.current.forEach((handle) => {
      if (handle.dataChannel?.readyState === 'open') {
        handle.dataChannel.send(payload)
      }
    })
  }, [])

  const sendFrameToAll = useCallback((shotIndex: number, dataUrl: string) => {
    broadcastData({ type: 'frame', shotIndex, dataUrl })
  }, [broadcastData])

  const setMicEnabled = useCallback((on: boolean) => {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = on))
  }, [])

  return {
    peerId,
    remotePeers,
    roomFull: full,
    channelStatus,
    reconnectAttempt,
    broadcastCountdown,
    sendFrameToAll,
    broadcastData,
    setMicEnabled,
  }
}

function useMemoClient() {
  const ref = useRef<ReturnType<typeof createClient> | null>(null)
  if (!ref.current) ref.current = createClient()
  return ref.current
}