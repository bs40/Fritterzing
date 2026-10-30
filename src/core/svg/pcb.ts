/**
 * PCB view generator. Produces copper pads (through-hole or SMD) from a
 * footprint template plus a silkscreen outline. Wiring-only parts (mode
 * 'none') produce no PCB graphic at all: the FZP points their PCB view at the
 * breadboard layer, the same idiom Fritzing's own breadboard part uses, so
 * the part simply does not appear in PCB view.
 */
import type { Part, Connector } from '../model'
import { fzConnectorId } from '../model'
import { naturalToMm } from '../artwork'
import { fmt } from '../units'
import { el, esc } from '../xml'
import { PCB, svgRoot } from './common'

export interface PcbPad {
  connector: Connector
  index: number
  x: number
  y: number
}

export interface PcbLayout {
  widthMm: number
  heightMm: number
  outline: { x: number; y: number; w: number; h: number }
  pads: PcbPad[]
  margin: number
}

const MARGIN = 1.27

/** Pad centres in mm, relative to the outline's top-left corner. */
export function pcbLayout(part: Part): PcbLayout {
  const cfg = part.pcb
  const conns = part.connectors.map((connector, index) => ({ connector, index }))
  const n = conns.length
  const pitch = Math.max(0.5, cfg.pitchMm)
  const pad = Math.max(0.5, cfg.padDiameterMm)
  const rel: Array<{ connector: Connector; index: number; x: number; y: number }> = []
  let ow = 0
  let oh = 0

  switch (cfg.template) {
    case 'dip': {
      const perSide = Math.ceil(n / 2)
      const rs = Math.max(pitch, cfg.rowSpacingMm)
      ow = rs + pad + 2
      oh = perSide * pitch + 1
      conns.forEach((c, i) => {
        const left = i < perSide
        const k = left ? i : n - 1 - i
        rel.push({ ...c, x: left ? (ow - rs) / 2 : (ow + rs) / 2, y: (k + 0.5) * pitch + 0.5 })
      })
      break
    }
    case 'sip':
    case 'terminal': {
      ow = Math.max(1, n) * pitch
      oh = pad + 2
      conns.forEach((c, i) => rel.push({ ...c, x: (i + 0.5) * pitch, y: oh / 2 }))
      break
    }
    case 'header': {
      const rows = Math.max(1, Math.min(n, Math.round(cfg.rows)))
      const cols = Math.ceil(n / rows)
      const rs = rows > 1 ? Math.max(pitch, cfg.rowSpacingMm) : 0
      ow = cols * pitch
      oh = (rows - 1) * rs + pad + 1
      conns.forEach((c, i) => {
        const r = Math.floor(i / cols)
        const col = i % cols
        rel.push({ ...c, x: (col + 0.5) * pitch, y: (pad + 1) / 2 + r * rs })
      })
      break
    }
    case 'custom': {
      ow = cfg.outlineWidthMm ?? Math.max(10, Math.ceil(Math.sqrt(n)) * pitch + 2)
      oh = cfg.outlineHeightMm ?? ow
      const cols = Math.max(1, Math.floor((ow - 2) / pitch))
      conns.forEach((c, i) => {
        const p = c.connector.pcb ?? { x: 1 + (i % cols) * pitch + pitch / 2, y: 1 + Math.floor(i / cols) * pitch + pitch / 2 }
        rel.push({ ...c, x: p.x, y: p.y })
      })
      break
    }
    default: {
      // 'module': pads where the breadboard connectors physically are
      const art = part.artwork
      ow = cfg.outlineWidthMm ?? art?.widthMm ?? 20
      oh = cfg.outlineHeightMm ?? art?.heightMm ?? 10
      conns.forEach((c, i) => {
        if (art && c.connector.breadboard) {
          const p = naturalToMm(art, c.connector.breadboard)
          const sx = art.widthMm > 0 ? ow / art.widthMm : 1
          const sy = art.heightMm > 0 ? oh / art.heightMm : 1
          rel.push({ ...c, x: p.x * sx, y: p.y * sy })
        } else {
          rel.push({ ...c, x: 1 + (i + 0.5) * pitch, y: oh / 2 })
        }
      })
    }
  }

  if (cfg.template !== 'module' && cfg.template !== 'custom') {
    if (cfg.outlineWidthMm) ow = cfg.outlineWidthMm
    if (cfg.outlineHeightMm) oh = cfg.outlineHeightMm
  }

  return {
    widthMm: ow + 2 * MARGIN,
    heightMm: oh + 2 * MARGIN,
    outline: { x: MARGIN, y: MARGIN, w: ow, h: oh },
    pads: rel.map((r) => ({ connector: r.connector, index: r.index, x: r.x + MARGIN, y: r.y + MARGIN })),
    margin: MARGIN
  }
}

export function generatePcbSvg(part: Part): string | null {
  const cfg = part.pcb
  if (cfg.mode === 'none') return null
  if (cfg.mode === 'custom' && cfg.customSvg) return cfg.customSvg
  const lay = pcbLayout(part)
  const out: string[] = []

  // silkscreen
  out.push(`<g id="silkscreen">`)
  out.push(
    el('rect', {
      x: fmt(lay.outline.x),
      y: fmt(lay.outline.y),
      width: fmt(lay.outline.w),
      height: fmt(lay.outline.h),
      fill: 'none',
      stroke: PCB.SILK,
      'stroke-width': fmt(PCB.SILK_STROKE)
    })
  )
  if (cfg.silkLabel && part.metadata.title) {
    const fs = Math.min(2, Math.max(0.8, lay.outline.w / Math.max(6, part.metadata.title.length * 0.7)))
    out.push(
      el(
        'text',
        {
          x: fmt(lay.outline.x + lay.outline.w / 2),
          y: fmt(lay.outline.y + lay.outline.h / 2 + fs * 0.35),
          'font-family': "'OCRA'",
          'font-size': fmt(fs),
          'text-anchor': 'middle',
          fill: PCB.SILK
        },
        esc(part.metadata.title)
      )
    )
  }
  out.push(`</g>`)

  const pad = Math.max(0.5, cfg.padDiameterMm)
  const hole = cfg.smd ? 0 : Math.min(pad - 0.2, Math.max(0.2, cfg.holeDiameterMm))
  const pads = lay.pads
    .map((p) => {
      const id = `${fzConnectorId(p.connector, p.index)}pin`
      if (cfg.smd) {
        return el('rect', {
          id,
          x: fmt(p.x - pad / 2),
          y: fmt(p.y - pad / 2),
          width: fmt(pad),
          height: fmt(pad),
          fill: PCB.COPPER,
          stroke: 'none'
        })
      }
      return el('circle', {
        id,
        cx: fmt(p.x),
        cy: fmt(p.y),
        r: fmt((pad + hole) / 4),
        fill: 'none',
        stroke: PCB.COPPER,
        'stroke-width': fmt((pad - hole) / 2)
      })
    })
    .join('\n')

  if (cfg.smd) {
    out.push(`<g id="copper1">\n${pads}\n</g>`)
  } else {
    out.push(`<g id="copper1"><g id="copper0">\n${pads}\n</g></g>`)
  }

  return svgRoot(lay.widthMm, lay.heightMm, out.join('\n'), { comment: `Generated by Fritterzing: ${part.metadata.title} pcb` })
}

export function pcbLayerIds(part: Part): string[] {
  if (part.pcb.mode === 'none') return []
  if (part.pcb.smd) return ['copper1', 'silkscreen']
  return ['copper1', 'silkscreen', 'copper0']
}
