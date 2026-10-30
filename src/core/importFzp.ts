/**
 * Import an existing Fritzing part (FZP + SVGs) into the project model, so it
 * can be inspected, repaired and re-exported.
 */
import type { Artwork, Connector, Gender, Part, ViewName } from './model'
import { createConnector, createPart } from './model'
import { parseXml } from './xml'
import { measureSvg, svgDocInfo } from './svgGeom'
import { newModuleId } from './ids'
import type { UnpackedFzpz } from './fzpz'

export interface ImportedViewInfo {
  image: string | null
  layers: string[]
}

export interface ImportedConnectorView {
  layer: string
  svgId: string
  terminalId: string | null
  legId: string | null
}

export interface ParsedFzp {
  moduleId: string
  fritzingVersion: string
  title: string
  label: string
  author: string
  version: string
  date: string
  url: string
  description: string
  tags: string[]
  properties: Record<string, string>
  views: Partial<Record<ViewName, ImportedViewInfo>>
  connectors: Array<{
    id: string
    name: string
    type: string
    description: string
    views: Partial<Record<ViewName, ImportedConnectorView[]>>
  }>
  buses: Array<{ id: string; members: string[] }>
}

const VIEW_TAG: Record<string, ViewName> = {
  breadboardView: 'breadboard',
  schematicView: 'schematic',
  pcbView: 'pcb',
  iconView: 'icon'
}

function text(parent: Element | Document, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0]
  return el?.textContent?.trim() ?? ''
}

export function parseFzp(fzpText: string): ParsedFzp {
  const doc = parseXml(fzpText)
  const root = doc.documentElement
  if (root.localName !== 'module') throw new Error('This is not a Fritzing part definition (no <module> root).')

  const properties: Record<string, string> = {}
  const propsEl = root.getElementsByTagName('properties')[0]
  if (propsEl) {
    for (const p of Array.from(propsEl.getElementsByTagName('property'))) {
      const name = p.getAttribute('name')
      if (name) properties[name] = p.textContent?.trim() ?? ''
    }
  }
  const tags: string[] = []
  const tagsEl = root.getElementsByTagName('tags')[0]
  if (tagsEl) for (const t of Array.from(tagsEl.getElementsByTagName('tag'))) if (t.textContent?.trim()) tags.push(t.textContent.trim())

  const views: ParsedFzp['views'] = {}
  const viewsEl = Array.from(root.children).find((c) => c.localName === 'views')
  if (viewsEl) {
    for (const v of Array.from(viewsEl.children)) {
      const name = VIEW_TAG[v.localName]
      if (!name) continue
      const layersEl = v.getElementsByTagName('layers')[0]
      const layers = layersEl ? Array.from(layersEl.getElementsByTagName('layer')).map((l) => l.getAttribute('layerId') ?? '') : []
      views[name] = { image: layersEl?.getAttribute('image') ?? null, layers: layers.filter(Boolean) }
    }
  }

  const connectors: ParsedFzp['connectors'] = []
  const connsEl = Array.from(root.children).find((c) => c.localName === 'connectors')
  if (connsEl) {
    for (const c of Array.from(connsEl.children)) {
      if (c.localName !== 'connector') continue
      const cviews: ParsedFzp['connectors'][number]['views'] = {}
      const vs = Array.from(c.children).find((x) => x.localName === 'views')
      if (vs) {
        for (const v of Array.from(vs.children)) {
          const name = VIEW_TAG[v.localName]
          if (!name) continue
          cviews[name] = Array.from(v.getElementsByTagName('p')).map((p) => ({
            layer: p.getAttribute('layer') ?? '',
            svgId: p.getAttribute('svgId') ?? '',
            terminalId: p.getAttribute('terminalId'),
            legId: p.getAttribute('legId')
          }))
        }
      }
      connectors.push({
        id: c.getAttribute('id') ?? '',
        name: c.getAttribute('name') ?? '',
        type: c.getAttribute('type') ?? '',
        description: text(c, 'description'),
        views: cviews
      })
    }
  }

  const buses: ParsedFzp['buses'] = []
  const busesEl = Array.from(root.children).find((c) => c.localName === 'buses')
  if (busesEl) {
    for (const b of Array.from(busesEl.getElementsByTagName('bus'))) {
      buses.push({
        id: b.getAttribute('id') ?? '',
        members: Array.from(b.getElementsByTagName('nodeMember')).map((n) => n.getAttribute('connectorId') ?? '')
      })
    }
  }

  return {
    moduleId: root.getAttribute('moduleId') ?? '',
    fritzingVersion: root.getAttribute('fritzingVersion') ?? '',
    title: text(root, 'title'),
    label: text(root, 'label'),
    author: text(root, 'author'),
    version: text(root, 'version'),
    date: text(root, 'date'),
    url: text(root, 'url'),
    description: text(root, 'description'),
    tags,
    properties,
    views,
    connectors,
    buses
  }
}

