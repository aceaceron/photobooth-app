/** Loads a data-URL (or any same-origin) image into an HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Grid dimensions (cols x rows) for mosaicing N participant frames into one cell. */
export function mosaicGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 }
  if (n === 2) return { cols: 2, rows: 1 }
  if (n <= 4) return { cols: 2, rows: 2 }
  return { cols: 3, rows: 2 } // up to 6
}

/** Rects (in local cell coordinates) for each mosaic tile, with a small gap. */
export function mosaicRects(
  n: number,
  w: number,
  h: number,
  gap = 3,
): { x: number; y: number; w: number; h: number }[] {
  const { cols, rows } = mosaicGrid(n)
  const tileW = (w - gap * (cols - 1)) / cols
  const tileH = (h - gap * (rows - 1)) / rows
  return Array.from({ length: n }, (_, i) => ({
    x: (i % cols) * (tileW + gap),
    y: Math.floor(i / cols) * (tileH + gap),
    w: tileW,
    h: tileH,
  }))
}

/** Draws `img` into the target rect using object-fit: cover semantics. */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const srcRatio = img.width / img.height
  const dstRatio = w / h
  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height

  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / dstRatio
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/**
 * Fills a rect with a preset background. Canvas can't parse a raw CSS
 * gradient string handed to ctx.fillStyle — it silently keeps whatever
 * fillStyle was already set (defaulting to black), which is why the
 * "Confetti" backdrop (a CSS radial-gradient swatch) rendered as solid
 * black in the video export instead of the dotted pattern seen on screen
 * and in the PNG. Rendering real canvas gradients/patterns here instead
 * keeps the video, PNG, and on-screen Photostrip all showing the same
 * background. 'custom' (uploaded image) backgrounds are drawn by the
 * caller since loading that image is async.
 */
export function fillPresetBackground(
  ctx: CanvasRenderingContext2D,
  bg: { id: string; swatch: string },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (bg.id === 'sunset') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    g.addColorStop(0, '#f7b267')
    g.addColorStop(1, '#f25f5c')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  } else if (bg.id === 'dots') {
    ctx.fillStyle = '#fdf3ec'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#f26b5e'
    const spacing = 28
    const radius = 3
    for (let py = spacing / 2; py < h; py += spacing) {
      for (let px = spacing / 2; px < w; px += spacing) {
        ctx.beginPath()
        ctx.arc(x + px, y + py, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else {
    ctx.fillStyle = bg.swatch
    ctx.fillRect(x, y, w, h)
  }
}

export function roundRect(
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

/**
 * The PNG export and the video canvas are rendered at a much higher
 * resolution (900-1200px wide) than the on-screen Photostrip preview
 * (roughly 150-220px wide), so a literal pixel value copied from one to
 * the other doesn't look the same — that's why the exports used to look
 * more sharply-cornered and coarser-lettered than the live preview's
 * `rounded-md` cells and `text-[9px]` watermark. Deriving both as a
 * fraction of the canvas width keeps the *proportions* consistent with
 * the CSS design instead, and keeps the PNG and video matching each
 * other since they now both call the same helpers.
 */
const STRIP_RADIUS_RATIO = 0.024
const STRIP_FONT_RATIO = 0.03

export function stripCellRadius(canvasWidth: number): number {
  return Math.round(canvasWidth * STRIP_RADIUS_RATIO)
}

/** Renders the "SNAPORY · <year>" watermark, scaled and weighted to match
 * the Photostrip component's `font-mono font-medium tracking-widest
 * text-[9px] uppercase` treatment, with the same background-aware
 * light/dark contrast color used on screen. */
export function drawStripWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  isDarkBg: boolean,
) {
  const fontSize = Math.round(width * STRIP_FONT_RATIO)
  ctx.save()
  ctx.fillStyle = isDarkBg ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  ctx.font = `500 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`
  ctx.textAlign = 'center'
  // Approximates Tailwind's tracking-widest at this font size; ignored
  // harmlessly by engines that don't support ctx.letterSpacing yet.
  try {
    ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(fontSize * 0.18)}px`
  } catch {}
  ctx.fillText(`SNAPORY \u00b7 ${new Date().getFullYear()}`, width / 2, height - fontSize * 1.5)
  ctx.restore()
}