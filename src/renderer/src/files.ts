/**
 * Opening things: images become artwork, .fpe projects load, .fzpz parts
 * import, .fzp definitions import together with any SVGs dropped alongside.
 */
import type { Artwork, Part } from '@core/model'
import { createPart } from '@core/model'
import { bytesToDataUrl, loadProject, saveProject } from '@core/project'
import { unpackFzpz, type UnpackedFzpz } from '@core/fzpz'
import { importFzpz } from '@core/importFzp'
import { splitSvg } from '@core/svg/common'
import { svgLengthToMm } from '@core/units'
import { compilePart, type CompiledPart } from '@core/compile'
import { loadImage, bakeRaster } from './raster'
import { baseName, extOf, type LoadedFile } from './platform'

const IMAGE_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
}

export type Opened =
  | { kind: 'project'; part: Part }
  | { kind: 'import'; part: Part; notes: string[] }
  | { kind: 'artwork'; artwork: Artwork }

export function classify(name: string): 'project' | 'fzpz' | 'fzp' | 'image' | 'svg' | 'unknown' {
  const ext = extOf(name)
  if (ext === 'fpe') return 'project'
  if (ext === 'fzpz') return 'fzpz'
  if (ext === 'fzp') return 'fzp'
  if (ext === 'svg') return 'svg'
  if (IMAGE_EXT[ext]) return 'image'
  return 'unknown'
}

export async function artworkFromFile(name: string, bytes: Uint8Array, defaultWidthMm = 50): Promise<Artwork> {
  const ext = extOf(name)
  const mime = IMAGE_EXT[ext] ?? 'image/png'
  if (ext === 'svg') {
    const text = new TextDecoder().decode(bytes)
    const info = splitSvg(text)
    if (!info) throw new Error(`${name} is not a valid SVG file.`)
    const vb = info.viewBox
    const pxW = vb?.w ?? parseFloat(info.widthAttr ?? '') ?? 100
    const pxH = vb?.h ?? parseFloat(info.heightAttr ?? '') ?? 100
    const pixelWidth = Number.isFinite(pxW) && pxW > 0 ? pxW : 100
    const pixelHeight = Number.isFinite(pxH) && pxH > 0 ? pxH : 100
    const hasPhysical = !!info.widthAttr && !/px$|^\d*\.?\d+$/.test(info.widthAttr.trim())
    const widthMm = hasPhysical ? svgLengthToMm(info.widthAttr, defaultWidthMm) : defaultWidthMm
    const heightMm = hasPhysical ? svgLengthToMm(info.heightAttr, (widthMm * pixelHeight) / pixelWidth) : (widthMm * pixelHeight) / pixelWidth
    return {
      kind: 'svg',
      mime,
      fileName: name,
      dataUrl: bytesToDataUrl(bytes, mime),
      svgText: text,
      pixelWidth,
      pixelHeight,
      widthMm,
      heightMm,
      rotation: 0,
      crop: null,
      locked: false
    }
  }
  const dataUrl = bytesToDataUrl(bytes, mime)
  const img = await loadImage(dataUrl)
  const pixelWidth = img.naturalWidth || 1
  const pixelHeight = img.naturalHeight || 1
  return {
    kind: 'raster',
    mime,
    fileName: name,
    dataUrl,
    svgText: null,
    pixelWidth,
    pixelHeight,
    widthMm: defaultWidthMm,
    heightMm: (defaultWidthMm * pixelHeight) / pixelWidth,
    rotation: 0,
    crop: null,
    locked: false
  }
}

/** Open one file (plus companions dropped with it, used for bare .fzp imports). */
export async function openFile(file: LoadedFile, companions: LoadedFile[] = []): Promise<Opened> {
  switch (classify(file.name)) {
    case 'project':
      return { kind: 'project', part: await loadProject(file.bytes) }
    case 'fzpz': {
      const unpacked = await unpackFzpz(file.bytes)
      const r = importFzpz(unpacked, file.name)
      return { kind: 'import', part: r.part, notes: r.notes }
    }
    case 'fzp': {
      const fzp = new TextDecoder().decode(file.bytes)
      const unpacked: UnpackedFzpz = { fzpName: file.name, fzp, svgs: {}, others: [] }
      const notes: string[] = []
      for (const c of companions) {
        if (extOf(c.name) !== 'svg') continue
        const lower = c.name.toLowerCase()
        const view = (['breadboard', 'schematic', 'pcb', 'icon'] as const).find((v) => lower.includes(v) || fzp.includes(`${v}/${c.name}`))
        if (view && !unpacked.svgs[view]) unpacked.svgs[view] = { name: c.name, text: new TextDecoder().decode(c.bytes) }
      }
      if (!unpacked.svgs.breadboard) notes.push('Drop the breadboard SVG together with the .fzp file to recover its graphics.')
      const r = importFzpz(unpacked, file.name)
      return { kind: 'import', part: r.part, notes: [...notes, ...r.notes] }
    }
    case 'image':
    case 'svg':
      return { kind: 'artwork', artwork: await artworkFromFile(file.name, file.bytes) }
    default:
      throw new Error(`${file.name} is not a supported file. Drop a PNG, JPEG, SVG, .fzpz, .fzp or .fpe file.`)
  }
}

export function newPartFromArtwork(artwork: Artwork): Part {
  const part = createPart(baseName(artwork.fileName))
  part.artwork = artwork
  return part
}

/** Compile with baked raster artwork (crop/rotation applied to pixels). */
export async function compileForExport(part: Part): Promise<CompiledPart> {
  const baked = part.artwork ? await bakeRaster(part.artwork) : null
  return compilePart(part, { bakedRaster: baked })
}

export async function projectBytes(part: Part): Promise<Uint8Array> {
  let compiled: CompiledPart | null = null
  try {
    compiled = await compileForExport(part)
  } catch {
    compiled = null
  }
  return saveProject(part, compiled)
}