export interface ImportResult {
  part: Part
  notes: string[]
}

function genderFromType(t: string): Gender {
  const s = t.toLowerCase()
  if (s === 'male' || s === 'female' || s === 'pad') return s
  return 'female'
}

function svgDataUrl(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/svg+xml;base64,${btoa(bin)}`
}

/** Build a project from an unpacked fzpz. */
export function importFzpz(unpacked: UnpackedFzpz, fileName: string): ImportResult {
  const notes: string[] = []
  const fzp = parseFzp(unpacked.fzp)
  const title = fzp.title || fileName.replace(/\.fzpz$/i, '')
  const part = createPart(title, {
    label: fzp.label,
    author: fzp.author,
    version: fzp.version || '1',
    date: fzp.date || new Date().toISOString().slice(0, 10),
    url: fzp.url,
    description: fzp.description,
    tags: fzp.tags,
    family: fzp.properties['family'] ?? '',
    partNumber: fzp.properties['part number'] ?? fzp.properties['mpn'] ?? fzp.properties['mn'] ?? '',
    manufacturer: fzp.properties['manufacturer'] ?? fzp.properties['mfr'] ?? '',
    licence: fzp.properties['licence'] ?? fzp.properties['license'] ?? ''
  })
  part.moduleId = newModuleId(title)
  part.imported = { originalModuleId: fzp.moduleId, fileName }

  // Breadboard artwork: the original breadboard SVG, kept as-is, unless it is
  // merely a picture wrapped in SVG, in which case the picture is extracted.
  const bb = unpacked.svgs.breadboard
  let artwork: Artwork | null = null
  let unwrapped: UnwrappedRaster | null = null
  if (bb) {
    try {
      const doc = parseXml(bb.text)
      const bbInfo = svgDocInfo(doc)
      unwrapped = tryUnwrapRaster(doc, bbInfo)
      if (unwrapped) {
        artwork = {
          kind: 'raster',
          mime: unwrapped.mime,
          fileName: bb.name.replace(/\.svg$/i, '') + (unwrapped.mime === 'image/jpeg' ? '.jpg' : '.png'),
          dataUrl: unwrapped.dataUrl,
          svgText: null,
          pixelWidth: unwrapped.w,
          pixelHeight: unwrapped.h,
          widthMm: bbInfo.scaleX * unwrapped.w,
          heightMm: bbInfo.scaleY * unwrapped.h,
          rotation: 0,
          crop: null,
          locked: false
        }
        notes.push('The breadboard graphic was a picture wrapped in SVG. The picture was extracted so it can be cropped, rotated and rescaled.')
      } else {
        artwork = {
          kind: 'svg',
          mime: 'image/svg+xml',
          fileName: bb.name,
          dataUrl: svgDataUrl(bb.text),
          svgText: bb.text,
          pixelWidth: bbInfo.viewBox.w,
          pixelHeight: bbInfo.viewBox.h,
          widthMm: bbInfo.widthMm,
          heightMm: bbInfo.heightMm,
          rotation: 0,
          crop: null,
          locked: false
        }
      }
    } catch (e) {
      notes.push(`The breadboard graphic could not be read: ${(e as Error).message}`)
    }
  } else {
    notes.push('The part has no breadboard graphic. Drop an image to add one.')
  }
  part.artwork = artwork

  // Measure connector positions in the breadboard svg.
  const bbIds: string[] = []
  for (const c of fzp.connectors) for (const p of c.views.breadboard ?? []) bbIds.push(p.svgId, p.terminalId ?? '')
  const measured = bb && artwork ? safeMeasure(bb.text, bbIds.filter(Boolean)) : null
  // Offset from viewBox units to the artwork's natural pixel space.
  const offX = (measured?.info.viewBox.x ?? 0) + (unwrapped?.x ?? 0)
  const offY = (measured?.info.viewBox.y ?? 0) + (unwrapped?.y ?? 0)

  const wiringOnly = isWiringOnly(fzp)
  const pcbSvg = unpacked.svgs.pcb
  const schSvg = unpacked.svgs.schematic
  const iconSvg = unpacked.svgs.icon

  let missingBb = 0
  fzp.connectors.forEach((fc, i) => {
    const c: Connector = createConnector({
      name: fc.name,
      number: i + 1,
      description: fc.description === fc.name ? '' : fc.description,
      kind: 'generic',
      gender: genderFromType(fc.type),
      fzId: /^[A-Za-z_][\w.-]*$/.test(fc.id) ? fc.id : null
    })
    const bbp = fc.views.breadboard?.[0]
    if (bbp && measured && artwork) {
      const pinBox = measured.boxes.get(bbp.svgId)
      const termBox = bbp.terminalId ? measured.boxes.get(bbp.terminalId) : undefined
      const centre = termBox ?? pinBox
      if (centre) {
        const w = pinBox ? Math.max(1e-3, pinBox.box.w) : 1
        const h = pinBox ? Math.max(1e-3, pinBox.box.h) : 1
        c.breadboard = { x: centre.cx - offX, y: centre.cy - offY, w, h }
      } else missingBb++
    } else missingBb++
    const sp = fc.views.schematic?.[0]
    if (sp && schSvg) {
      c.importedIds.schematic = { svgId: sp.svgId, terminalId: sp.terminalId ?? undefined, layers: ['schematic'] }
    }
    const pcbPs = fc.views.pcb ?? []
    if (pcbPs.length && pcbSvg && !wiringOnly) {
      c.importedIds.pcb = { svgId: pcbPs[0].svgId, layers: pcbPs.map((p) => p.layer).filter(Boolean) }
    }
    part.connectors.push(c)
  })
  if (missingBb > 0) notes.push(`${missingBb} connector(s) had no usable breadboard graphic element; click their positions on the artwork.`)

  if (schSvg) {
    part.schematic = { ...part.schematic, mode: 'custom', customSvg: schSvg.text }
  } else {
    notes.push('No schematic graphic was found; a schematic symbol will be generated.')
  }
  if (!wiringOnly && pcbSvg) {
    const layers = fzp.views.pcb?.layers ?? []
    part.pcb = { ...part.pcb, mode: 'custom', customSvg: pcbSvg.text, smd: layers.includes('copper1') && !layers.includes('copper0') }
  } else {
    part.pcb = { ...part.pcb, mode: 'none' }
    if (!wiringOnly && !pcbSvg) notes.push('No PCB graphic was found; the part is set to "not PCB mounted".')
  }
  if (iconSvg) {
    if (iconSvg.text.length > 300_000 || (bb && iconSvg.text === bb.text)) {
      notes.push(`The icon graphic was a ${(iconSvg.text.length / 1_048_576).toFixed(1)} MB copy of the breadboard picture. A proper 32 px icon will be generated instead.`)
    } else part.icon = { mode: 'custom', customSvg: iconSvg.text }
  }

  return { part, notes }
}

interface UnwrappedRaster {
  dataUrl: string
  mime: string
  x: number
  y: number
  w: number
  h: number
}

const GRAPHIC_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'use', 'image'])

/**
 * If the SVG is nothing but one embedded raster plus connector target
 * shapes (the pattern Fritterzing itself produces), return the raster.
 */
function tryUnwrapRaster(doc: Document, info: ReturnType<typeof svgDocInfo>): UnwrappedRaster | null {
  const images = Array.from(doc.getElementsByTagName('image'))
  if (images.length !== 1) return null
  const img = images[0]
  const href = img.getAttribute('href') ?? img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif|bmp));base64,/i.exec(href)
  if (!m) return null
  for (let e: Element | null = img; e && e !== doc.documentElement; e = e.parentElement) if (e.getAttribute('transform')) return null
  const x = parseFloat(img.getAttribute('x') ?? '0') || 0
  const y = parseFloat(img.getAttribute('y') ?? '0') || 0
  const w = parseFloat(img.getAttribute('width') ?? '')
  const h = parseFloat(img.getAttribute('height') ?? '')
  if (!(w > 0 && h > 0)) return null
  // The picture should cover (most of) the drawing.
  if (w < info.viewBox.w * 0.9 || h < info.viewBox.h * 0.9) return null
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el === img || !GRAPHIC_TAGS.has(el.localName)) continue
    const id = el.getAttribute('id') ?? ''
    if (/^connector\d+(pin|terminal|leg)$/.test(id)) continue
    return null
  }
  return { dataUrl: href, mime: m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase(), x, y, w, h }
}

function safeMeasure(svg: string, ids: string[]): ReturnType<typeof measureSvg> | null {
  try {
    return measureSvg(svg, ids)
  } catch {
    return null
  }
}

function isWiringOnly(fzp: ParsedFzp): boolean {
  const pcb = fzp.views.pcb
  if (!pcb) return true
  const bbImage = fzp.views.breadboard?.image
  if (pcb.image && bbImage && pcb.image === bbImage) return true
  return !pcb.layers.some((l) => l.startsWith('copper'))
}
