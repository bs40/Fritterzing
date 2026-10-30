/**
 * Top-level commands: new/open/save/export. Shared by the toolbar, menus,
 * keyboard shortcuts and drag-and-drop.
 */
import { packFolderZip, packFzpz } from '@core/fzpz'
import { summarize, validatePart } from '@core/validate'
import type { Part } from '@core/model'
import { compileForExport, newPartFromArtwork, openFile, projectBytes } from './files'
import { FILTERS, platform, type LoadedFile } from './platform'
import { useStore } from './store'

const S = useStore

export async function openFiles(files: LoadedFile[]): Promise<void> {
  const st = S.getState()
  if (files.length === 0) return
  // Prefer a project/part if several files were dropped together.
  const primary =
    files.find((f) => /\.fpe$/i.test(f.name)) ?? files.find((f) => /\.fzpz$/i.test(f.name)) ?? files.find((f) => /\.fzp$/i.test(f.name)) ?? files[0]
  const companions = files.filter((f) => f !== primary)
  try {
    const opened = await openFile(primary, companions)
    switch (opened.kind) {
      case 'project':
        if (!(await confirmDiscard())) return
        st.loadPart(opened.part, { path: primary.path, name: primary.name })
        st.notify(`Opened ${primary.name}`, 'success')
        break
      case 'import':
        if (!(await confirmDiscard())) return
        st.loadPart(opened.part, { path: null, name: null })
        st.setImportNotes(opened.notes)
        st.openDialog('importNotes')
        break
      case 'artwork': {
        const cur = S.getState().part
        if (!cur) {
          const part = newPartFromArtwork(opened.artwork)
          st.loadPart(part)
          st.openDialog('new', { fromArtwork: true })
        } else if (!cur.artwork) {
          st.update((p) => ({ ...p, artwork: opened.artwork }))
          st.notify('Artwork added. Set its real width in the Artwork panel.', 'success')
        } else {
          st.openDialog('artworkChoice', opened.artwork)
        }
        break
      }
    }
  } catch (e) {
    st.notify((e as Error).message, 'error')
  }
}

export async function openWithDialog(): Promise<void> {
  const f = await platform.openFile(FILTERS.openAny)
  if (f) await openFiles([f])
}

export async function confirmDiscard(): Promise<boolean> {
  const st = S.getState()
  if (!st.part || !st.dirty) return true
  return new Promise((resolve) => {
    st.openDialog('confirmDiscard', { resolve })
  })
}

export function defaultFileBase(part: Part): string {
  return (part.metadata.title || 'part').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'part'
}

export async function saveProjectAs(): Promise<boolean> {
  const st = S.getState()
  if (!st.part) return false
  const bytes = await projectBytes(st.part)
  const path = await platform.saveFileAs(`${defaultFileBase(st.part)}.fpe`, FILTERS.project, bytes)
  if (!path) return false
  st.markSaved(platform.isElectron ? path : null, path.split(/[\\/]/).pop() ?? path)
  st.notify(`Saved ${path.split(/[\\/]/).pop()}`, 'success')
  return true
}

export async function saveProject(): Promise<boolean> {
  const st = S.getState()
  if (!st.part) return false
  if (!st.filePath || !platform.isElectron) return saveProjectAs()
  const bytes = await projectBytes(st.part)
  await platform.writeFile(st.filePath, bytes)
  st.markSaved(st.filePath, st.fileName)
  st.notify(`Saved ${st.fileName}`, 'success')
  return true
}

/** Validate; if there are errors, show them instead of exporting. */
async function readyToExport(): Promise<{ part: Part; compiled: Awaited<ReturnType<typeof compileForExport>> } | null> {
  const st = S.getState()
  if (!st.part) return null
  const compiled = await compileForExport(st.part)
  const issues = validatePart(st.part, compiled)
  st.setIssues(issues)
  const sum = summarize(issues)
  if (sum.level === 'error') {
    st.openDialog('issues', { blocking: true })
    return null
  }
  return { part: st.part, compiled }
}

export async function exportFzpz(): Promise<void> {
  const st = S.getState()
  try {
    const r = await readyToExport()
    if (!r) return
    const bytes = await packFzpz(r.compiled)
    const path = await platform.saveFileAs(`${defaultFileBase(r.part)}.fzpz`, FILTERS.fzpz, bytes)
    if (path) st.notify(`Exported ${path.split(/[\\/]/).pop()}. Import it in Fritzing with File > Open or drag it onto the parts bin.`, 'success')
  } catch (e) {
    st.notify(`Export failed: ${(e as Error).message}`, 'error')
  }
}

export type SingleExport = 'breadboard' | 'schematic' | 'pcb' | 'icon' | 'fzp' | 'folder'

export async function exportSingle(what: SingleExport): Promise<void> {
  const st = S.getState()
  try {
    const r = await readyToExport()
    if (!r) return
    const base = defaultFileBase(r.part)
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
    let name = ''
    let bytes: Uint8Array
    let filters = FILTERS.svg
    switch (what) {
      case 'breadboard':
        name = `${base}_breadboard.svg`
        bytes = enc(r.compiled.breadboard)
        break
      case 'schematic':
        name = `${base}_schematic.svg`
        bytes = enc(r.compiled.schematic)
        break
      case 'pcb':
        if (!r.compiled.pcb) {
          st.notify('This part is not PCB mounted, so there is no PCB graphic. Change that in PCB view.', 'info')
          return
        }
        name = `${base}_pcb.svg`
        bytes = enc(r.compiled.pcb)
        break
      case 'icon':
        name = `${base}_icon.svg`
        bytes = enc(r.compiled.icon)
        break
      case 'fzp':
        name = `${base}.fzp`
        bytes = enc(r.compiled.fzp)
        filters = FILTERS.fzp
        break
      default: {
        name = `${base}_fritzing_part.zip`
        filters = FILTERS.zip
        const files = r.compiled.files.map((f) => ({
          path: f.archiveName.startsWith('part.') ? f.fileName : `svg/${f.archiveName.split('.')[1]}/${f.fileName}`,
          content: f.content
        }))
        bytes = await packFolderZip(files)
      }
    }
    const path = await platform.saveFileAs(name, filters, bytes)
    if (path) st.notify(`Exported ${path.split(/[\\/]/).pop()}`, 'success')
  } catch (e) {
    st.notify(`Export failed: ${(e as Error).message}`, 'error')
  }
}

export async function filesFromDrop(dt: DataTransfer): Promise<LoadedFile[]> {
  const out: LoadedFile[] = []
  for (const f of Array.from(dt.files)) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    let path: string | null = null
    try {
      path = window.fritterzing?.pathForFile(f) ?? null
    } catch {
      path = null
    }
    out.push({ path, name: f.name, bytes })
  }
  return out
}
