/**
 * Artwork geometry: natural pixel space -> cropped/rotated output pixel
 * space -> physical millimetres. Used by both the canvas and the generators
 * so what the user sees is what gets exported.
 */
import type { Artwork, Crop } from './model'
import { fmt } from './units'

export interface Pt {
  x: number
  y: number
}

export function effectiveCrop(a: Artwork): Crop {
  return a.crop ?? { x: 0, y: 0, w: a.pixelWidth, h: a.pixelHeight }
}

/** Output size in pixels after crop and rotation. */
export function outputSizePx(a: Artwork): { w: number; h: number } {
  const c = effectiveCrop(a)
  return a.rotation === 90 || a.rotation === 270 ? { w: c.h, h: c.w } : { w: c.w, h: c.h }
}

export function naturalToOutput(a: Artwork, p: Pt): Pt {
  const c = effectiveCrop(a)
  const x = p.x - c.x
  const y = p.y - c.y
  switch (a.rotation) {
    case 90:
      return { x: c.h - y, y: x }
    case 180:
      return { x: c.w - x, y: c.h - y }
    case 270:
      return { x: y, y: c.w - x }
    default:
      return { x, y }
  }
}

export function outputToNatural(a: Artwork, p: Pt): Pt {
  const c = effectiveCrop(a)
  let x: number
  let y: number
  switch (a.rotation) {
    case 90:
      x = p.y
      y = c.h - p.x
      break
    case 180:
      x = c.w - p.x
      y = c.h - p.y
      break
    case 270:
      x = c.w - p.y
      y = p.x
      break
    default:
      x = p.x
      y = p.y
  }
  return { x: x + c.x, y: y + c.y }
}

/** millimetres per output pixel (x and y may differ if the aspect ratio was changed deliberately) */
export function mmPerPx(a: Artwork): { x: number; y: number } {
  const o = outputSizePx(a)
  return { x: o.w > 0 ? a.widthMm / o.w : 0, y: o.h > 0 ? a.heightMm / o.h : 0 }
}

/** natural pixel point -> millimetres in the exported breadboard view */
export function naturalToMm(a: Artwork, p: Pt): Pt {
  const o = naturalToOutput(a, p)
  const s = mmPerPx(a)
  return { x: o.x * s.x, y: o.y * s.y }
}

export function mmToNatural(a: Artwork, p: Pt): Pt {
  const s = mmPerPx(a)
  return outputToNatural(a, { x: s.x ? p.x / s.x : 0, y: s.y ? p.y / s.y : 0 })
}

/** Size (natural px) -> size in mm, using the x scale (rotation swaps axes consistently for square markers). */
export function sizeToMm(a: Artwork, px: number): number {
  return px * mmPerPx(a).x
}

export function sizeToPx(a: Artwork, mm: number): number {
  const s = mmPerPx(a).x
  return s ? mm / s : 0
}

/**
 * SVG transform mapping natural pixel coordinates onto output pixel
 * coordinates (crop then rotation). Apply to an element drawn in natural px.
 */
export function outputTransform(a: Artwork): string {
  const c = effectiveCrop(a)
  const pre = `translate(${fmt(-c.x)} ${fmt(-c.y)})`
  switch (a.rotation) {
    case 90:
      return `translate(${fmt(c.h)} 0) rotate(90) ${pre}`
    case 180:
      return `translate(${fmt(c.w)} ${fmt(c.h)}) rotate(180) ${pre}`
    case 270:
      return `translate(0 ${fmt(c.w)}) rotate(270) ${pre}`
    default:
      return pre
  }
}

/** Set a new physical width, keeping the aspect ratio of the output. */
export function withWidthMm(a: Artwork, widthMm: number): Artwork {
  const o = outputSizePx(a)
  const ratio = o.w > 0 ? o.h / o.w : 1
  return { ...a, widthMm, heightMm: widthMm * ratio }
}

export function withHeightMm(a: Artwork, heightMm: number): Artwork {
  const o = outputSizePx(a)
  const ratio = o.h > 0 ? o.w / o.h : 1
  return { ...a, heightMm, widthMm: heightMm * ratio }
}

/** Rotate by 90 degree steps, keeping physical scale (swapping width/height). */
export function rotated(a: Artwork, delta: 90 | -90 | 180): Artwork {
  const r = (((a.rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270
  const swap = delta !== 180
  return { ...a, rotation: r, widthMm: swap ? a.heightMm : a.widthMm, heightMm: swap ? a.widthMm : a.heightMm }
}

/** Apply a crop (natural px). Physical scale (mm per px) is preserved. */
export function withCrop(a: Artwork, crop: Crop | null): Artwork {
  const s = mmPerPx(a)
  const next: Artwork = { ...a, crop }
  const o = outputSizePx(next)
  return { ...next, widthMm: o.w * s.x, heightMm: o.h * s.y }
}

/** Calibrate scale from two natural-px points and a known distance (mm). */
export function calibrated(a: Artwork, p1: Pt, p2: Pt, distanceMm: number): Artwork {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (d <= 0 || distanceMm <= 0) return a
  const mmPerNaturalPx = distanceMm / d
  const o = outputSizePx(a)
  return { ...a, widthMm: o.w * mmPerNaturalPx, heightMm: o.h * mmPerNaturalPx }
}

export function dataUrlMime(dataUrl: string): string {
  const m = /^data:([^;,]+)/.exec(dataUrl)
  return m ? m[1] : 'application/octet-stream'
}

export function isSvgMime(mime: string): boolean {
  return /svg/i.test(mime)
}
