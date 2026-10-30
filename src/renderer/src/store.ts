/**
 * Editor state. The part is treated as immutable: every change produces a
 * new Part object, and undo history simply keeps references to old ones.
 */
import { create } from 'zustand'
import type { Artwork, Connector, ConnectorKind, Metadata, Part, PcbConfig, SchematicConfig, ViewName } from '@core/model'
import type { Pt } from '@core/artwork'
import type { Issue } from '@core/validate'

export type Tool = 'select' | 'add' | 'group' | 'calibrate' | 'crop' | 'preview'

export type DialogId =
  | 'new'
  | 'metadata'
  | 'group'
  | 'calibrate'
  | 'issues'
  | 'about'
  | 'importNotes'
  | 'artworkChoice'
  | 'confirmDiscard'
  | 'exportMenu'
  | 'restore'
  | 'help'
  | null

export interface Notice {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
}

export interface GroupSpec {
  count: number
  names: string[]
  startNumber: number
  reverse: boolean
  kind: ConnectorKind
}

export interface PreviewWire {
  id: number
  from: string
  to: string | Pt
}

interface State {
  part: Part | null
  filePath: string | null
  fileName: string | null
  dirty: boolean
  past: Part[]
  future: Part[]
  dragSnapshot: Part | null
  selection: string[]
  view: ViewName
  tool: Tool
  lastKind: ConnectorKind
  groupSpec: GroupSpec | null
  groupFirst: Pt | null
  calibratePts: Pt[]
  dialog: DialogId
  dialogData: unknown
  notices: Notice[]
  importNotes: string[]
  issues: Issue[]
  focusNameToken: number
  previewWires: PreviewWire[]
  showLabels: boolean
}

interface Actions {
  loadPart(part: Part, file?: { path?: string | null; name?: string | null }): void
  closePart(): void
  update(fn: (p: Part) => Part): void
  replace(part: Part): void
  updateConnector(id: string, patch: Partial<Connector> | ((c: Connector) => Partial<Connector>)): void
  updateConnectors(ids: string[], fn: (c: Connector) => Partial<Connector>): void
  updateArtwork(fn: (a: Artwork) => Artwork): void
  updateMetadata(patch: Partial<Metadata>): void
  updateSchematic(patch: Partial<SchematicConfig>): void
  updatePcb(patch: Partial<PcbConfig>): void
  addConnector(c: Connector, select?: boolean): void
  addConnectors(cs: Connector[]): void
  deleteConnectors(ids: string[]): void
  beginDrag(): void
  dragUpdate(fn: (p: Part) => Part): void
  endDrag(): void
  undo(): void
  redo(): void
  select(ids: string[], additive?: boolean): void
  setView(v: ViewName): void
  setTool(t: Tool): void
  setLastKind(k: ConnectorKind): void
  openDialog(id: DialogId, data?: unknown): void
  closeDialog(): void
  notify(text: string, kind?: Notice['kind']): void
  dismissNotice(id: number): void
  markSaved(path: string | null, name: string | null): void
  setGroupSpec(spec: GroupSpec | null): void
  setGroupFirst(pt: Pt | null): void
  setCalibratePts(pts: Pt[]): void
  setImportNotes(notes: string[]): void
  setIssues(issues: Issue[]): void
  addPreviewWire(w: Omit<PreviewWire, 'id'>): void
  removePreviewWire(id: number): void
  clearPreviewWires(): void
  setShowLabels(v: boolean): void
}

export type Store = State & Actions

const MAX_HISTORY = 200
let noticeSeq = 1
let wireSeq = 1

