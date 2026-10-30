/**
 * The application-native project model. Fritzing files (FZP + SVGs) are
 * compiled from this; the user never edits them directly.
 */
import { newLocalId, newModuleId, todayIso } from './ids'

export const SCHEMA_VERSION = 1

export type ViewName = 'breadboard' | 'schematic' | 'pcb' | 'icon'
export const VIEW_NAMES: ViewName[] = ['breadboard', 'schematic', 'pcb', 'icon']

export type Gender = 'male' | 'female' | 'pad'

export type ConnectorKind =
  | 'pin'
  | 'socket'
  | 'screw'
  | 'header-pin'
  | 'header-socket'
  | 'pad'
  | 'edge'
  | 'rj'
  | 'usb'
  | 'barrel'
  | 'logical'
  | 'generic'

export type MarkerShape = 'circle' | 'rect' | 'crosshair' | 'pin' | 'target'

export interface ConnectorKindInfo {
  id: ConnectorKind
  label: string
  gender: Gender
  marker: MarkerShape
  /** default target size in mm */
  sizeMm: number
}

export const CONNECTOR_KINDS: ConnectorKindInfo[] = [
  { id: 'generic', label: 'Generic connection point', gender: 'female', marker: 'target', sizeMm: 2 },
  { id: 'pin', label: 'Pin', gender: 'male', marker: 'pin', sizeMm: 1 },
  { id: 'socket', label: 'Socket', gender: 'female', marker: 'circle', sizeMm: 1.5 },
  { id: 'screw', label: 'Screw terminal', gender: 'female', marker: 'target', sizeMm: 3 },
  { id: 'header-pin', label: 'Header pin', gender: 'male', marker: 'rect', sizeMm: 1 },
  { id: 'header-socket', label: 'Header socket', gender: 'female', marker: 'rect', sizeMm: 1.5 },
  { id: 'pad', label: 'Pad', gender: 'pad', marker: 'rect', sizeMm: 1.5 },
  { id: 'edge', label: 'Edge connector', gender: 'male', marker: 'rect', sizeMm: 1.5 },
  { id: 'rj', label: 'RJ socket', gender: 'female', marker: 'rect', sizeMm: 6 },
  { id: 'usb', label: 'USB connector', gender: 'female', marker: 'rect', sizeMm: 5 },
  { id: 'barrel', label: 'Barrel jack', gender: 'female', marker: 'circle', sizeMm: 5 },
  { id: 'logical', label: 'Logical connector', gender: 'female', marker: 'crosshair', sizeMm: 2 }
]

export function kindInfo(kind: ConnectorKind): ConnectorKindInfo {
  return CONNECTOR_KINDS.find((k) => k.id === kind) ?? CONNECTOR_KINDS[0]
}

export type SchematicSide = 'auto' | 'left' | 'right' | 'top' | 'bottom'

/** Where a connector sits on the breadboard artwork, in the artwork's natural pixel space. */
export interface BreadboardAnchor {
  x: number
  y: number
  /** connector target size, natural pixels */
  w: number
  h: number
}

/** Ids that an imported part used in a custom (non-generated) view. */
export interface ImportedViewIds {
  svgId: string
  terminalId?: string
  legId?: string
  layers: string[]
}

export interface Connector {
  id: string
  name: string
  number: number | null
  description: string
  kind: ConnectorKind
  gender: Gender
  breadboard: BreadboardAnchor | null
  marker: MarkerShape
  /** draw a visible marker in the exported breadboard artwork */
  showInArtwork: boolean
  schematic: {
    side: SchematicSide
    order: number
    label: string | null
    hidden: boolean
  }
  /** explicit PCB pad position in mm (only used by the 'custom' PCB template) */
  pcb: { x: number; y: number } | null
  /** override of the generated connectorN id (preserved when importing an existing part) */
  fzId: string | null
  importedIds: Partial<Record<ViewName, ImportedViewIds>>
}

export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export interface Artwork {
  kind: 'raster' | 'svg'
  mime: string
  fileName: string
  /** raster: original bytes as a data URL. svg: data URL of the svg text (for display). */
  dataUrl: string
  svgText: string | null
  /** natural size in pixels (svg: viewBox size) */
  pixelWidth: number
  pixelHeight: number
  /** physical size of the output (after crop and rotation) */
  widthMm: number
  heightMm: number
  rotation: 0 | 90 | 180 | 270
  crop: Crop | null
  locked: boolean
}

