# Snapory — Multiplayer Photobooth

Next.js (App Router) + TypeScript + Supabase + native WebRTC. UI/aesthetic is
untouched from the original v0 design — everything below is business logic,
state, and backend wiring.

## 1. Install

```bash
npm install
```

## 2. Supabase project

1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/schema.sql` (creates `profiles`, RLS
   policies, an `avatars` storage bucket, and a trigger that auto-creates a
   profile row on signup).
3. In **Authentication → Providers**, make sure Email is enabled. For local
   testing you can disable "Confirm email" so `signUp` logs the user in
   immediately; otherwise wire up an email template / confirmation redirect.
4. Copy `.env.local.example` to `.env.local` and fill in your project URL +
   anon key from **Project Settings → API**.

```bash
cp .env.local.example .env.local
```

## 3. Run

```bash
npm run dev
```

## Architecture notes

- **No `rooms` or `photos` tables.** Rooms are ephemeral Supabase Realtime
  channels keyed by a 6-character room code (`room:<CODE>`). Photostrips are
  composited entirely in the browser and downloaded via a Blob — nothing
  photo-related ever reaches Supabase or any server. See
  `lib/webrtc/use-room-connection.ts` and `components/edit-view.tsx`.
- **Signaling vs. media/data.** Supabase Realtime broadcast is used only for
  WebRTC SDP/ICE exchange, room presence, and the synchronized-countdown
  "plan" (start time + interval). Video, audio, and captured photo frames
  all travel peer-to-peer — frames specifically over an RTCDataChannel
  opened alongside each connection, never through Supabase.
- **Perfect negotiation.** Each mesh connection uses the standard
  polite/impolite pattern (politeness derived deterministically by
  comparing peer ids) to avoid offer/answer glare when up to 6 users join
  concurrently.
- **Synced countdown.** Whichever client presses the shutter broadcasts one
  message containing `{ totalShots, startAtEpochMs, intervalMs }`. Every
  peer — including the sender, via `broadcast: { self: true } — derives
  identical per-shot timings from those three numbers, instead of trusting
  independently-scheduled local timers that would drift.
- **TURN server.** Only public STUN servers are configured out of the box.
  Peers behind symmetric NATs / restrictive firewalls will fail to connect
  without a TURN relay — add one in `ICE_SERVERS` in
  `lib/webrtc/use-room-connection.ts` before shipping to production.
- **RLS.** `profiles` has `select`/`insert`/`update` policies scoped to
  `auth.uid() = id` and intentionally no policy exposing other users' rows.
  The `avatars` storage bucket is public-read but write-restricted to a
  user's own `{user_id}/` folder.
