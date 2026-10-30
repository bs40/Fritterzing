/** Parts-bin icon generator: the breadboard artwork fitted into a 32 x 32 canvas. */
import type { Part } from '../model'
import { outputSizePx, outputTransform } from '../artwork'
import { fmt } from '../units'
import { el, esc } from '../xml'
import { XML_DECL, SVG_NS, XLINK_NS, cleanFragment, namespaceDecls, prefixIds, splitSvg } from './common'
import type { BakedRaster } from './breadboard'

export const ICON_PX = 32

export function generateIconSvg(part: Part, baked?: BakedRaster | null): string {
  if (part.icon.mode === 'custom' && part.icon.customSvg) return part.icon.customSvg
  const art = part.artwork
  let body = ''
  if (art) {
    const out = outputSizePx(art)
    const scale = Math.min(ICON_PX / Math.max(1, out.w), ICON_PX / Math.max(1, out.h))
    const dw = out.w * scale
    const dh = out.h * scale
    const dx = (ICON_PX - dw) / 2
    const dy = (ICON_PX - dh) / 2
    if (art.kind === 'raster') {
      if (baked) {
        body = el('image', { x: fmt(dx), y: fmt(dy), width: fmt(dw), height: fmt(dh), preserveAspectRatio: 'none', 'xlink:href': baked.dataUrl })
      } else {
        const image = el('image', { x: 0, y: 0, width: fmt(art.pixelWidth), height: fmt(art.pixelHeight), preserveAspectRatio: 'none', 'xlink:href': art.dataUrl })
        body = `<g transform="translate(${fmt(dx)} ${fmt(dy)}) scale(${fmt(scale)}) ${outputTransform(art)}">${image}</g>`
      }
    } else if (art.svgText) {
      const info = splitSvg(art.svgText)
      if (info) {
        const vb = info.viewBox ?? { x: 0, y: 0, w: art.pixelWidth, h: art.pixelHeight }
        const vbScaleX = vb.w > 0 ? art.pixelWidth / vb.w : 1
        const vbScaleY = vb.h > 0 ? art.pixelHeight / vb.h : 1
        const inner = prefixIds(cleanFragment(info.inner), 'icon-')
        body = `<g${namespaceDecls(info.attrs)} transform="translate(${fmt(dx)} ${fmt(dy)}) scale(${fmt(scale)}) ${outputTransform(art)} scale(${fmt(vbScaleX)} ${fmt(vbScaleY)}) translate(${fmt(-vb.x)} ${fmt(-vb.y)})">${inner}</g>`
      }
    }
  }
  if (!body) {
    const t = (part.metadata.title || '?').slice(0, 3)
    body =
      el('rect', { x: 1, y: 1, width: 30, height: 30, rx: 3, fill: '#4a7fb5', stroke: '#1f3d5c', 'stroke-width': 1 }) +
      el('text', { x: 16, y: 20, 'font-family': "'Droid Sans'", 'font-size': 10, 'text-anchor': 'middle', fill: '#ffffff' }, esc(t))
  }
  return (
    XML_DECL +
    `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" version="1.2" baseProfile="tiny" width="${ICON_PX}px" height="${ICON_PX}px" viewBox="0 0 ${ICON_PX} ${ICON_PX}">\n` +
    `<g id="icon">\n${body}\n</g>\n</svg>\n`
  )
}
