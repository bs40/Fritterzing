/** Raster helpers: read image dimensions, bake crop/rotation into pixels. */
import type { Artwork } from '@core/model'
import { effectiveCrop, outputSizePx } from '@core/artwork'
import type { BakedRaster } from '@core/svg/breadboard'

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be decoded.'))
    img.src = dataUrl
  })
}

/** Bake crop and rotation into a new image. Returns null when nothing needs baking. */
export async function bakeRaster(art: Artwork): Promise<BakedRaster | null> {
  if (art.kind !== 'raster') return null
  if (art.rotation === 0 && !art.crop) return null
  const img = await loadImage(art.dataUrl)
  const c = effectiveCrop(art)
  const out = outputSizePx(art)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(out.w))
  canvas.height = Math.max(1, Math.round(out.h))
  const ctx = canvas.getContext('2d')!
  ctx.save()
  switch (art.rotation) {
    case 90:
      ctx.translate(c.h, 0)
      ctx.rotate(Math.PI / 2)
      break
    case 180:
      ctx.translate(c.w, c.h)
      ctx.rotate(Math.PI)
      break
    case 270:
      ctx.translate(0, c.w)
      ctx.rotate(-Math.PI / 2)
      break
  }
  ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h)
  ctx.restore()
  const jpeg = /jpe?g/i.test(art.mime)
  const dataUrl = jpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png')
  return { dataUrl, widthPx: canvas.width, heightPx: canvas.height }
}
