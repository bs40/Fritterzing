/**
 * The native editable project format (.fpe): a zip containing
 *   project.json          the model (artwork bytes kept out)
 *   source/<artwork>      the original artwork, untouched
 *   generated/*           the compiled Fritzing files, for convenience
 */
import JSZip from 'jszip'
import type { Part } from './model'
import { SCHEMA_VERSION, createPart } from './model'
import type { CompiledPart } from './compile'

export const FPE_VERSION = 1

/** Editor state stored next to the part (used by autosave recovery). */
export interface ProjectMeta {
  title: string
  filePath: string | null
  fileName: string | null
  savedAt: string
  reason: 'save' | 'autosave'
}

interface ProjectJson {
  fpeVersion: number
  app: string
  meta?: ProjectMeta
  part: Omit<Part, 'artwork'> & { artwork: (Omit<Part['artwork'] & object, 'dataUrl' | 'svgText'> & { source: string }) | null }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(',')
  const meta = dataUrl.slice(0, idx)
  const data = dataUrl.slice(idx + 1)
  if (/;base64/i.test(meta)) {
    const bin = atob(data)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return new TextEncoder().encode(decodeURIComponent(data))
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(bin)}`
}

export async function saveProject(part: Part, compiled?: CompiledPart | null, meta?: ProjectMeta): Promise<Uint8Array> {
  const zip = new JSZip()
  let artworkJson: ProjectJson['part']['artwork'] = null
  if (part.artwork) {
    const { dataUrl, svgText, ...rest } = part.artwork
    const source = `source/${part.artwork.fileName || 'artwork'}`
    if (part.artwork.kind === 'svg' && svgText) zip.file(source, svgText)
    else zip.file(source, dataUrlToBytes(dataUrl))
    artworkJson = { ...rest, source }
  }
  const json: ProjectJson = { fpeVersion: FPE_VERSION, app: 'Fritterzing', meta, part: { ...part, artwork: artworkJson } }
  zip.file('project.json', JSON.stringify(json, null, 2))
  if (compiled) for (const f of compiled.files) zip.file(`generated/${f.fileName}`, f.content)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Read only the editor metadata of a project file (cheap; no artwork decoding). */
export async function readProjectMeta(bytes: Uint8Array): Promise<ProjectMeta | null> {
  try {
    const zip = await JSZip.loadAsync(bytes)
    const entry = zip.file('project.json')
    if (!entry) return null
    const json = JSON.parse(await entry.async('string')) as ProjectJson
    return json.meta ?? (json.part ? { title: json.part.metadata?.title ?? '', filePath: null, fileName: null, savedAt: '', reason: 'autosave' } : null)
  } catch {
    return null
  }
}

export async function loadProject(bytes: Uint8Array): Promise<Part> {
  const zip = await JSZip.loadAsync(bytes)
  const entry = zip.file('project.json')
  if (!entry) throw new Error('This is not a Fritterzing project (project.json is missing).')
  const json = JSON.parse(await entry.async('string')) as ProjectJson
  if (!json.part) throw new Error('The project file has no part data.')
  const base = createPart('')
  const stored = json.part
  let artwork: Part['artwork'] = null
  if (stored.artwork) {
    const src = zip.file(stored.artwork.source)
    if (!src) throw new Error(`The project is missing its artwork file (${stored.artwork.source}).`)
    const { source, ...rest } = stored.artwork
    if (rest.kind === 'svg') {
      const svgText = await src.async('string')
      artwork = { ...rest, svgText, dataUrl: bytesToDataUrl(new TextEncoder().encode(svgText), 'image/svg+xml') }
    } else {
      const data = await src.async('uint8array')
      artwork = { ...rest, svgText: null, dataUrl: bytesToDataUrl(data, rest.mime || 'image/png') }
    }
  }
  // Merge with defaults so older project files still load.
  const part: Part = {
    ...base,
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    metadata: { ...base.metadata, ...stored.metadata },
    schematic: { ...base.schematic, ...stored.schematic },
    pcb: { ...base.pcb, ...stored.pcb },
    icon: { ...base.icon, ...stored.icon },
    settings: { ...base.settings, ...stored.settings },
    connectors: (stored.connectors ?? []).map((c) => ({
      ...c,
      importedIds: c.importedIds ?? {},
      schematic: Object.assign({ side: 'auto' as const, order: 0, label: null, hidden: false }, c.schematic ?? {})
    })),
    artwork
  }
  return part
}
