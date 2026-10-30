/**
 * Compile a project into the complete set of Fritzing files, with the
 * naming conventions an .fzpz archive expects:
 *
 *   part.<base>.fzp
 *   svg.breadboard.<base>_breadboard.svg
 *   svg.schematic.<base>_schematic.svg
 *   svg.pcb.<base>_pcb.svg          (PCB-mounted parts only)
 *   svg.icon.<base>_icon.svg
 */
import type { Part } from './model'
import { fileNames, generateFzp } from './fzp'
import { generateBreadboardSvg, type BakedRaster } from './svg/breadboard'
import { generateSchematicSvg } from './svg/schematic'
import { generatePcbSvg } from './svg/pcb'
import { generateIconSvg } from './svg/icon'
import { ensureLayer } from './svg/common'

export interface CompileOptions {
  bakedRaster?: BakedRaster | null
}

export interface CompiledFile {
  /** name inside the fzpz archive */
  archiveName: string
  /** name Fritzing stores it under (after stripping the prefix) */
  fileName: string
  content: string
}

export interface CompiledPart {
  base: string
  moduleId: string
  fzp: string
  breadboard: string
  schematic: string
  pcb: string | null
  icon: string
  files: CompiledFile[]
}

export function compilePart(part: Part, opts: CompileOptions = {}): CompiledPart {
  const names = fileNames(part)
  const breadboard = generateBreadboardSvg(part, { bakedRaster: opts.bakedRaster })
  let schematic = generateSchematicSvg(part)
  if (part.schematic.mode === 'custom') schematic = ensureLayer(schematic, 'schematic').svg
  let pcb = generatePcbSvg(part)
  if (pcb && part.pcb.mode === 'custom') {
    pcb = ensureLayer(pcb, part.pcb.smd ? 'copper1' : 'copper0').svg
    pcb = ensureLayer(pcb, 'silkscreen').svg
  }
  let icon = generateIconSvg(part, opts.bakedRaster)
  if (part.icon.mode === 'custom') icon = ensureLayer(icon, 'icon').svg
  const fzp = generateFzp(part)

  const files: CompiledFile[] = [
    { archiveName: `part.${names.base}.fzp`, fileName: `${names.base}.fzp`, content: fzp },
    { archiveName: `svg.breadboard.${names.breadboard}`, fileName: names.breadboard, content: breadboard },
    { archiveName: `svg.schematic.${names.schematic}`, fileName: names.schematic, content: schematic },
    { archiveName: `svg.icon.${names.icon}`, fileName: names.icon, content: icon }
  ]
  if (pcb && names.pcb) files.push({ archiveName: `svg.pcb.${names.pcb}`, fileName: names.pcb, content: pcb })

  return { base: names.base, moduleId: part.moduleId, fzp, breadboard, schematic, pcb, icon, files }
}
