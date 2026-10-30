/**
 * Geometry of SVG elements without a layout engine: find the bounding box of
 * an element by id (basic shapes, paths, groups, use) in root user units,
 * honouring transform attributes. Used to recover connector positions from
 * existing Fritzing SVGs.
 */
import { parseXml } from './xml'
import { svgLengthToMm } from './units'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** [a b c d e f] as in SVG matrix(a,b,c,d,e,f) */
type Mat = [number, number, number, number, number, number]
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ]
}

function apply(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

export function parseTransform(s: string | null | undefined): Mat {
  let m: Mat = IDENTITY
  if (!s) return m
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  for (const match of s.matchAll(re)) {
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    let t: Mat = IDENTITY
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) t = args as Mat
        break
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]
        break
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0]
        break
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const r: Mat = [cos, sin, -sin, cos, 0, 0]
        if (args.length >= 3) {
          const cx = args[1]
          const cy = args[2]
          t = mul(mul([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy])
        } else t = r
        break
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]
        break
    }
    m = mul(m, t)
  }
  return m
}

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  if (v === null) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

function boxOfPoints(pts: Array<{ x: number; y: number }>): Box | null {
  if (pts.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function transformBox(b: Box, m: Mat): Box {
  const pts = [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x, b.y + b.h), apply(m, b.x + b.w, b.y + b.h)]
  return boxOfPoints(pts)!
}

const ARGC: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Bounding box of all points named in a path (control points included, so curves are over-estimated slightly). */
export function pathBox(d: string): Box | null {
  const tokens = d.match(/[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return null
  const pts: Array<{ x: number; y: number }> = []
  let cmd = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let i = 0
  const nextNum = (): number => parseFloat(tokens[i++])
  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t
      i++
      if (cmd === 'Z' || cmd === 'z') {
        cx = sx
        cy = sy
        continue
      }
    }
    if (!cmd) {
      i++
      continue
    }
    const upper = cmd.toUpperCase()
    const rel = cmd !== upper
    const argc = ARGC[upper] ?? 0
    if (argc === 0) {
      i++
      continue
    }
    if (i + argc > tokens.length) break
    const a: number[] = []
    for (let k = 0; k < argc; k++) a.push(nextNum())
    const px = (v: number): number => (rel ? cx + v : v)
    const py = (v: number): number => (rel ? cy + v : v)
    switch (upper) {
      case 'M':
        cx = px(a[0])
        cy = py(a[1])
        sx = cx
        sy = cy
        pts.push({ x: cx, y: cy })
        cmd = rel ? 'l' : 'L'
        break
      case 'L':
      case 'T':
        cx = px(a[0])
        cy = py(a[1])
        pts.push({ x: cx, y: cy })
        break
      case 'H':
        cx = rel ? cx + a[0] : a[0]
        pts.push({ x: cx, y: cy })
        break
      case 'V':
        cy = rel ? cy + a[0] : a[0]
        pts.push({ x: cx, y: cy })
        break
      case 'C':
        pts.push({ x: px(a[0]), y: py(a[1]) }, { x: px(a[2]), y: py(a[3]) })
        cx = px(a[4])
        cy = py(a[5])
        pts.push({ x: cx, y: cy })
        break
      case 'S':
      case 'Q':
        pts.push({ x: px(a[0]), y: py(a[1]) })
        cx = px(a[2])
        cy = py(a[3])
        pts.push({ x: cx, y: cy })
        break
      case 'A':
        cx = px(a[5])
        cy = py(a[6])
        pts.push({ x: cx, y: cy })
        break
    }
  }
  return boxOfPoints(pts)
}

function localBox(el: Element, doc: Document, depth: number): Box | null {
  const tag = el.localName
  switch (tag) {
    case 'rect':
    case 'image':
    case 'foreignObject':
      return { x: num(el, 'x'), y: num(el, 'y'), w: num(el, 'width'), h: num(el, 'height') }
    case 'circle': {
      const r = num(el, 'r')
      return { x: num(el, 'cx') - r, y: num(el, 'cy') - r, w: 2 * r, h: 2 * r }
    }
    case 'ellipse': {
      const rx = num(el, 'rx')
      const ry = num(el, 'ry')
      return { x: num(el, 'cx') - rx, y: num(el, 'cy') - ry, w: 2 * rx, h: 2 * ry }
    }
    case 'line':
      return boxOfPoints([
        { x: num(el, 'x1'), y: num(el, 'y1') },
        { x: num(el, 'x2'), y: num(el, 'y2') }
      ])
    case 'polyline':
    case 'polygon': {
      const nums = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number)
      const pts: Array<{ x: number; y: number }> = []
      for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: nums[k], y: nums[k + 1] })
      return boxOfPoints(pts)
    }
    case 'path':
      return pathBox(el.getAttribute('d') ?? '')
    case 'text': {
      const fs = num(el, 'font-size', 10)
      const len = (el.textContent ?? '').length
      const w = len * fs * 0.6
      const anchor = el.getAttribute('text-anchor')
      const x = num(el, 'x')
      const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
      return { x: left, y: num(el, 'y') - fs * 0.8, w, h: fs }
    }
    case 'use': {
      const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''
      const ref = href.startsWith('#') ? doc.getElementById(href.slice(1)) : null
      if (!ref || depth > 20) return null
      const b = boxInParent(ref, doc, depth + 1)
      if (!b) return null
      return { ...b, x: b.x + num(el, 'x'), y: b.y + num(el, 'y') }
    }
    default: {
      // group-like: union of children
      let b: Box | null = null
      for (const child of Array.from(el.children)) b = union(b, boxInParent(child, doc, depth + 1))
      if (b && (tag === 'svg' || tag === 'symbol') && el !== doc.documentElement) {
        b = { ...b, x: b.x + num(el, 'x'), y: b.y + num(el, 'y') }
      }
      return b
    }
  }
}

