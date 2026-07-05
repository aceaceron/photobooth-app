import { PhotoboothApp } from '@/components/photobooth-app'
import { isValidRoomCode, sanitizeRoomCode } from '@/lib/photobooth'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const clean = sanitizeRoomCode(code)

  // A malformed/truncated code still gets a working room — sanitizeRoomCode
  // already stripped anything outside our alphabet — but we flag it so the
  // UI can nudge the user to double check the link if it looks off.
  return (
    <PhotoboothApp
      initialRoomCode={clean}
      roomCodeLooksValid={isValidRoomCode(clean) && clean.length === 6}
    />
  )
}