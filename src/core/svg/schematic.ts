/**
 * Schematic view generator: a labelled rectangle with pins on the 0.1 inch
 * Fritzing grid, following the Fritzing schematic graphic standard.
 */
import type { Connector, Part, SchematicSide } from '../model'
import { connectorDisplayName, fzConnectorId } from '../model'
import { fmt } from '../units'
import { el, esc } from '../xml'
import { SCH, ceilToGrid, svgRoot, textWidth } from './common'

export type ResolvedSide = Exclude<SchematicSide, 'auto'>

export interface SchematicPin {
  connector: Connector
  index: number
  side: ResolvedSide
  slot: number
  label: string
  number: string
}

export interface SchematicLayout {
  widthMm: number
  heightMm: number
  body: { x: number; y: number; w: number; h: number }
  pins: Array<SchematicPin & { x1: number; y1: number; x2: number; y2: number; tx: number; ty: number }>
  title: string
}

/** Decide which side each pin goes on and in which slot. */
export function resolveSchematicPins(part: Part): SchematicPin[] {
  const visible = part.connectors
    .map((connector, index) => ({ connector, index }))
    .filter((p) => !p.connector.schematic.hidden)
  const sorted = [...visible].sort(
    (a, b) => a.connector.schematic.order - b.connector.schematic.order || a.index - b.index
  )
  const autos = sorted.filter((p) => p.connector.schematic.side === 'auto')
  const half = Math.ceil(autos.length / 2)
  const autoSide = new Map<string, ResolvedSide>()
  autos.forEach((p, i) => autoSide.set(p.connector.id, i < half ? 'left' : 'right'))

  const slots: Record<ResolvedSide, number> = { left: 0, right: 0, top: 0, bottom: 0 }
  return sorted.map((p) => {
    const side = (p.connector.schematic.side === 'auto' ? autoSide.get(p.connector.id) : p.connector.schematic.side) as ResolvedSide
    const slot = slots[side]++
    const label = p.connector.schematic.label ?? connectorDisplayName(p.connector, p.index)
    const number = p.connector.number !== null ? String(p.connector.number) : ''
    return { connector: p.connector, index: p.index, side, slot, label, number }
  })
}

export function schematicLayout(part: Part): SchematicLayout {
  const P = SCH.GRID
  const L = SCH.PIN_LENGTH
  const pins = resolveSchematicPins(part)
  const count = (s: ResolvedSide): number => pins.filter((p) => p.side === s).length
  const nL = count('left')
  const nR = count('right')
  const nT = count('top')
  const nB = count('bottom')
  const title = (part.schematic.title ?? part.metadata.title) || 'Part'
  const showLabels = part.schematic.showLabels
  const showNumbers = part.schematic.showNumbers

  const labelW = (s: ResolvedSide): number =>
    showLabels ? Math.max(0, ...pins.filter((p) => p.side === s).map((p) => textWidth(p.label, SCH.LABEL_SIZE))) : 0
  const numW = showNumbers ? textWidth('88', SCH.NUMBER_SIZE) + 0.6 : 0
  const horizontalContent = labelW('left') + labelW('right') + (nL ? numW + 1 : 0) + (nR ? numW + 1 : 0) + 2
  const titleW = textWidth(title, SCH.TITLE_SIZE) + 2
  const verticalPins = (Math.max(nT, nB) + 1) * P
  let bodyW = ceilToGrid(Math.max(horizontalContent, titleW, verticalPins, 4 * P), P)
  bodyW += Math.max(0, part.schematic.extraWidth) * P

  const rows = Math.max(nL, nR)
  const bodyH = Math.max(3 * P, (rows + 2) * P)
  const ox = nL > 0 ? L : 0
  const oy = nT > 0 ? L : 0
  const widthMm = ox + bodyW + (nR > 0 ? L : 0)
  const heightMm = oy + bodyH + (nB > 0 ? L : 0)
  const half = SCH.STROKE / 2

  const laid = pins.map((p) => {
    switch (p.side) {
      case 'left': {
        const y = oy + P * (p.slot + 2)
        return { ...p, x1: half, y1: y, x2: ox, y2: y, tx: half, ty: y }
      }
      case 'right': {
        const y = oy + P * (p.slot + 2)
        return { ...p, x1: ox + bodyW, y1: y, x2: widthMm - half, y2: y, tx: widthMm - half, ty: y }
      }
      case 'top': {
        const x = ox + P * (p.slot + 1)
        return { ...p, x1: x, y1: half, x2: x, y2: oy, tx: x, ty: half }
      }
      default: {
        const x = ox + P * (p.slot + 1)
        return { ...p, x1: x, y1: oy + bodyH, x2: x, y2: heightMm - half, tx: x, ty: heightMm - half }
      }
    }
  })

  return { widthMm, heightMm, body: { x: ox, y: oy, w: bodyW, h: bodyH }, pins: laid, title }
}

