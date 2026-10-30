/**
 * Live validation in plain language. Every recoverable problem names a fix
 * that `applyFix` can perform with one click.
 */
import type { Part, ViewName } from './model'
import { connectorDisplayName, fzConnectorId, defaultSchematic, defaultPcb, defaultIcon } from './model'
import type { CompiledPart } from './compile'
import { naturalToMm, outputSizePx } from './artwork'
import { allIds, hasId, ensureLayer } from './svg/common'
import { parseXml } from './xml'
import { newModuleId } from './ids'

export type Severity = 'error' | 'warning' | 'info'

export type FixId =
  | 'name-connectors'
  | 'dedupe-names'
  | 'renumber'
  | 'regenerate-schematic'
  | 'regenerate-pcb'
  | 'regenerate-icon'
  | 'add-layers'
  | 'set-pcb-none'
  | 'regenerate-module-id'
  | 'default-size'
  | 'remove-unplaced'

export interface Issue {
  id: string
  severity: Severity
  message: string
  connectorId?: string
  view?: ViewName
  fix?: FixId
  fixLabel?: string
}

export interface ValidationSummary {
  level: 'ok' | 'warning' | 'error'
  label: string
  errors: number
  warnings: number
}

export function summarize(issues: Issue[]): ValidationSummary {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  if (errors) return { level: 'error', label: errors === 1 ? '1 problem' : `${errors} problems`, errors, warnings }
  if (warnings) return { level: 'warning', label: warnings === 1 ? '1 issue' : `${warnings} issues`, errors, warnings }
  return { level: 'ok', label: 'Ready to export', errors, warnings }
}

const UNSUPPORTED = [
  ['<tspan', 'text spans (tspan)'],
  ['<flowRoot', 'flowed text (flowRoot)'],
  ['<clipPath', 'clip paths'],
  ['<mask', 'masks'],
  ['<filter', 'filters'],
  ['<foreignObject', 'foreign objects'],
  ['<pattern', 'patterns']
] as const