/** Box of `el` in its parent's coordinate space. */
function boxInParent(el: Element, doc: Document, depth = 0): Box | null {
  if (depth > 60) return null
  const b = localBox(el, doc, depth)
  if (!b) return null
  const t = el.getAttribute('transform')
  return t ? transformBox(b, parseTransform(t)) : b
}

/** Box of `el` in root (viewBox) user space. */
export function boxInRoot(el: Element, doc: Document): Box | null {
  let b = boxInParent(el, doc)
  if (!b) return null
  let p = el.parentElement
  while (p && p !== doc.documentElement) {
    const t = p.getAttribute('transform')
    if (t) b = transformBox(b, parseTransform(t))
    if ((p.localName === 'svg' || p.localName === 'symbol') && p !== doc.documentElement) {
      b = { ...b, x: b.x + num(p, 'x'), y: b.y + num(p, 'y') }
    }
    p = p.parentElement
  }
  return b
}

export interface SvgDocInfo {
  viewBox: Box
  widthMm: number
  heightMm: number
  /** mm per viewBox unit */
  scaleX: number
  scaleY: number
}

export function svgDocInfo(doc: Document): SvgDocInfo {
  const root = doc.documentElement
  const vbAttr = root.getAttribute('viewBox')
  let viewBox: Box | null = null
  if (vbAttr) {
    const p = vbAttr.trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0) viewBox = { x: p[0], y: p[1], w: p[2], h: p[3] }
  }
  const wAttr = root.getAttribute('width')
  const hAttr = root.getAttribute('height')
  if (!viewBox) {
    const w = parseFloat(wAttr ?? '100') || 100
    const h = parseFloat(hAttr ?? '100') || 100
    viewBox = { x: 0, y: 0, w, h }
  }
  const widthMm = svgLengthToMm(wAttr, (viewBox.w / 90) * 25.4)
  const heightMm = svgLengthToMm(hAttr, (viewBox.h / 90) * 25.4)
  return { viewBox, widthMm, heightMm, scaleX: widthMm / viewBox.w, scaleY: heightMm / viewBox.h }
}

export interface Measured {
  id: string
  box: Box
  /** centre in viewBox units */
  cx: number
  cy: number
}

/** Measure elements by id. Missing ids are simply absent from the result. */
export function measureSvg(svgText: string, ids: string[]): { info: SvgDocInfo; boxes: Map<string, Measured>; doc: Document } {
  const doc = parseXml(svgText)
  const info = svgDocInfo(doc)
  const boxes = new Map<string, Measured>()
  for (const id of ids) {
    const el = doc.getElementById(id)
    if (!el) continue
    const box = boxInRoot(el, doc)
    if (!box) continue
    boxes.set(id, { id, box, cx: box.x + box.w / 2, cy: box.y + box.h / 2 })
  }
  return { info, boxes, doc }
}