export interface SchematicConfig {
  mode: 'generated' | 'custom'
  customSvg: string | null
  title: string | null
  showNumbers: boolean
  showLabels: boolean
  /** extra body width in grid units (0.1 in) */
  extraWidth: number
}

export type PcbTemplate = 'module' | 'dip' | 'sip' | 'header' | 'terminal' | 'custom'

export interface PcbConfig {
  /** none = wiring-only part (not PCB mounted) */
  mode: 'none' | 'generated' | 'custom'
  customSvg: string | null
  template: PcbTemplate
  pitchMm: number
  rowSpacingMm: number
  rows: number
  padDiameterMm: number
  holeDiameterMm: number
  smd: boolean
  outlineWidthMm: number | null
  outlineHeightMm: number | null
  silkLabel: boolean
}

export interface IconConfig {
  mode: 'generated' | 'custom'
  customSvg: string | null
}

export interface Metadata {
  title: string
  label: string
  manufacturer: string
  partNumber: string
  family: string
  description: string
  author: string
  version: string
  url: string
  tags: string[]
  date: string
  licence: string
}

export interface PartSettings {
  snapToGrid: boolean
  gridMm: number
  markerStyle: MarkerShape
}

export interface Part {
  schemaVersion: number
  moduleId: string
  metadata: Metadata
  artwork: Artwork | null
  connectors: Connector[]
  schematic: SchematicConfig
  pcb: PcbConfig
  icon: IconConfig
  settings: PartSettings
  imported: { originalModuleId: string; fileName: string } | null
}

export function defaultMetadata(title = ''): Metadata {
  return {
    title,
    label: '',
    manufacturer: '',
    partNumber: '',
    family: '',
    description: '',
    author: '',
    version: '1',
    url: '',
    tags: [],
    date: todayIso(),
    licence: ''
  }
}

export function defaultSchematic(): SchematicConfig {
  return { mode: 'generated', customSvg: null, title: null, showNumbers: true, showLabels: true, extraWidth: 0 }
}

export function defaultPcb(): PcbConfig {
  return {
    mode: 'none',
    customSvg: null,
    template: 'module',
    pitchMm: 2.54,
    rowSpacingMm: 7.62,
    rows: 1,
    padDiameterMm: 1.8,
    holeDiameterMm: 1.0,
    smd: false,
    outlineWidthMm: null,
    outlineHeightMm: null,
    silkLabel: true
  }
}

export function defaultIcon(): IconConfig {
  return { mode: 'generated', customSvg: null }
}

export function defaultSettings(): PartSettings {
  return { snapToGrid: false, gridMm: 2.54, markerStyle: 'target' }
}

export function createPart(title: string, extra: Partial<Metadata> = {}): Part {
  return {
    schemaVersion: SCHEMA_VERSION,
    moduleId: newModuleId(title || 'part'),
    metadata: { ...defaultMetadata(title), ...extra },
    artwork: null,
    connectors: [],
    schematic: defaultSchematic(),
    pcb: defaultPcb(),
    icon: defaultIcon(),
    settings: defaultSettings(),
    imported: null
  }
}

export function createConnector(init: Partial<Connector> & { kind?: ConnectorKind } = {}): Connector {
  const kind = init.kind ?? 'generic'
  const info = kindInfo(kind)
  return {
    id: newLocalId('c'),
    name: '',
    number: null,
    description: '',
    kind,
    gender: info.gender,
    breadboard: null,
    marker: info.marker,
    showInArtwork: false,
    schematic: { side: 'auto', order: 0, label: null, hidden: false },
    pcb: null,
    fzId: null,
    importedIds: {},
    ...init
  }
}

/** The Fritzing connector id for the connector at `index` (connector0, connector1, ...). */
export function fzConnectorId(c: Connector, index: number): string {
  return c.fzId ?? `connector${index}`
}

export function nextConnectorNumber(part: Part): number {
  let max = 0
  for (const c of part.connectors) if (c.number !== null && c.number > max) max = c.number
  return max + 1
}

export function connectorDisplayName(c: Connector, index: number): string {
  if (c.name.trim()) return c.name.trim()
  if (c.number !== null) return `Connector ${c.number}`
  return `Connector ${index + 1}`
}

/** Deep clone via structured copy (no functions in the model). */
export function clonePart(p: Part): Part {
  return structuredClone(p)
}
