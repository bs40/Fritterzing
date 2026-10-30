/** FZPZ packaging (zip) and unpacking. */
import JSZip from 'jszip'
import type { CompiledPart } from './compile'
import type { ViewName } from './model'

export async function packFzpz(compiled: CompiledPart): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const f of compiled.files) zip.file(f.archiveName, f.content)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export interface UnpackedFzpz {
  fzpName: string
  fzp: string
  svgs: Partial<Record<ViewName, { name: string; text: string }>>
  /** unrecognised files in the archive */
  others: string[]
}

const PREFIX: Array<[string, ViewName]> = [
  ['svg.breadboard.', 'breadboard'],
  ['svg.schematic.', 'schematic'],
  ['svg.pcb.', 'pcb'],
  ['svg.icon.', 'icon']
]

export async function unpackFzpz(bytes: Uint8Array): Promise<UnpackedFzpz> {
  const zip = await JSZip.loadAsync(bytes)
  let fzpName = ''
  let fzp = ''
  const svgs: UnpackedFzpz['svgs'] = {}
  const others: string[] = []
  const unassigned: Array<{ name: string; text: string }> = []

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const name = entry.name.split('/').pop() ?? entry.name
    const lower = name.toLowerCase()
    if (lower.endsWith('.fzp')) {
      if (!fzp || lower.startsWith('part.')) {
        fzpName = name
        fzp = await entry.async('string')
      }
      continue
    }
    if (lower.endsWith('.svg')) {
      const text = await entry.async('string')
      const hit = PREFIX.find(([p]) => lower.startsWith(p))
      if (hit) svgs[hit[1]] = { name: name.slice(hit[0].length), text }
      else unassigned.push({ name, text })
      continue
    }
    others.push(name)
  }
  if (!fzp) throw new Error('This archive does not contain a Fritzing part definition (.fzp file).')

  // Fall back: match unprefixed svgs via the fzp image paths or name hints.
  for (const u of unassigned) {
    const lower = u.name.toLowerCase()
    const guess: ViewName | undefined = (['breadboard', 'schematic', 'pcb', 'icon'] as ViewName[]).find(
      (v) => !svgs[v] && (lower.includes(v) || fzp.includes(`${v}/${u.name}`))
    )
    if (guess) svgs[guess] = u
    else others.push(u.name)
  }
  return { fzpName, fzp, svgs, others }
}

/** Also expose a simple zip builder for the "unpacked folder" export. */
export async function packFolderZip(files: Array<{ path: string; content: string | Uint8Array }>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.content)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
