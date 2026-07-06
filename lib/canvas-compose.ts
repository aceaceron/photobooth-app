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