export function validatePart(part: Part, compiled?: CompiledPart | null): Issue[] {
  const issues: Issue[] = []
  const add = (i: Issue): number => issues.push(i)
  const art = part.artwork

  if (!part.metadata.title.trim()) add({ id: 'no-title', severity: 'error', message: 'The part has no name. Enter a part name in Metadata.' })
  if (!/^[A-Za-z_][\w.-]*$/.test(part.moduleId))
    add({ id: 'bad-module-id', severity: 'error', message: 'The internal part ID contains unsafe characters.', fix: 'regenerate-module-id', fixLabel: 'Generate a new ID' })

  if (!art) {
    add({ id: 'no-artwork', severity: 'error', message: 'There is no breadboard artwork. Drop a PNG, JPEG or SVG onto the canvas.', view: 'breadboard' })
  } else {
    if (!(art.widthMm > 0.5 && art.heightMm > 0.5))
      add({ id: 'tiny', severity: 'error', message: 'The physical size is too small. Set the real width of the component in millimetres.', view: 'breadboard', fix: 'default-size', fixLabel: 'Use 50 mm wide' })
    else if (art.widthMm > 1000 || art.heightMm > 1000)
      add({ id: 'huge', severity: 'warning', message: 'The physical size is over a metre. Check the width you entered.', view: 'breadboard' })
    if (art.kind === 'raster' && art.dataUrl.length > 6_000_000)
      add({ id: 'big-raster', severity: 'warning', message: 'The artwork image is very large (over 4 MB). Fritzing will be slower; consider a smaller image.', view: 'breadboard' })
    if (art.kind === 'svg' && art.svgText) {
      for (const [needle, label] of UNSUPPORTED)
        if (art.svgText.includes(needle))
          add({ id: `unsupported-${needle}`, severity: 'warning', message: `The artwork uses ${label}, which Fritzing may not render.`, view: 'breadboard' })
    }
  }

  if (part.connectors.length === 0) {
    add({ id: 'no-connectors', severity: 'warning', message: 'The part has no connections yet. Click "Add connector", then click the image where a wire attaches.', view: 'breadboard' })
  }

  const names = new Map<string, string[]>()
  const numbers = new Map<number, string[]>()
  const fzIds = new Map<string, string[]>()
  const unplaced: string[] = []
  part.connectors.forEach((c, i) => {
    const dn = connectorDisplayName(c, i)
    if (!c.breadboard) {
      unplaced.push(c.id)
      add({ id: `unplaced-${c.id}`, severity: 'error', message: `${dn} has no connection point in Breadboard View. Select it and click its position on the image.`, connectorId: c.id, view: 'breadboard' })
    } else if (art) {
      const o = outputSizePx(art)
      const p = naturalToMm(art, c.breadboard)
      if (p.x < 0 || p.y < 0 || p.x > art.widthMm || p.y > art.heightMm || o.w <= 0)
        add({ id: `outside-${c.id}`, severity: 'warning', message: `${dn} lies outside the artwork; wires will attach off the image.`, connectorId: c.id, view: 'breadboard' })
    }
    if (!c.name.trim()) add({ id: `unnamed-${c.id}`, severity: 'warning', message: `${dn} has no name yet.`, connectorId: c.id, fix: 'name-connectors', fixLabel: 'Name unnamed connectors' })
    const key = dn.toLowerCase()
    names.set(key, [...(names.get(key) ?? []), c.id])
    if (c.number !== null) numbers.set(c.number, [...(numbers.get(c.number) ?? []), c.id])
    const fid = fzConnectorId(c, i)
    fzIds.set(fid, [...(fzIds.get(fid) ?? []), c.id])
  })
  for (const [name, ids] of names)
    if (ids.length > 1)
      add({ id: `dup-name-${name}`, severity: 'error', message: `${ids.length} connectors are called "${name}". Fritzing needs every connector name to be unique.`, connectorId: ids[1], fix: 'dedupe-names', fixLabel: 'Make names unique' })
  for (const [n, ids] of numbers)
    if (ids.length > 1) add({ id: `dup-number-${n}`, severity: 'warning', message: `${ids.length} connectors have the number ${n}.`, connectorId: ids[1], fix: 'renumber', fixLabel: 'Renumber in order' })
  for (const [id, ids] of fzIds)
    if (ids.length > 1) add({ id: `dup-fzid-${id}`, severity: 'error', message: `Two connectors share the internal ID ${id}.`, connectorId: ids[1], fix: 'renumber', fixLabel: 'Reassign internal IDs' })

  // overlapping connectors
  if (art) {
    const placed = part.connectors.filter((c) => c.breadboard)
    for (let a = 0; a < placed.length; a++)
      for (let b = a + 1; b < placed.length; b++) {
        const pa = naturalToMm(art, placed[a].breadboard!)
        const pb = naturalToMm(art, placed[b].breadboard!)
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 0.3) {
          const ia = part.connectors.indexOf(placed[a])
          const ib = part.connectors.indexOf(placed[b])
          add({ id: `overlap-${placed[a].id}-${placed[b].id}`, severity: 'warning', message: `${connectorDisplayName(placed[a], ia)} and ${connectorDisplayName(placed[b], ib)} are at the same spot.`, connectorId: placed[b].id, view: 'breadboard' })
        }
      }
  }

  // custom views
  if (part.schematic.mode === 'custom') {
    if (!part.schematic.customSvg) add({ id: 'sch-missing', severity: 'error', message: 'The custom schematic graphic is missing.', view: 'schematic', fix: 'regenerate-schematic', fixLabel: 'Generate a schematic' })
    else checkCustomSvg(part, 'schematic', part.schematic.customSvg, ['schematic'], add)
  }
  if (part.pcb.mode === 'custom') {
    if (!part.pcb.customSvg) add({ id: 'pcb-missing', severity: 'error', message: 'The custom PCB graphic is missing.', view: 'pcb', fix: 'regenerate-pcb', fixLabel: 'Generate a PCB footprint' })
    else checkCustomSvg(part, 'pcb', part.pcb.customSvg, part.pcb.smd ? ['copper1'] : ['copper0', 'copper1'], add)
  }
  if (part.icon.mode === 'custom' && !part.icon.customSvg)
    add({ id: 'icon-missing', severity: 'warning', message: 'The custom icon is missing.', view: 'icon', fix: 'regenerate-icon', fixLabel: 'Generate an icon' })
  if (part.icon.mode === 'custom' && part.icon.customSvg && part.icon.customSvg.length > 300_000)
    add({
      id: 'icon-huge',
      severity: 'warning',
      message: `The icon graphic is very large (${(part.icon.customSvg.length / 1_048_576).toFixed(1)} MB). Fritzing loads it for every parts-bin thumbnail; a small generated icon is better.`,
      view: 'icon',
      fix: 'regenerate-icon',
      fixLabel: 'Generate a small icon'
    })
  if (part.schematic.mode === 'custom' && part.schematic.customSvg && part.schematic.customSvg.length > 1_000_000)
    add({ id: 'sch-huge', severity: 'warning', message: 'The schematic graphic is over 1 MB, which will make Fritzing sluggish.', view: 'schematic', fix: 'regenerate-schematic', fixLabel: 'Generate a schematic instead' })
  if (part.pcb.mode === 'generated' && part.pcb.template !== 'module' && part.pcb.template !== 'custom' && part.connectors.length === 0)
    add({ id: 'pcb-empty', severity: 'info', message: 'The PCB footprint has no pads because there are no connectors.', view: 'pcb' })

  // Compiled output checks (catch anything the generators or custom files got wrong).
  if (compiled) checkCompiled(part, compiled, add)

  return dedupe(issues)
}