export function generateSchematicSvg(part: Part): string {
  if (part.schematic.mode === 'custom' && part.schematic.customSvg) return part.schematic.customSvg
  const lay = schematicLayout(part)
  const out: string[] = []
  out.push(`<g id="schematic">`)
  out.push(
    el('rect', {
      x: fmt(lay.body.x + SCH.BODY_STROKE / 2),
      y: fmt(lay.body.y + SCH.BODY_STROKE / 2),
      width: fmt(lay.body.w - SCH.BODY_STROKE),
      height: fmt(lay.body.h - SCH.BODY_STROKE),
      fill: 'none',
      stroke: '#000000',
      'stroke-width': fmt(SCH.BODY_STROKE)
    })
  )
  // title
  out.push(
    el(
      'text',
      {
        id: 'label',
        x: fmt(lay.body.x + lay.body.w / 2),
        y: fmt(lay.body.y + SCH.GRID + SCH.TITLE_SIZE * 0.35),
        'font-family': SCH.FONT,
        'font-size': fmt(SCH.TITLE_SIZE),
        'font-weight': 'bold',
        'text-anchor': 'middle',
        fill: '#000000'
      },
      esc(lay.title)
    )
  )

  const fs = SCH.LABEL_SIZE
  const ns = SCH.NUMBER_SIZE
  for (const p of lay.pins) {
    const id = fzConnectorId(p.connector, p.index)
    out.push(
      el('line', {
        id: `${id}pin`,
        class: 'pin',
        x1: fmt(p.x1),
        y1: fmt(p.y1),
        x2: fmt(p.x2),
        y2: fmt(p.y2),
        fill: 'none',
        stroke: SCH.PIN_COLOR,
        'stroke-width': fmt(SCH.STROKE),
        'stroke-linecap': 'round'
      })
    )
    out.push(
      el('rect', {
        id: `${id}terminal`,
        class: 'terminal',
        x: fmt(p.tx - SCH.STROKE / 2),
        y: fmt(p.ty - SCH.STROKE / 2),
        width: fmt(SCH.STROKE),
        height: fmt(SCH.STROKE),
        fill: 'none',
        stroke: 'none'
      })
    )
    const textAttrs = { 'font-family': SCH.FONT, 'font-size': fmt(fs), fill: SCH.LABEL_COLOR }
    const numAttrs = { 'font-family': SCH.FONT, 'font-size': fmt(ns), fill: SCH.LABEL_COLOR }
    switch (p.side) {
      case 'left':
        if (part.schematic.showLabels)
          out.push(el('text', { x: fmt(lay.body.x + 1), y: fmt(p.y1 + fs * 0.35), 'text-anchor': 'start', ...textAttrs }, esc(p.label)))
        if (part.schematic.showNumbers && p.number)
          out.push(el('text', { x: fmt(lay.body.x - 0.4), y: fmt(p.y1 - 0.4), 'text-anchor': 'end', ...numAttrs }, esc(p.number)))
        break
      case 'right':
        if (part.schematic.showLabels)
          out.push(
            el('text', { x: fmt(lay.body.x + lay.body.w - 1), y: fmt(p.y1 + fs * 0.35), 'text-anchor': 'end', ...textAttrs }, esc(p.label))
          )
        if (part.schematic.showNumbers && p.number)
          out.push(el('text', { x: fmt(lay.body.x + lay.body.w + 0.4), y: fmt(p.y1 - 0.4), 'text-anchor': 'start', ...numAttrs }, esc(p.number)))
        break
      case 'top':
        if (part.schematic.showLabels)
          out.push(
            el(
              'text',
              {
                x: fmt(p.x1 + fs * 0.35),
                y: fmt(lay.body.y + 1),
                'text-anchor': 'end',
                transform: `rotate(-90 ${fmt(p.x1 + fs * 0.35)} ${fmt(lay.body.y + 1)})`,
                ...textAttrs
              },
              esc(p.label)
            )
          )
        if (part.schematic.showNumbers && p.number)
          out.push(el('text', { x: fmt(p.x1 + 0.4), y: fmt(lay.body.y - 0.4), 'text-anchor': 'start', ...numAttrs }, esc(p.number)))
        break
      case 'bottom':
        if (part.schematic.showLabels)
          out.push(
            el(
              'text',
              {
                x: fmt(p.x1 + fs * 0.35),
                y: fmt(lay.body.y + lay.body.h - 1),
                'text-anchor': 'start',
                transform: `rotate(-90 ${fmt(p.x1 + fs * 0.35)} ${fmt(lay.body.y + lay.body.h - 1)})`,
                ...textAttrs
              },
              esc(p.label)
            )
          )
        if (part.schematic.showNumbers && p.number)
          out.push(
            el('text', { x: fmt(p.x1 + 0.4), y: fmt(lay.body.y + lay.body.h + ns + 0.2), 'text-anchor': 'start', ...numAttrs }, esc(p.number))
          )
        break
    }
  }
  out.push(`</g>`)
  return svgRoot(lay.widthMm, lay.heightMm, out.join('\n'), { comment: `Generated by Fritterzing: ${part.metadata.title} schematic` })
}
