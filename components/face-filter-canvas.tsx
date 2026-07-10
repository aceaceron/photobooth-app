'use client'

import { useEffect, useRef } from 'react'
import { drawFilter, type FilterId } from '@/lib/ar-filters'
import type { FaceTrackingResult } from '@/hooks/use-face-tracking'

type FaceFilterCanvasProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  filterId: FilterId
  active: boolean
  /** Latest tracking result, read once per animation frame — see use-face-tracking. */
  resultRef: React.RefObject<FaceTrackingResult>
  className?: string
}

/**
 * Transparent canvas, absolutely positioned over the mirrored <video>
 * element it decorates. Runs its own requestAnimationFrame loop so filter
 * animation (floating hearts, the blinking REC dot, etc.) keeps moving
 * smoothly independent of React's render cycle.
 */
export function FaceFilterCanvas({ videoRef, filterId, active, resultRef, className }: FaceFilterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!active || filterId === 'none') {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    function loop() {
      const canvas = canvasRef.current
      const video = videoRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      const box = canvas.parentElement?.getBoundingClientRect()
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      const boxW = box?.width || canvas.clientWidth || 1
      const boxH = box?.height || canvas.clientHeight || 1
      const pxW = Math.round(boxW * dpr)
      const pxH = Math.round(boxH * dpr)
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW
        canvas.height = pxH
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, boxW, boxH)

      if (video && video.readyState >= 2) {
        drawFilter(ctx, filterId, {
          boxW,
          boxH,
          videoW: video.videoWidth || boxW,
          videoH: video.videoHeight || boxH,
          landmarks: resultRef.current.landmarks,
          faceDetected: resultRef.current.faceDetected,
          t: performance.now() / 1000,
        })
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, filterId, videoRef, resultRef])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}