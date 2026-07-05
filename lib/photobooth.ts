import type { CSSProperties } from 'react'
import { customAlphabet } from 'nanoid'

export type AppView = 'landing' | 'setup' | 'booth' | 'edit'

// Unambiguous uppercase alphabet (no 0/O/1/I) for room codes people have to
// read aloud or type from a link.
const nanoRoomCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6)
export function generateRoomCode(): string {
  return nanoRoomCode()
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{1,6}$/

/**
 * Room codes are short nanoid strings over a fixed alphabet, NOT UUIDs —
 * there is no `rooms` table to validate against (see supabase/schema.sql).
 * This strips anything outside that alphabet and caps length, so a mangled
 * or hand-typed URL segment degrades gracefully instead of being passed
 * through uncomprehendingly (e.g. as a channel name with stray characters).
 */
export function sanitizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => ROOM_CODE_CHARS.includes(c))
    .slice(0, 6)
    .join('')
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code)
}

/** One captured photo from one participant for one shot in the sequence. */
export type CapturedFrame = {
  shotIndex: number
  participantId: string
  dataUrl: string
}

export type LayoutId = 'strip' | 'asymmetric' | 'grid' | 'polaroid'

export type LayoutOption = {
  id: LayoutId
  name: string
  description: string
  shots: number
}

export const LAYOUTS: LayoutOption[] = [
  {
    id: 'strip',
    name: 'Classic Strip',
    description: '1 column × 4 rows',
    shots: 4,
  },
  {
    id: 'asymmetric',
    name: 'Asymmetric',
    description: '1 large + 3 small',
    shots: 4,
  },
  {
    id: 'grid',
    name: '2 × 2 Grid',
    description: 'Square format',
    shots: 4,
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    description: 'Single with caption',
    shots: 1,
  },
]

export type BackgroundOption = {
  id: string
  name: string
  className: string
  swatch: string
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: 'blush', name: 'Blush', className: 'bg-[#f7d9d4]', swatch: '#f7d9d4' },
  { id: 'coral', name: 'Coral', className: 'bg-[#f26b5e]', swatch: '#f26b5e' },
  { id: 'butter', name: 'Butter', className: 'bg-[#f6e2a8]', swatch: '#f6e2a8' },
  { id: 'mint', name: 'Mint', className: 'bg-[#b8e6d4]', swatch: '#b8e6d4' },
  { id: 'sky', name: 'Sky', className: 'bg-[#bcd8f2]', swatch: '#bcd8f2' },
  { id: 'ink', name: 'Ink', className: 'bg-[#2b2831]', swatch: '#2b2831' },
  {
    id: 'sunset',
    name: 'Sunset',
    className: 'bg-gradient-to-br from-[#f7b267] to-[#f25f5c]',
    swatch: 'linear-gradient(135deg,#f7b267,#f25f5c)',
  },
  {
    id: 'dots',
    name: 'Confetti',
    className:
      'bg-[#fdf3ec] bg-[radial-gradient(circle,#f26b5e_1.5px,transparent_1.5px)] bg-[length:14px_14px]',
    swatch: 'radial-gradient(circle,#f26b5e 30%,#fdf3ec 30%)',
  },
]

export function backgroundStyle(
  bg: BackgroundOption,
): CSSProperties | undefined {
  if (bg.id === 'custom') {
    return {
      backgroundImage: `url(${bg.swatch})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return undefined
}

export type FilterState = {
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  vintage: boolean
  bw: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  vintage: false,
  bw: false,
}

export function filterToCss(f: FilterState): string {
  const parts = [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.bw ? 0 : f.saturation}%)`,
  ]
  if (f.warmth !== 0) {
    parts.push(`sepia(${Math.max(0, f.warmth)}%)`)
    parts.push(`hue-rotate(${f.warmth < 0 ? f.warmth : 0}deg)`)
  }
  if (f.vintage) {
    parts.push('sepia(35%)', 'contrast(110%)')
  }
  if (f.bw) {
    parts.push('grayscale(100%)')
  }
  return parts.join(' ')
}

export type Participant = {
  /** peerId for remote participants, or 'you' for the local user. */
  id: string
  name: string
  isYou?: boolean
  color: string
}

const PALETTE = [
  'oklch(0.65 0.21 12)',
  'oklch(0.7 0.13 195)',
  'oklch(0.75 0.15 60)',
  'oklch(0.6 0.14 300)',
  'oklch(0.6 0.16 340)',
  'oklch(0.68 0.14 150)',
]

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length]
}

/** Deterministic color per peer id, so everyone in a room agrees on colors
 * without needing to coordinate over the network. */
export function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  return colorForIndex(Math.abs(hash))
}

export type User = {
  email: string
  name: string
  username: string
  avatar: string | null
}