function checkCustomSvg(part: Part, view: ViewName, svg: string, layers: string[], add: (i: Issue) => number): void {
  const fix: FixId = view === 'schematic' ? 'regenerate-schematic' : view === 'pcb' ? 'regenerate-pcb' : 'regenerate-icon'
  const label = view === 'schematic' ? 'Schematic' : view === 'pcb' ? 'PCB' : 'Icon'
  try {
    parseXml(svg)
  } catch (e) {
    add({ id: `${view}-malformed`, severity: 'error', message: `The ${label} graphic is not valid SVG: ${(e as Error).message}`, view, fix, fixLabel: `Generate ${label.toLowerCase()} instead` })
    return
  }
  for (const l of layers)
    if (!hasId(svg, l)) add({ id: `${view}-layer-${l}`, severity: 'warning', message: `The ${label} graphic is missing the ${l} layer group. It will be added on export.`, view, fix: 'add-layers', fixLabel: 'Add the layer now' })
  part.connectors.forEach((c, i) => {
    if (view === 'schematic' && c.schematic.hidden) return
    const ids = c.importedIds[view]
    const svgId = ids?.svgId ?? `${fzConnectorId(c, i)}pin`
    if (!hasId(svg, svgId))
      add({
        id: `${view}-noid-${c.id}`,
        severity: 'error',
        message: `${connectorDisplayName(c, i)} has no connection point in ${label} View.`,
        connectorId: c.id,
        view,
        fix,
        fixLabel: `Generate ${label.toLowerCase()} instead`
      })
  })
  for (const [needle, what] of UNSUPPORTED)
    if (svg.includes(needle)) add({ id: `${view}-unsupported-${needle}`, severity: 'warning', message: `The ${label} graphic uses ${what}, which Fritzing may not render.`, view })
}

