/**
 * FZP compiler: turns the project model into Fritzing's part definition XML.
 * All connectorN / connectorNpin / connectorNterminal ids and layer ids are
 * produced here; the user never types them.
 */
import type { Part, ViewName } from './model'
import { fzConnectorId, connectorDisplayName } from './model'
import { esc } from './xml'
import { pcbLayerIds } from './svg/pcb'

export const FRITZING_VERSION = '1.0.4'

export interface FzpFileNames {
  base: string
  breadboard: string
  schematic: string
  pcb: string | null
  icon: string
}

export function fileNames(part: Part): FzpFileNames {
  const base = part.moduleId
  return {
    base,
    breadboard: `${base}_breadboard.svg`,
    schematic: `${base}_schematic.svg`,
    pcb: part.pcb.mode === 'none' ? null : `${base}_pcb.svg`,
    icon: `${base}_icon.svg`
  }
}

function viewIds(part: Part, view: ViewName, index: number): { svgId: string; terminalId: string | null } {
  const c = part.connectors[index]
  const generated = `${fzConnectorId(c, index)}`
  const custom =
    (view === 'schematic' && part.schematic.mode === 'custom') ||
    (view === 'pcb' && part.pcb.mode === 'custom') ||
    (view === 'icon' && part.icon.mode === 'custom')
  if (custom && c.importedIds[view]) {
    const ids = c.importedIds[view]!
    return { svgId: ids.svgId, terminalId: ids.terminalId ?? null }
  }
  return { svgId: `${generated}pin`, terminalId: `${generated}terminal` }
}

export function generateFzp(part: Part): string {
  const m = part.metadata
  const names = fileNames(part)
  const lines: string[] = []
  const tab = (n: number): string => '  '.repeat(n)

  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<module fritzingVersion="${FRITZING_VERSION}" moduleId="${esc(part.moduleId)}">`)
  lines.push(`${tab(1)}<version>${esc(m.version || '1')}</version>`)
  lines.push(`${tab(1)}<author>${esc(m.author || 'Fritterzing')}</author>`)
  lines.push(`${tab(1)}<title>${esc(m.title || 'Untitled part')}</title>`)
  lines.push(`${tab(1)}<label>${esc(m.label || m.title || 'Part')}</label>`)
  lines.push(`${tab(1)}<date>${esc(m.date)}</date>`)
  if (m.url) lines.push(`${tab(1)}<url>${esc(m.url)}</url>`)
  lines.push(`${tab(1)}<tags>`)
  const tags = m.tags.length ? m.tags : ['fritterzing']
  for (const t of tags) lines.push(`${tab(2)}<tag>${esc(t)}</tag>`)
  lines.push(`${tab(1)}</tags>`)
  lines.push(`${tab(1)}<properties>`)
  lines.push(`${tab(2)}<property name="family">${esc(m.family || m.title || 'custom part')}</property>`)
  if (m.partNumber) lines.push(`${tab(2)}<property name="part number">${esc(m.partNumber)}</property>`)
  if (m.manufacturer) lines.push(`${tab(2)}<property name="manufacturer">${esc(m.manufacturer)}</property>`)
  if (m.licence) lines.push(`${tab(2)}<property name="licence">${esc(m.licence)}</property>`)
  lines.push(`${tab(2)}<property name="layer"></property>`)
  lines.push(`${tab(1)}</properties>`)
  lines.push(`${tab(1)}<description>${esc(m.description)}</description>`)

  lines.push(`${tab(1)}<views>`)
  lines.push(`${tab(2)}<iconView>`)
  lines.push(`${tab(3)}<layers image="icon/${esc(names.icon)}">`)
  lines.push(`${tab(4)}<layer layerId="icon"/>`)
  lines.push(`${tab(3)}</layers>`)
  lines.push(`${tab(2)}</iconView>`)
  lines.push(`${tab(2)}<breadboardView>`)
  lines.push(`${tab(3)}<layers image="breadboard/${esc(names.breadboard)}">`)
  lines.push(`${tab(4)}<layer layerId="breadboard"/>`)
  lines.push(`${tab(3)}</layers>`)
  lines.push(`${tab(2)}</breadboardView>`)
  lines.push(`${tab(2)}<schematicView>`)
  lines.push(`${tab(3)}<layers image="schematic/${esc(names.schematic)}">`)
  lines.push(`${tab(4)}<layer layerId="schematic"/>`)
  lines.push(`${tab(3)}</layers>`)
  lines.push(`${tab(2)}</schematicView>`)
  lines.push(`${tab(2)}<pcbView>`)
  if (names.pcb) {
    lines.push(`${tab(3)}<layers image="pcb/${esc(names.pcb)}">`)
    for (const l of pcbLayerIds(part)) lines.push(`${tab(4)}<layer layerId="${l}"/>`)
    lines.push(`${tab(3)}</layers>`)
  } else {
    // Wiring-only part: reuse the breadboard graphic on the breadboard layer so
    // the part is valid but is not placed on the PCB (Fritzing's breadboard idiom).
    lines.push(`${tab(3)}<layers image="breadboard/${esc(names.breadboard)}">`)
    lines.push(`${tab(4)}<layer layerId="breadboard"/>`)
    lines.push(`${tab(3)}</layers>`)
  }
  lines.push(`${tab(2)}</pcbView>`)
  lines.push(`${tab(1)}</views>`)

  lines.push(`${tab(1)}<connectors>`)
  part.connectors.forEach((c, i) => {
    const id = fzConnectorId(c, i)
    const type = part.pcb.mode !== 'none' && part.pcb.smd ? 'pad' : c.gender
    lines.push(`${tab(2)}<connector id="${esc(id)}" name="${esc(connectorDisplayName(c, i))}" type="${type}">`)
    lines.push(`${tab(3)}<description>${esc(c.description || connectorDisplayName(c, i))}</description>`)
    lines.push(`${tab(3)}<views>`)
    const bb = viewIds(part, 'breadboard', i)
    lines.push(`${tab(4)}<breadboardView>`)
    lines.push(`${tab(5)}<p layer="breadboard" svgId="${esc(bb.svgId)}" terminalId="${esc(bb.terminalId ?? '')}"/>`)
    lines.push(`${tab(4)}</breadboardView>`)
    if (!c.schematic.hidden) {
      const sc = viewIds(part, 'schematic', i)
      lines.push(`${tab(4)}<schematicView>`)
      lines.push(
        `${tab(5)}<p layer="schematic" svgId="${esc(sc.svgId)}"${sc.terminalId ? ` terminalId="${esc(sc.terminalId)}"` : ''}/>`
      )
      lines.push(`${tab(4)}</schematicView>`)
    }
    lines.push(`${tab(4)}<pcbView>`)
    if (part.pcb.mode === 'none') {
      lines.push(`${tab(5)}<p layer="breadboard" svgId="${esc(bb.svgId)}" terminalId="${esc(bb.terminalId ?? '')}"/>`)
    } else {
      const pc = viewIds(part, 'pcb', i)
      const layers =
        part.pcb.mode === 'custom' && c.importedIds.pcb?.layers.length ? c.importedIds.pcb.layers : part.pcb.smd ? ['copper1'] : ['copper0', 'copper1']
      for (const l of layers) lines.push(`${tab(5)}<p layer="${esc(l)}" svgId="${esc(pc.svgId)}"/>`)
    }
    lines.push(`${tab(4)}</pcbView>`)
    lines.push(`${tab(3)}</views>`)
    lines.push(`${tab(2)}</connector>`)
  })
  lines.push(`${tab(1)}</connectors>`)
  lines.push(`</module>`)
  return lines.join('\n') + '\n'
}
