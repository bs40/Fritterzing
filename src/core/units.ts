export const MM_PER_INCH = 25.4

export function mmToIn(mm: number): number {
  return mm / MM_PER_INCH
}
export function inToMm(inch: number): number {
  return inch * MM_PER_INCH
}

/** Format a number for SVG output: up to 4 decimals, no trailing zeros, never "-0". */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const s = (Math.round(n * 10000) / 10000).toString()
  return s === '-0' ? '0' : s
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

/** Parse an SVG length like "1.5in", "38.1mm", "100px" into millimetres. Unitless/px assume 90 dpi (SVG standard). */
export function svgLengthToMm(value: string | null | undefined, fallbackMm: number): number {
  if (!value) return fallbackMm
  const m = /^\s*([-+]?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)\s*([a-z%]*)\s*$/i.exec(value)
  if (!m) return fallbackMm
  const n = parseFloat(m[1])
  switch (m[2].toLowerCase()) {
    case 'mm':
      return n
    case 'cm':
      return n * 10
    case 'in':
      return n * MM_PER_INCH
    case 'pt':
      return (n / 72) * MM_PER_INCH
    case 'pc':
      return (n / 6) * MM_PER_INCH
    case 'px':
    case '':
      return (n / 90) * MM_PER_INCH
    default:
      return fallbackMm
  }
}