function checkCompiled(part: Part, compiled: CompiledPart, add: (i: Issue) => number): void {
  const svgs: Array<[ViewName, string]> = [
    ['breadboard', compiled.breadboard],
    ['schematic', compiled.schematic],
    ['icon', compiled.icon]
  ]
  if (compiled.pcb) svgs.push(['pcb', compiled.pcb])
  const idSets = new Map<ViewName, Set<string>>()
  for (const [view, svg] of svgs) {
    try {
      parseXml(svg)
    } catch (e) {
      add({ id: `compiled-${view}-malformed`, severity: 'error', message: `The generated ${view} graphic is not valid XML: ${(e as Error).message}`, view })
      continue
    }
    const ids = allIds(svg)
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) add({ id: `compiled-${view}-dupid-${id}`, severity: 'error', message: `The ${view} graphic contains the id "${id}" more than once.`, view })
      seen.add(id)
    }
    idSets.set(view, seen)
  }
  try {
    const doc = parseXml(compiled.fzp)
    const tagToView: Record<string, ViewName> = { breadboardView: 'breadboard', schematicView: 'schematic', pcbView: 'pcb', iconView: 'icon' }
    for (const c of Array.from(doc.getElementsByTagName('connector'))) {
      const cid = c.getAttribute('id') ?? ''
      const idx = part.connectors.findIndex((pc, i) => fzConnectorId(pc, i) === cid)
      const model = idx >= 0 ? part.connectors[idx] : null
      for (const p of Array.from(c.getElementsByTagName('p'))) {
        const viewTag = p.parentElement?.localName ?? ''
        let view = tagToView[viewTag]
        if (!view) continue
        if (view === 'pcb' && part.pcb.mode === 'none') view = 'breadboard'
        const ids = idSets.get(view)
        if (!ids) continue
        for (const attr of ['svgId', 'terminalId', 'legId']) {
          const v = p.getAttribute(attr)
          if (v && !ids.has(v))
            add({
              id: `ref-${view}-${cid}-${attr}`,
              severity: 'error',
              message: `${model ? connectorDisplayName(model, idx) : cid} refers to "${v}" which does not exist in the ${view} graphic.`,
              connectorId: model?.id,
              view
            })
        }
      }
    }
  } catch (e) {
    add({ id: 'fzp-malformed', severity: 'error', message: `The generated part definition is not valid XML: ${(e as Error).message}` })
  }
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>()
  return issues.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
}

/** Apply a one-click repair. Returns a new part. */
export function applyFix(part: Part, fix: FixId): Part {
  const p = structuredClone(part)
  switch (fix) {
    case 'name-connectors':
      p.connectors.forEach((c, i) => {
        if (!c.name.trim()) c.name = c.number !== null ? `Pin ${c.number}` : `Pin ${i + 1}`
      })
      break
    case 'dedupe-names': {
      const used = new Set<string>()
      p.connectors.forEach((c, i) => {
        let base = connectorDisplayName(c, i)
        let name = base
        let n = 2
        while (used.has(name.toLowerCase())) name = `${base} ${n++}`
        used.add(name.toLowerCase())
        c.name = name
        base = name
      })
      break
    }
    case 'renumber':
      p.connectors.forEach((c, i) => {
        c.number = i + 1
        c.fzId = null
      })
      break
    case 'regenerate-schematic':
      p.schematic = { ...defaultSchematic(), title: p.schematic.title, showLabels: p.schematic.showLabels, showNumbers: p.schematic.showNumbers }
      break
    case 'regenerate-pcb':
      p.pcb = { ...defaultPcb(), mode: 'generated' }
      break
    case 'set-pcb-none':
      p.pcb = { ...p.pcb, mode: 'none' }
      break
    case 'regenerate-icon':
      p.icon = defaultIcon()
      break
    case 'add-layers':
      if (p.schematic.mode === 'custom' && p.schematic.customSvg) p.schematic.customSvg = ensureLayer(p.schematic.customSvg, 'schematic').svg
      if (p.pcb.mode === 'custom' && p.pcb.customSvg) {
        p.pcb.customSvg = ensureLayer(p.pcb.customSvg, p.pcb.smd ? 'copper1' : 'copper0').svg
        p.pcb.customSvg = ensureLayer(p.pcb.customSvg, 'silkscreen').svg
      }
      if (p.icon.mode === 'custom' && p.icon.customSvg) p.icon.customSvg = ensureLayer(p.icon.customSvg, 'icon').svg
      break
    case 'regenerate-module-id':
      p.moduleId = newModuleId(p.metadata.title)
      break
    case 'default-size':
      if (p.artwork) {
        const o = outputSizePx(p.artwork)
        const ratio = o.w > 0 ? o.h / o.w : 1
        p.artwork.widthMm = 50
        p.artwork.heightMm = 50 * ratio
      }
      break
    case 'remove-unplaced':
      p.connectors = p.connectors.filter((c) => c.breadboard)
      break
  }
  return p
}

/** All fixes that the current issues offer, in a stable order (for "Repair all"). */
export function availableFixes(issues: Issue[]): FixId[] {
  const out: FixId[] = []
  for (const i of issues) if (i.fix && !out.includes(i.fix)) out.push(i.fix)
  return out
}
