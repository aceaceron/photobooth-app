/**
 * Procedural AR filter rendering.
 *
 * Every filter is drawn with plain Canvas 2D primitives (and, for the
 * pixel-manipulation filters, raw ImageData) rather than external
 * PNG/SVG assets — there are no bundled image files to ship or license,
 * and it keeps the whole pipeline in one place, in real units derived
 * straight from the face landmarks.
 *
 * Architecture: `drawFilter` is always called on a "master canvas" that
 * the *video frame has already been drawn onto* (see
 * components/ar-camera-canvas.tsx) — never on a bare transparent
 * overlay. That's what lets the pixel filters (Glitch, Sketch) read back
 * real camera pixels via `ctx.canvas`, and it means this exact canvas
 * can be reused directly as the MediaRecorder / composited-recording
 * source, so filters only ever get computed once per frame no matter
 * how many places the result is displayed or recorded.
 *
 * Coordinate handling: MediaPipe's FaceLandmarker returns landmarks
 * normalized to the *raw* (unmirrored) video frame. The master canvas
 * draws the video pre-mirrored (to match a natural selfie view), so
 * `mapPoint` below reproduces that same mirroring — plus an
 * `object-cover`-style crop when `boxW/boxH` differ from `videoW/videoH`
 * — so landmark-anchored shapes line up with what's actually visible.
 */

export type FilterId =
  | 'none'
  | 'dog'
  | 'hearts'
  | 'thug'
  | 'floral'
  | 'cyberpunk'
  | 'halo'
  | 'glitch'
  | 'sketch'
  | 'timestamp'

export type FilterDef = {
  id: FilterId
  name: string
  emoji: string
  /** Whether this filter needs live face landmarks, or is a static overlay. */
  needsFaceTracking: boolean
}

export const FILTERS: FilterDef[] = [
  { id: 'none', name: 'None', emoji: '✨', needsFaceTracking: false },
  { id: 'dog', name: 'Puppy', emoji: '🐶', needsFaceTracking: true },
  { id: 'hearts', name: 'Hearts', emoji: '💕', needsFaceTracking: true },
  { id: 'thug', name: 'Thug Life', emoji: '😎', needsFaceTracking: true },
  { id: 'floral', name: 'Floral Crown', emoji: '🌸', needsFaceTracking: true },
  { id: 'cyberpunk', name: 'Cyberpunk', emoji: '🤖', needsFaceTracking: true },
  { id: 'halo', name: 'Angelic', emoji: '😇', needsFaceTracking: true },
  { id: 'glitch', name: 'Glitch', emoji: '📺', needsFaceTracking: false },
  { id: 'sketch', name: 'Sketch', emoji: '✏️', needsFaceTracking: false },
  { id: 'timestamp', name: 'VHS', emoji: '📼', needsFaceTracking: false },
]

export type NormalizedLandmark = { x: number; y: number; z?: number }

export type FrameContext = {
  /** CSS size (px) of the box the canvas is drawn into. */
  boxW: number
  boxH: number
  /** Native resolution (px) of the source video frame the landmarks came from. */
  videoW: number
  videoH: number
  landmarks: NormalizedLandmark[] | null
  faceDetected: boolean
  /** Seconds, monotonically increasing — used to animate idle filters. */
  t: number
}

// A handful of the 468 MediaPipe Face Mesh landmark indices we need.
const LM = {
  foreheadTop: 10,
  chin: 152,
  cheekLeft: 234,
  cheekRight: 454,
  noseTip: 1,
  noseBridge: 168,
  eyeLeftOuter: 33,
  eyeLeftInner: 133,
  eyeRightInner: 362,
  eyeRightOuter: 263,
  mouthLeft: 61,
  mouthRight: 291,
  browLeft: 105,
  browRight: 334,
} as const

type Point = { x: number; y: number }