export const useStore = create<Store>((set, get) => ({
  part: null,
  filePath: null,
  fileName: null,
  dirty: false,
  past: [],
  future: [],
  dragSnapshot: null,
  selection: [],
  view: 'breadboard',
  tool: 'select',
  lastKind: 'generic',
  groupSpec: null,
  groupFirst: null,
  calibratePts: [],
  dialog: null,
  dialogData: null,
  notices: [],
  importNotes: [],
  issues: [],
  focusNameToken: 0,
  previewWires: [],
  showLabels: true,

  loadPart: (part, file) =>
    set({
      part,
      filePath: file?.path ?? null,
      fileName: file?.name ?? null,
      dirty: false,
      past: [],
      future: [],
      selection: [],
      view: 'breadboard',
      tool: 'select',
      previewWires: [],
      groupFirst: null,
      calibratePts: []
    }),
  closePart: () => set({ part: null, filePath: null, fileName: null, dirty: false, past: [], future: [], selection: [], previewWires: [] }),

  update: (fn) => {
    const { part, past } = get()
    if (!part) return
    const next = fn(part)
    if (next === part) return
    set({ part: next, past: [...past.slice(-MAX_HISTORY + 1), part], future: [], dirty: true })
  },
  replace: (next) => get().update(() => next),
  updateConnector: (id, patch) =>
    get().update((p) => ({
      ...p,
      connectors: p.connectors.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c))
    })),
  updateConnectors: (ids, fn) =>
    get().update((p) => ({ ...p, connectors: p.connectors.map((c) => (ids.includes(c.id) ? { ...c, ...fn(c) } : c)) })),
  updateArtwork: (fn) => get().update((p) => (p.artwork ? { ...p, artwork: fn(p.artwork) } : p)),
  updateMetadata: (patch) => get().update((p) => ({ ...p, metadata: { ...p.metadata, ...patch } })),
  updateSchematic: (patch) => get().update((p) => ({ ...p, schematic: { ...p.schematic, ...patch } })),
  updatePcb: (patch) => get().update((p) => ({ ...p, pcb: { ...p.pcb, ...patch } })),
  addConnector: (c, select = true) => {
    get().update((p) => ({ ...p, connectors: [...p.connectors, c] }))
    if (select) set({ selection: [c.id], focusNameToken: get().focusNameToken + 1 })
  },
  addConnectors: (cs) => {
    get().update((p) => ({ ...p, connectors: [...p.connectors, ...cs] }))
    set({ selection: cs.map((c) => c.id) })
  },
  deleteConnectors: (ids) => {
    get().update((p) => ({ ...p, connectors: p.connectors.filter((c) => !ids.includes(c.id)) }))
    set({ selection: get().selection.filter((s) => !ids.includes(s)) })
  },

  beginDrag: () => set({ dragSnapshot: get().part }),
  dragUpdate: (fn) => {
    const { part } = get()
    if (!part) return
    set({ part: fn(part) })
  },
  endDrag: () => {
    const { dragSnapshot, part, past } = get()
    if (dragSnapshot && part && dragSnapshot !== part) {
      set({ past: [...past.slice(-MAX_HISTORY + 1), dragSnapshot], future: [], dirty: true, dragSnapshot: null })
    } else set({ dragSnapshot: null })
  },
  undo: () => {
    const { past, part, future } = get()
    if (!part || past.length === 0) return
    const prev = past[past.length - 1]
    set({ part: prev, past: past.slice(0, -1), future: [part, ...future], dirty: true })
    const ids = new Set(prev.connectors.map((c) => c.id))
    set({ selection: get().selection.filter((s) => ids.has(s)) })
  },
  redo: () => {
    const { past, part, future } = get()
    if (!part || future.length === 0) return
    const next = future[0]
    set({ part: next, past: [...past, part], future: future.slice(1), dirty: true })
    const ids = new Set(next.connectors.map((c) => c.id))
    set({ selection: get().selection.filter((s) => ids.has(s)) })
  },

  select: (ids, additive = false) => {
    if (!additive) return set({ selection: ids })
    const cur = get().selection
    const next = [...cur]
    for (const id of ids) {
      const i = next.indexOf(id)
      if (i >= 0) next.splice(i, 1)
      else next.push(id)
    }
    set({ selection: next })
  },
  setView: (view) => set({ view, tool: 'select' }),
  setTool: (tool) => set({ tool, groupFirst: null, calibratePts: [] }),
  setLastKind: (lastKind) => set({ lastKind }),
  openDialog: (dialog, dialogData = null) => set({ dialog, dialogData }),
  closeDialog: () => set({ dialog: null, dialogData: null }),
  notify: (text, kind = 'info') => {
    const id = noticeSeq++
    set({ notices: [...get().notices, { id, kind, text }] })
    setTimeout(() => get().dismissNotice(id), kind === 'error' ? 9000 : 4000)
  },
  dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  markSaved: (filePath, fileName) => set({ filePath, fileName, dirty: false }),
  setGroupSpec: (groupSpec) => set({ groupSpec }),
  setGroupFirst: (groupFirst) => set({ groupFirst }),
  setCalibratePts: (calibratePts) => set({ calibratePts }),
  setImportNotes: (importNotes) => set({ importNotes }),
  setIssues: (issues) => set({ issues }),
  addPreviewWire: (w) => set({ previewWires: [...get().previewWires, { ...w, id: wireSeq++ }] }),
  removePreviewWire: (id) => set({ previewWires: get().previewWires.filter((w) => w.id !== id) }),
  clearPreviewWires: () => set({ previewWires: [] }),
  setShowLabels: (showLabels) => set({ showLabels })
}))

export function selectedConnectors(s: Store): Connector[] {
  if (!s.part) return []
  return s.part.connectors.filter((c) => s.selection.includes(c.id))
}
