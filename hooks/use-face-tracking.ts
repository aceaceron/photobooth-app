'use client'

import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@/lib/ar-filters'
import { logEvent } from '@/lib/debug-log'

export type FaceTrackingResult = {
  landmarks: NormalizedLandmark[] | null
  faceDetected: boolean
}

// Loaded once per tab and reused across mount/unmount so switching filters
// on and off doesn't re-download the ~10MB model each time.
let sharedLandmarkerPromise: Promise<any> | null = null

async function getLandmarker() {
  if (!sharedLandmarkerPromise) {
    sharedLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
      )
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    })().catch((err) => {
      sharedLandmarkerPromise = null // allow retry on next mount
      throw err
    })
  }
  return sharedLandmarkerPromise
}

/**
 * Runs MediaPipe FaceLandmarker against a live <video> element and keeps a
 * ref (not state) updated every animation frame with the latest landmarks.
 * A ref is used instead of state so the 30-60fps detection loop doesn't
 * force a React re-render on every tick — consumers (the AR canvas, and
 * the photo-capture routine) just read `resultRef.current` when they need
 * it, which is exactly how a `requestAnimationFrame` render loop should
 * consume fast-changing data in React.
 */
export function useFaceTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<FaceTrackingResult>({ landmarks: null, faceDetected: false })
  const landmarkerRef = useRef<any>(null)
  const rafRef = useRef<number>(0)
  const lastVideoTimeRef = useRef(-1)

  useEffect(() => {
    if (!enabled) {
      setReady(false)
      return
    }
    let cancelled = false

    getLandmarker()
      .then((landmarker) => {
        if (cancelled) return
        landmarkerRef.current = landmarker
        setReady(true)
        logEvent('ar-filters', 'face landmarker ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError('Could not load face tracking. Try a filter that doesn’t need it.')
        logEvent('ar-filters', 'face landmarker failed to load', String(err), 'error')
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!ready || !enabled) return

    function loop() {
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (video && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime
        try {
          const result = landmarker.detectForVideo(video, performance.now())
          if (result?.faceLandmarks?.length) {
            resultRef.current = { landmarks: result.faceLandmarks[0], faceDetected: true }
          } else {
            resultRef.current = { landmarks: null, faceDetected: false }
          }
        } catch {
          // A dropped frame here just means we keep the last known pose
          // for one more tick — not worth surfacing as an error.
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, enabled, videoRef])

  // Detection keeps running against a live video element even while a
  // consumer isn't mounted; only tear down landmarks when disabled.
  useEffect(() => {
    if (!enabled) resultRef.current = { landmarks: null, faceDetected: false }
  }, [enabled])

  return { resultRef, ready, error }
}