function mapPoint(lm: NormalizedLandmark, frame: FrameContext): Point {
  const scale = Math.max(frame.boxW / frame.videoW, frame.boxH / frame.videoH)
  const dispW = frame.videoW * scale
  const dispH = frame.videoH * scale
  const offX = (frame.boxW - dispW) / 2
  const offY = (frame.boxH - dispH) / 2
  const px = offX + lm.x * dispW
  const py = offY + lm.y * dispH
  return { x: frame.boxW - px, y: py } // mirrored to match the selfie view
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Angle (radians) of the line from `a` to `b`, normalized so the
 * reference vector always points screen-rightward (dx >= 0).
 *
 * Why this is needed: mapPoint() mirrors landmarks by flipping X, and a
 * flip is a *reflection*, not a rotation — it inverts handedness. That
 * means naively trusting which raw MediaPipe landmark is "left" vs
 * "right" (e.g. cheekLeft/cheekRight) for a direction vector can land
 * you close to 180° out depending on the model's internal indexing,
 * silently flipping "up" into "down" for anything anchored via
 * cos(angle)/sin(angle) offsets — which is exactly why the halo used to
 * render down near the nose instead of above the head. Forcing dx >= 0
 * removes that spurious ~180° ambiguity while preserving the real head
 * tilt (negating both dx and dy rotates the angle by exactly ±π, which
 * cancels out an erroneous π offset but leaves a genuine small tilt
 * angle unchanged).
 */
function faceAngle(a: Point, b: Point): number {
  let dx = b.x - a.x
  let dy = b.y - a.y
  if (dx < 0) {
    dx = -dx
    dy = -dy
  }
  return Math.atan2(dy, dx)
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Main entry point: draws `filterId` for the current frame onto `ctx`. */
export function drawFilter(
  ctx: CanvasRenderingContext2D,
  filterId: FilterId,
  frame: FrameContext,
) {
  if (filterId === 'none') return

  // Static / whole-frame filters that don't need a detected face.
  if (filterId === 'timestamp') {
    drawVintageTimestamp(ctx, frame)
    return
  }
  if (filterId === 'glitch') {
    applyChromaticAberration(ctx, frame)
    return
  }
  if (filterId === 'sketch') {
    applyPencilSketch(ctx, frame)
    return
  }

  if (!frame.faceDetected || !frame.landmarks) return

  switch (filterId) {
    case 'dog':
      drawDogFilter(ctx, frame)
      break
    case 'hearts':
      drawFloatingHearts(ctx, frame)
      break
    case 'thug':
      drawThugGlasses(ctx, frame)
      break
    case 'floral':
      drawFloralCrown(ctx, frame)
      break
    case 'cyberpunk':
      drawCyberpunkVisor(ctx, frame)
      break
    case 'halo':
      drawAngelicHalo(ctx, frame)
      break
  }
}

// ---------------------------------------------------------------------
// 1. Classic Dog — ears pinned to the top of the head, nose on the tip
// ---------------------------------------------------------------------
function drawDogFilter(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const lm = frame.landmarks!
  const p = (i: number) => mapPoint(lm[i], frame)

  const forehead = p(LM.foreheadTop)
  const chin = p(LM.chin)
  const cheekL = p(LM.cheekLeft)
  const cheekR = p(LM.cheekRight)
  const nose = p(LM.noseTip)

  const faceW = dist(cheekL, cheekR)
  const faceH = dist(forehead, chin)
  const angle = faceAngle(cheekL, cheekR)

  // Ears: floppy ovals anchored above each temple, rotated outward.
  const earSize = faceW * 0.42
  ;[-1, 1].forEach((side) => {
    const ex = forehead.x + Math.cos(angle) * side * faceW * 0.38 + Math.sin(angle) * faceH * 0.18
    const ey = forehead.y + Math.sin(angle) * side * faceW * 0.38 - Math.cos(angle) * faceH * 0.18
    ctx.save()
    ctx.translate(ex, ey)
    ctx.rotate(angle + side * 0.4)
    const grad = ctx.createLinearGradient(-earSize * 0.3, -earSize * 0.5, earSize * 0.3, earSize * 0.5)
    grad.addColorStop(0, '#a06a37')
    grad.addColorStop(1, '#5c3a1a')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(0, 0, earSize * 0.32, earSize * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(0, earSize * 0.08, earSize * 0.15, earSize * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })

  // Nose: dark oval on the nose tip, with a shine highlight and nostrils.
  const noseSize = faceW * 0.24
  ctx.save()
  ctx.translate(nose.x, nose.y)
  ctx.rotate(angle)
  ctx.fillStyle = '#2b2320'
  ctx.beginPath()
  ctx.ellipse(0, 0, noseSize * 0.5, noseSize * 0.38, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(-noseSize * 0.15, -noseSize * 0.1, noseSize * 0.12, noseSize * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.ellipse(-noseSize * 0.18, noseSize * 0.05, noseSize * 0.06, noseSize * 0.09, 0.3, 0, Math.PI * 2)
  ctx.ellipse(noseSize * 0.18, noseSize * 0.05, noseSize * 0.06, noseSize * 0.09, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------
// 2. Floating Hearts — animated, orbiting the head's bounding box
// ---------------------------------------------------------------------
function drawFloatingHearts(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const lm = frame.landmarks!
  const p = (i: number) => mapPoint(lm[i], frame)

  const forehead = p(LM.foreheadTop)
  const chin = p(LM.chin)
  const cheekL = p(LM.cheekLeft)
  const cheekR = p(LM.cheekRight)

  const cx = (cheekL.x + cheekR.x) / 2
  const cy = forehead.y
  const faceW = dist(cheekL, cheekR)
  const faceH = dist(forehead, chin)

  const count = 6
  for (let i = 0; i < count; i++) {
    const seed = i * 47.5
    const orbitR = faceW * (0.65 + 0.15 * Math.sin(seed))
    const speed = 0.6 + (i % 3) * 0.15
    const ang = frame.t * speed + seed
    const bob = Math.sin(frame.t * 1.8 + seed) * faceH * 0.08
    const hx = cx + Math.cos(ang) * orbitR
    const hy = cy - faceH * 0.35 + Math.sin(ang * 0.7) * faceH * 0.25 + bob
    const size = faceW * (0.07 + 0.02 * Math.sin(seed * 2))
    const alpha = 0.55 + 0.45 * Math.sin(frame.t * 2 + seed)
    drawHeart(ctx, hx, hy, size, Math.max(0.2, alpha))
  }
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#f25f7a'
  ctx.beginPath()
  ctx.moveTo(0, size * 0.3)
  ctx.bezierCurveTo(-size, -size * 0.4, -size * 0.5, -size * 1.1, 0, -size * 0.35)
  ctx.bezierCurveTo(size * 0.5, -size * 1.1, size, -size * 0.4, 0, size * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------
// 3. Pixelated Thug Life Glasses — mapped to the eye landmarks
// ---------------------------------------------------------------------
function drawThugGlasses(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const lm = frame.landmarks!
  const p = (i: number) => mapPoint(lm[i], frame)

  const outerL = p(LM.eyeLeftOuter)
  const outerR = p(LM.eyeRightOuter)

  const angle = faceAngle(outerL, outerR)
  const cx = (outerL.x + outerR.x) / 2
  const cy = (outerL.y + outerR.y) / 2
  const width = dist(outerL, outerR) * 1.35
  const lensR = width * 0.24
  const bridgeGap = width * 0.14
  const pixel = Math.max(3, lensR * 0.16)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  // Blocky, "pixelated" lenses — a square mosaic clipped to a circle
  // instead of a smooth arc.
  ;[-1, 1].forEach((side) => {
    const lx = side * (lensR + bridgeGap / 2)
    ctx.save()
    ctx.translate(lx, 0)
    ctx.fillStyle = '#0a0a0a'
    for (let py = -lensR; py < lensR; py += pixel) {
      for (let px = -lensR; px < lensR; px += pixel) {
        if (px * px + py * py <= lensR * lensR) {
          ctx.fillRect(Math.round(px / pixel) * pixel, Math.round(py / pixel) * pixel, pixel + 0.6, pixel + 0.6)
        }
      }
    }
    ctx.restore()
  })

  // Bridge
  ctx.fillStyle = '#111'
  ctx.fillRect(-bridgeGap / 2, -width * 0.03, bridgeGap, width * 0.06)

  // Arms
  ctx.strokeStyle = '#111'
  ctx.lineWidth = Math.max(2, width * 0.045)
  ctx.beginPath()
  ctx.moveTo(-lensR - bridgeGap / 2 - lensR * 0.9, 0)
  ctx.lineTo(-lensR - bridgeGap / 2 - lensR * 1.6, -lensR * 0.2)
  ctx.moveTo(lensR + bridgeGap / 2 + lensR * 0.9, 0)
  ctx.lineTo(lensR + bridgeGap / 2 + lensR * 1.6, -lensR * 0.2)
  ctx.stroke()

  ctx.restore()
}

// ---------------------------------------------------------------------
// 4. Floral Crown — wreath spanning the forehead width
// ---------------------------------------------------------------------
function drawFloralCrown(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const lm = frame.landmarks!
  const p = (i: number) => mapPoint(lm[i], frame)

  const forehead = p(LM.foreheadTop)
  const cheekL = p(LM.cheekLeft)
  const cheekR = p(LM.cheekRight)
  const browL = p(LM.browLeft)
  const browR = p(LM.browRight)

  const angle = faceAngle(cheekL, cheekR)
  const width = dist(cheekL, cheekR) * 1.05
  const centerX = (browL.x + browR.x) / 2
  const browY = (browL.y + browR.y) / 2
  const centerY = forehead.y - dist(forehead, { x: centerX, y: browY }) * 0.15

  const petalColors = ['#f6a6c1', '#f7d9d4', '#f6e2a8', '#e6b8f2', '#b8e6d4']
  const flowerCount = 7

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(angle)

  // Leaves first, so flowers sit on top.
  ctx.fillStyle = '#6fae7c'
  for (let i = 0; i < flowerCount - 1; i++) {
    const tt = (i + 0.5) / (flowerCount - 1) - 0.5
    const lx = tt * width
    const ly = Math.cos(tt * Math.PI) * width * 0.06 - width * 0.02
    ctx.save()
    ctx.translate(lx, ly - width * 0.03)
    ctx.rotate(tt * 1.2)
    ctx.beginPath()
    ctx.ellipse(0, 0, width * 0.02, width * 0.045, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  for (let i = 0; i < flowerCount; i++) {
    const tt = i / (flowerCount - 1) - 0.5
    const fx = tt * width
    const fy = Math.cos(tt * Math.PI) * width * 0.06 - width * 0.02
    const fs = width * (0.055 + (i % 2 === 0 ? 0.015 : 0))
    drawFlower(ctx, fx, fy, fs, petalColors[i % petalColors.length])
  }

  ctx.restore()
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  for (let k = 0; k < 5; k++) {
    ctx.save()
    ctx.rotate((k / 5) * Math.PI * 2)
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.65, r * 0.42, r * 0.65, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#f6c945'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------
// 5. Neon Cyberpunk — glowing visor + cheekbone tint
// ---------------------------------------------------------------------
function drawCyberpunkVisor(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const lm = frame.landmarks!
  const p = (i: number) => mapPoint(lm[i], frame)

  const outerL = p(LM.eyeLeftOuter)
  const outerR = p(LM.eyeRightOuter)
  const cheekL = p(LM.cheekLeft)
  const cheekR = p(LM.cheekRight)
  const bridge = p(LM.noseBridge)

  const angle = faceAngle(outerL, outerR)
  const width = dist(cheekL, cheekR) * 1.1
  const height = width * 0.22

  ctx.save()
  ctx.translate(bridge.x, bridge.y)
  ctx.rotate(angle)

  ctx.save()
  // 'screen' blending makes overlapping glow additive (like real light)
  // instead of just alpha-compositing a translucent shape on top —
  // brighter where the visor overlaps skin, never darker.
  ctx.globalCompositeOperation = 'screen'
  ctx.shadowColor = '#00f6ff'
  ctx.shadowBlur = height * 0.9
  const grad = ctx.createLinearGradient(-width / 2, 0, width / 2, 0)
  grad.addColorStop(0, 'rgba(0,246,255,0.35)')
  grad.addColorStop(0.5, 'rgba(0,246,255,0.85)')
  grad.addColorStop(1, 'rgba(255,0,200,0.55)')
  ctx.fillStyle = grad
  roundRectPath(ctx, -width / 2, -height / 2, width, height, height * 0.4)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = Math.max(1.5, height * 0.06)
  roundRectPath(ctx, -width / 2, -height / 2, width, height, height * 0.4)
  ctx.stroke()

  ctx.restore()

  // Cheekbone tint glow beneath each eye.
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ;[outerL, outerR].forEach((eye, idx) => {
    const cheekPt = idx === 0 ? cheekL : cheekR
    const tx = (eye.x + cheekPt.x) / 2
    const ty = (eye.y + cheekPt.y) / 2 + height
    const r = width * 0.16
    const radial = ctx.createRadialGradient(tx, ty, 0, tx, ty, r)
    radial.addColorStop(0, 'rgba(255,0,200,0.45)')
    radial.addColorStop(1, 'rgba(255,0,200,0)')
    ctx.fillStyle = radial
    ctx.beginPath()
    ctx.arc(tx, ty, r, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
}

// ---------------------------------------------------------------------
// 6. Angelic Halo — tilted glowing ring above the topmost head landmark
// ---------------------------------------------------------------------
function drawAngelicHalo(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const lm = frame.landmarks!
  const p = (i: number) => mapPoint(lm[i], frame)

  const forehead = p(LM.foreheadTop)
  const chin = p(LM.chin)
  const cheekL = p(LM.cheekLeft)
  const cheekR = p(LM.cheekRight)

  const angle = faceAngle(cheekL, cheekR)
  const faceW = dist(cheekL, cheekR)
  const faceH = dist(forehead, chin)

  // Anchored a bit above the topmost (forehead) landmark, along the
  // face's own "up" direction so it tilts naturally with head tilt.
  const cx = forehead.x - Math.sin(angle) * faceH * 0.55
  const cy = forehead.y - Math.cos(angle) * faceH * 0.55

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle - 0.18) // slight extra tilt for a "floating" feel
  ctx.scale(1, 0.34) // flattened into an ellipse, as if viewed at an angle
  ctx.globalCompositeOperation = 'screen'

  const r = faceW * 0.62

  ctx.shadowColor = 'rgba(255, 244, 190, 0.95)'
  ctx.shadowBlur = r * 0.5
  ctx.strokeStyle = 'rgba(255, 250, 220, 0.9)'
  ctx.lineWidth = Math.max(3, r * 0.1)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.shadowBlur = r * 0.22
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = Math.max(1.5, r * 0.03)
  ctx.stroke()

  ctx.restore()
}

// ---------------------------------------------------------------------
// 7. Chromatic Aberration (Glitch) — whole-frame pixel manipulation,
//    no face tracking needed. Reads back the already-drawn video pixels
//    directly from ctx.canvas.
// ---------------------------------------------------------------------
function applyChromaticAberration(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const { boxW: w, boxH: h, t } = frame
  if (w < 4 || h < 4) return

  // Process at a capped resolution and scale back up — an RGB channel
  // split reads as a convincing glitch effect even at a few hundred
  // pixels wide, and this keeps the per-frame cost bounded no matter how
  // large the source video (native webcam frames are often 1280x720+,
  // which would otherwise mean a multi-megapixel JS loop every tick).
  const scale = Math.min(1, 480 / w)
  const pw = Math.max(1, Math.round(w * scale))
  const ph = Math.max(1, Math.round(h * scale))

  const off = document.createElement('canvas')
  off.width = pw
  off.height = ph
  const octx = off.getContext('2d', { willReadFrequently: true })
  if (!octx) return
  octx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, pw, ph)

  const imgData = octx.getImageData(0, 0, pw, ph)
  const src = imgData.data
  const out = new Uint8ClampedArray(src.length)

  const baseShift = Math.max(1, Math.round(pw * 0.012))
  const shift = baseShift + Math.abs(Math.round(Math.sin(t * 9) * baseShift * 0.6))

  for (let y = 0; y < ph; y++) {
    // A handful of scanlines "tear" further sideways each tick, for a
    // glitchy feel rather than a uniform, static RGB split.
    const tear = Math.sin(y * 0.7 + t * 14) > 0.94 ? shift * 2 : 0
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4
      const rx = Math.min(pw - 1, Math.max(0, x + shift + tear))
      const bx = Math.min(pw - 1, Math.max(0, x - shift))
      const ri = (y * pw + rx) * 4
      const bi = (y * pw + bx) * 4
      out[i] = src[ri] // red channel, shifted right
      out[i + 1] = src[i + 1] // green channel, unshifted
      out[i + 2] = src[bi + 2] // blue channel, shifted left
      out[i + 3] = src[i + 3]
    }
  }

  octx.putImageData(new ImageData(out, pw, ph), 0, 0)
  ctx.drawImage(off, 0, 0, pw, ph, 0, 0, w, h)
}

// ---------------------------------------------------------------------
// 8. Pencil Sketch — grayscale + 3x3 Laplacian edge-detection
//    convolution, no face tracking needed.
// ---------------------------------------------------------------------
function applyPencilSketch(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const { boxW: w, boxH: h } = frame
  if (w < 4 || h < 4) return

  // A 3x3 convolution is O(9 * pixels) — cheap at a downscaled working
  // resolution, expensive at native 1280x720+. Process small, then
  // upscale; edge detail at sketch scale doesn't need native res anyway.
  const scale = Math.min(1, 400 / w)
  const pw = Math.max(3, Math.round(w * scale))
  const ph = Math.max(3, Math.round(h * scale))

  const off = document.createElement('canvas')
  off.width = pw
  off.height = ph
  const octx = off.getContext('2d', { willReadFrequently: true })
  if (!octx) return
  octx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, pw, ph)

  const imgData = octx.getImageData(0, 0, pw, ph)
  const src = imgData.data
  const gray = new Float32Array(pw * ph)
  for (let i = 0, px = 0; i < src.length; i += 4, px++) {
    gray[px] = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114
  }

  // Discrete Laplacian kernel: highlights edges (high local contrast),
  // near-zero on flat regions. Inverting it onto a bright background
  // gives the classic "graphite lines on paper" look.
  const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0]
  const out = new Uint8ClampedArray(src.length)

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      let acc = 0
      let k = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(pw - 1, Math.max(0, x + kx))
          const sy = Math.min(ph - 1, Math.max(0, y + ky))
          acc += gray[sy * pw + sx] * kernel[k++]
        }
      }
      const edge = Math.min(255, Math.max(0, acc))
      const shade = Math.min(255, Math.max(0, 255 - edge * 1.6))
      const i = (y * pw + x) * 4
      out[i] = shade
      out[i + 1] = shade
      out[i + 2] = shade
      out[i + 3] = 255
    }
  }

  octx.putImageData(new ImageData(out, pw, ph), 0, 0)
  ctx.drawImage(off, 0, 0, pw, ph, 0, 0, w, h)
}

// ---------------------------------------------------------------------
// 9. Vintage Timestamp — static overlay, no face tracking needed
// ---------------------------------------------------------------------
function drawVintageTimestamp(ctx: CanvasRenderingContext2D, frame: FrameContext) {
  const { boxW: w, boxH: h, t } = frame
  const pad = w * 0.03
  const fontSize = Math.max(11, w * 0.028)
  const blink = Math.sin(t * 6) > 0

  ctx.save()
  ctx.font = `700 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`
  ctx.textBaseline = 'bottom'

  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString(undefined, { hour12: false })
  const label = `REC  ${dateStr}  ${timeStr}`

  const textWidth = ctx.measureText(label).width
  const dotR = fontSize * 0.22
  const totalWidth = textWidth + dotR * 3
  const x = w - pad - totalWidth
  const y = h - pad

  ctx.shadowColor = 'rgba(255,255,255,0.6)'
  ctx.shadowBlur = fontSize * 0.5
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(label, x + dotR * 3, y)

  if (blink) {
    ctx.shadowColor = 'rgba(255,60,60,0.9)'
    ctx.shadowBlur = fontSize * 0.6
    ctx.fillStyle = '#ff3b3b'
    ctx.beginPath()
    ctx.arc(x + dotR, y - fontSize * 0.35, dotR, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}