'use client'

import { useEffect, useRef } from 'react'
import { drawFilter, type FilterId } from '@/lib/ar-filters'
import type { FaceTrackingResult } from '@/hooks/use-face-tracking'

type ArCameraCanvasProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  filterId: FilterId
  /** Latest tracking result, read once per animation frame — see use-face-tracking. */
  resultRef: React.RefObject<FaceTrackingResult>
  /** Mirror the drawn frame horizontally, matching a natural selfie view. */
  mirrored?: boolean
  className?: string
  /** Lets the parent read the live composited frame directly (for photo
   *  capture and for reuse as a recording source), without a second
   *  render pass. */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}

/**
 * The "master canvas": draws the raw video frame, mirrored, at native
 * resolution, then immediately draws the active AR filter on top of it —
 * in that order, every frame, via requestAnimationFrame.
 *
 * This canvas *is* the visible camera tile (the underlying <video> is
 * kept in the DOM but visually hidden, since it's still needed as the
 * live decode source `drawImage` reads from). Because the filter is
 * baked into real pixels here rather than a separate transparent
 * overlay, the exact same canvas can be:
 *   - shown on screen as the live preview,
 *   - read via `canvas.toDataURL()` to capture a filtered photo,
 *   - drawn (via `drawImage`) into the larger multi-participant
 *     recording canvas that `MediaRecorder`/`captureStream` records from.
 * The filter is only ever computed once per frame, no matter how many
 * of those three consume it.
 */
export function ArCameraCanvas({
  videoRef,
  filterId,
  resultRef,
  mirrored = true,
  className,
  canvasRef: externalCanvasRef,
}: ArCameraCanvasProps) {
  const innerRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    function loop() {
      const canvas = innerRef.current
      const video = videoRef.current
      const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null

      if (canvas && video && ctx && video.readyState >= 2) {
        const w = video.videoWidth || canvas.width || 1
        const h = video.videoHeight || canvas.height || 1
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }

        ctx.save()
        if (mirrored) {
          ctx.translate(w, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(video, 0, 0, w, h)
        ctx.restore()

        // Runs in un-mirrored canvas space (the transform above was
        // already undone by ctx.restore()) so text-based filters like
        // the VHS timestamp render right-reading, not backwards.
        if (filterId !== 'none') {
          drawFilter(ctx, filterId, {
            boxW: w,
            boxH: h,
            videoW: w,
            videoH: h,
            landmarks: resultRef.current.landmarks,
            faceDetected: resultRef.current.faceDetected,
            t: performance.now() / 1000,
          })
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [filterId, videoRef, resultRef, mirrored])

  function setRefs(node: HTMLCanvasElement | null) {
    innerRef.current = node
    if (externalCanvasRef) externalCanvasRef.current = node
  }

  return <canvas ref={setRefs} className={className} aria-hidden="true" />
}