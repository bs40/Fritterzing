import { fmt } from '../units'

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** Fritzing schematic standard values (mm). */
export const SCH = {
  GRID: 2.54,
  PIN_LENGTH: 2.54,
  STROKE: 0.2469, // 0.7 px at 72 dpi
  BODY_STROKE: 0.3,
  PIN_COLOR: '#787878',
  LABEL_COLOR: '#8c8c8c',
  LABEL_SIZE: 1.2347, // 3.5 pt
  NUMBER_SIZE: 0.9,
  TITLE_SIZE: 1.4993, // 4.25 pt
  FONT: "'Droid Sans'"
}

/** Fritzing PCB conventions. */
export const PCB = {
  COPPER: '#F7BD13',
  SILK: '#ffffff',
  SILK_STROKE: 0.2
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n'

/** Root svg element. Physical size in mm, viewBox in the given user units (default: mm). */
export function svgRoot(
  widthMm: number,
  heightMm: number,
  inner: string,
  opts: { vbW?: number; vbH?: number; extraAttrs?: string; comment?: string } = {}
): string {
  const vbW = opts.vbW ?? widthMm
  const vbH = opts.vbH ?? heightMm
  const comment = opts.comment ? `<!-- ${opts.comment} -->\n` : ''
  return (
    XML_DECL +
    comment +
    `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" version="1.2" baseProfile="tiny"` +
    ` width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm" viewBox="0 0 ${fmt(vbW)} ${fmt(vbH)}"${opts.extraAttrs ?? ''}>\n` +
    inner +
    `\n</svg>\n`
  )
}

/** Rough width of a text run in Droid Sans, in the same units as fontSize. */
export function textWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) {
    if (/[iljtfI.,:;'|!]/.test(ch)) w += 0.3
    else if (/[mwMW]/.test(ch)) w += 0.85
    else if (/[A-Z0-9]/.test(ch)) w += 0.66
    else if (ch === ' ') w += 0.3
    else w += 0.56
  }
  return w * fontSize
}

export function ceilToGrid(v: number, grid: number): number {
  return Math.ceil(v / grid - 1e-9) * grid
}

/**
 * Prefix every id in an SVG fragment (and the references to them) so that
 * imported artwork can never collide with generated connector ids.
 */
export function prefixIds(fragment: string, prefix: string): string {
  const ids = new Set<string>()
  for (const m of fragment.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) ids.add(m[1])
  if (ids.size === 0) return fragment
  let out = fragment.replace(/(\sid\s*=\s*["'])([^"']+)(["'])/g, (_m, a, id, b) => `${a}${prefix}${id}${b}`)
  // url(#id) references and href="#id"
  out = out.replace(/url\(\s*#([^)\s"']+)\s*\)/g, (m, id) => (ids.has(id) ? `url(#${prefix}${id})` : m))
  out = out.replace(/(xlink:href|href)(\s*=\s*["'])#([^"']+)(["'])/g, (m, attr, a, id, b) =>
    ids.has(id) ? `${attr}${a}#${prefix}${id}${b}` : m
  )
  return out
}

export interface SvgInfo {
  openTag: string
  inner: string
  attrs: Record<string, string>
  viewBox: { x: number; y: number; w: number; h: number } | null
  widthAttr: string | null
  heightAttr: string | null
}

/** Light-weight parse of an SVG document into root attributes and inner markup (no DOM needed). */
export function splitSvg(svgText: string): SvgInfo | null {
  const open = /<svg\b([^>]*)>/i.exec(svgText)
  if (!open) return null
  const closeIdx = svgText.lastIndexOf('</svg>')
  if (closeIdx < 0) return null
  const inner = svgText.slice(open.index + open[0].length, closeIdx)
  const attrs: Record<string, string> = {}
  for (const m of open[1].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3] ?? ''
  let viewBox: SvgInfo['viewBox'] = null
  if (attrs['viewBox']) {
    const p = attrs['viewBox'].trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p.every((n) => Number.isFinite(n))) viewBox = { x: p[0], y: p[1], w: p[2], h: p[3] }
  }
  return { openTag: open[0], inner, attrs, viewBox, widthAttr: attrs['width'] ?? null, heightAttr: attrs['height'] ?? null }
}

/** Strip things Fritzing's renderer does not need or cannot parse from an SVG fragment. */
export function cleanFragment(inner: string): string {
  return inner
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '')
    .replace(/<sodipodi:namedview\b[\s\S]*?(\/>|<\/sodipodi:namedview>)/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

/** Collect xmlns:* declarations from a root tag so they can be re-declared on a wrapper. */
export function namespaceDecls(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .filter(([k]) => k.startsWith('xmlns:') && k !== 'xmlns:xlink')
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')
}

/** Ensure an SVG document has a `<g id="layerId">` wrapping its content. Returns the (possibly) modified text. */
export function ensureLayer(svgText: string, layerId: string): { svg: string; added: boolean } {
  if (new RegExp(`\\sid\\s*=\\s*["']${layerId}["']`).test(svgText)) return { svg: svgText, added: false }
  const info = splitSvg(svgText)
  if (!info) return { svg: svgText, added: false }
  const openIdx = svgText.indexOf(info.openTag)
  const closeIdx = svgText.lastIndexOf('</svg>')
  const svg =
    svgText.slice(0, openIdx + info.openTag.length) +
    `\n<g id="${layerId}">` +
    svgText.slice(openIdx + info.openTag.length, closeIdx) +
    `</g>\n` +
    svgText.slice(closeIdx)
  return { svg, added: true }
}

export function hasId(svgText: string, id: string): boolean {
  return new RegExp(`\\sid\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(svgText)
}

export function allIds(svgText: string): string[] {
  return Array.from(svgText.matchAll(/\sid\s*=\s*["']([^"']+)["']/g), (m) => m[1])
}
