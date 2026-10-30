/** Multi-pin connector groups: evenly spaced points between two clicks. */
import type { Pt } from './artwork'

export interface GroupSpec {
  count: number
  names: string[]
  reverse: boolean
  startNumber: number
}

/** `count` points evenly spaced from `first` to `last` (inclusive). */
export function spacedPoints(first: Pt, last: Pt, count: number): Pt[] {
  const n = Math.max(1, Math.floor(count))
  if (n === 1) return [{ ...first }]
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    out.push({ x: first.x + (last.x - first.x) * t, y: first.y + (last.y - first.y) * t })
  }
  return out
}

/** Points along a direction from `first` with a fixed pitch (in the same units as the points). */
export function pitchedPoints(first: Pt, direction: 'horizontal' | 'vertical', pitch: number, count: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < Math.max(1, count); i++)
    out.push(direction === 'horizontal' ? { x: first.x + pitch * i, y: first.y } : { x: first.x, y: first.y + pitch * i })
  return out
}

/** Parse a "names" text box: comma or newline separated. */
export function parseNames(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
