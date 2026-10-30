import { useMemo, type ReactNode } from 'react'
import { CONNECTOR_KINDS, connectorDisplayName, fzConnectorId, kindInfo, type Connector, type ConnectorKind, type Gender, type MarkerShape, type PcbTemplate, type SchematicSide } from '@core/model'
import { mmToNatural, naturalToMm, rotated, sizeToMm, sizeToPx, withCrop, withHeightMm, withWidthMm } from '@core/artwork'
import { NAME_PRESETS } from '@core/presets'
import { resolveSchematicPins } from '@core/svg/schematic'
import { round } from '@core/units'
import { useStore } from '../store'

function useSelected(): Connector[] {
  const part = useStore((s) => s.part)
  const selection = useStore((s) => s.selection)
  return useMemo(() => (part ? part.connectors.filter((c) => selection.includes(c.id)) : []), [part, selection])
}
import { Check, NumberField, Select, TextField } from './fields'
import { FILTERS, platform } from '../platform'
import { artworkFromFile } from '../files'
import { duplicateSelection } from '../ops'

export function Inspector(): ReactNode {
  const view = useStore((s) => s.view)
  const selection = useStore((s) => s.selection)
  switch (view) {
    case 'schematic':
      return <SchematicInspector />
    case 'pcb':
      return <PcbInspector />
    case 'icon':
      return <IconInspector />
    default:
      if (selection.length === 1) return <ConnectorInspector />
      if (selection.length > 1) return <MultiInspector />
      return <ArtworkInspector />
  }
}

const KIND_OPTIONS = CONNECTOR_KINDS.map((k) => ({ value: k.id, label: k.label }))
const MARKER_OPTIONS: Array<{ value: MarkerShape; label: string }> = [
  { value: 'target', label: 'Target' },
  { value: 'circle', label: 'Circle' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'crosshair', label: 'Crosshair' },
  { value: 'pin', label: 'Pin' }
]
const SIDE_OPTIONS: Array<{ value: SchematicSide; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' }
]

function ConnectorInspector(): ReactNode {
  const part = useStore((s) => s.part)!
  const sel = useSelected()
  const focusNameToken = useStore((s) => s.focusNameToken)
  const updateConnector = useStore((s) => s.updateConnector)
  const deleteConnectors = useStore((s) => s.deleteConnectors)
  const setLastKind = useStore((s) => s.setLastKind)
  const c = sel[0]
  const idx = part.connectors.indexOf(c)
  const art = part.artwork
  const posMm = c.breadboard && art ? naturalToMm(art, c.breadboard) : null
  const wMm = c.breadboard && art ? sizeToMm(art, c.breadboard.w) : null
  const hMm = c.breadboard && art ? sizeToMm(art, c.breadboard.h) : null
  const fzId = fzConnectorId(c, idx)
  const existing = useMemo(() => part.connectors.map((x) => x.name), [part.connectors])

  const setPos = (x: number | null, y: number | null): void => {
    if (!art || !c.breadboard || !posMm) return
    const n = mmToNatural(art, { x: x ?? posMm.x, y: y ?? posMm.y })
    updateConnector(c.id, { breadboard: { ...c.breadboard, x: n.x, y: n.y } })
  }

  return (
    <div key={c.id}>
      <h3>Connector {c.number ?? idx + 1}</h3>
      <datalist id="name-presets">
        {NAME_PRESETS.filter((n) => !existing.includes(n)).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <TextField label="Name" value={c.name} placeholder="e.g. Track A, GND, SDA" list="name-presets" autoFocusToken={focusNameToken} onCommit={(name) => updateConnector(c.id, { name })} />
      <div className="two-col">
        <NumberField label="Number" value={c.number} allowEmpty decimals={0} step={1} onCommit={(number) => updateConnector(c.id, { number: number === null ? null : Math.round(number) })} />
        <Select<ConnectorKind>
          label="Type"
          value={c.kind}
          options={KIND_OPTIONS}
          onChange={(kind) => {
            const info = kindInfo(kind)
            setLastKind(kind)
            updateConnector(c.id, { kind, gender: info.gender, marker: info.marker })
          }}
        />
      </div>
      <TextField label="Description" value={c.description} multiline placeholder="What this connection is for" onCommit={(description) => updateConnector(c.id, { description })} />

      <h3>Electrical</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        {(['male', 'female', 'pad'] as Gender[]).map((g) => (
          <label key={g} className="row" style={{ cursor: 'pointer' }}>
            <input type="radio" name="gender" checked={c.gender === g} onChange={() => updateConnector(c.id, { gender: g })} />
            <span style={{ textTransform: 'capitalize' }}>{g}</span>
          </label>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 11, marginBottom: 8 }}>
        Male = pin that plugs in, Female = socket a wire or pin plugs into, Pad = surface contact.
      </div>

      <h3>Position</h3>
      {c.breadboard && posMm ? (
        <>
          <div className="two-col">
            <NumberField label="X" value={posMm.x} unit="mm" step={0.1} onCommit={(v) => setPos(v, null)} />
            <NumberField label="Y" value={posMm.y} unit="mm" step={0.1} onCommit={(v) => setPos(null, v)} />
            <NumberField label="Width" value={wMm} unit="mm" min={0.2} step={0.1} onCommit={(v) => art && updateConnector(c.id, { breadboard: { ...c.breadboard!, w: sizeToPx(art, v ?? 1) } })} />
            <NumberField label="Height" value={hMm} unit="mm" min={0.2} step={0.1} onCommit={(v) => art && updateConnector(c.id, { breadboard: { ...c.breadboard!, h: sizeToPx(art, v ?? 1) } })} />
          </div>
          <div className="faint" style={{ fontSize: 11, marginBottom: 8 }}>
            Arrow keys move 1 mm, Shift+arrows 0.1 mm.
          </div>
        </>
      ) : (
        <div className="dim" style={{ marginBottom: 8 }}>
          Not placed yet.{' '}
          <button className="small" onClick={() => art && updateConnector(c.id, { breadboard: { x: art.pixelWidth / 2, y: art.pixelHeight / 2, w: sizeToPx(art, 2), h: sizeToPx(art, 2) } })}>
            Place at centre
          </button>{' '}
          then drag it into place.
        </div>
      )}
      <div className="two-col">
        <Select<MarkerShape> label="Marker" value={c.marker} options={MARKER_OPTIONS} onChange={(marker) => updateConnector(c.id, { marker })} />
        <Select<SchematicSide> label="Schematic side" value={c.schematic.side} options={SIDE_OPTIONS} onChange={(side) => updateConnector(c.id, { schematic: { ...c.schematic, side } })} />
      </div>
      <Check label="Draw a visible marker in the exported artwork" checked={c.showInArtwork} onChange={(showInArtwork) => updateConnector(c.id, { showInArtwork })} />
      <Check label="Hide in schematic" checked={c.schematic.hidden} onChange={(hidden) => updateConnector(c.id, { schematic: { ...c.schematic, hidden } })} />

      <details className="collapsible">
        <summary>Fritzing advanced</summary>
        <TextField label="Internal connector ID" value={c.fzId ?? ''} placeholder={fzId} mono onCommit={(v) => updateConnector(c.id, { fzId: v.trim() ? v.trim().replace(/[^\w.-]/g, '_') : null })} />
        <label className="field">
          <span>SVG pin ID</span>
          <input type="text" className="mono" readOnly value={`${fzId}pin`} />
        </label>
        <label className="field">
          <span>SVG terminal ID</span>
          <input type="text" className="mono" readOnly value={`${fzId}terminal`} />
        </label>
        {c.importedIds.schematic && (
          <div className="faint" style={{ fontSize: 11 }}>
            Imported schematic id: <span className="mono">{c.importedIds.schematic.svgId}</span>
          </div>
        )}
        {c.importedIds.pcb && (
          <div className="faint" style={{ fontSize: 11 }}>
            Imported PCB id: <span className="mono">{c.importedIds.pcb.svgId}</span> ({c.importedIds.pcb.layers.join(', ')})
          </div>
        )}
      </details>
      <hr />
      <div className="row">
        <button onClick={duplicateSelection}>Duplicate</button>
        <button className="danger" onClick={() => deleteConnectors([c.id])}>
          Delete
        </button>
      </div>
    </div>
  )
}

function MultiInspector(): ReactNode {
  const sel = useSelected()
  const updateConnectors = useStore((s) => s.updateConnectors)
  const deleteConnectors = useStore((s) => s.deleteConnectors)
  const ids = sel.map((c) => c.id)
  const same = <T,>(get: (c: Connector) => T, fallback: T): T => (sel.every((c) => get(c) === get(sel[0])) ? get(sel[0]) : fallback)
  return (
    <div>
      <h3>{sel.length} connectors selected</h3>
      <Select<ConnectorKind | ''>
        label="Type"
        value={same((c) => c.kind, '' as ConnectorKind | '')}
        options={[{ value: '', label: '(mixed)' }, ...KIND_OPTIONS]}
        onChange={(kind) => {
          if (!kind) return
          const info = kindInfo(kind)
          updateConnectors(ids, () => ({ kind, gender: info.gender, marker: info.marker }))
        }}
      />
      <Select<Gender | ''>
        label="Gender"
        value={same((c) => c.gender, '' as Gender | '')}
        options={[{ value: '', label: '(mixed)' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'pad', label: 'Pad' }]}
        onChange={(gender) => gender && updateConnectors(ids, () => ({ gender }))}
      />
      <Select<SchematicSide | ''>
        label="Schematic side"
        value={same((c) => c.schematic.side, '' as SchematicSide | '')}
        options={[{ value: '', label: '(mixed)' }, ...SIDE_OPTIONS]}
        onChange={(side) => side && updateConnectors(ids, (c) => ({ schematic: { ...c.schematic, side } }))}
      />
      <Select<MarkerShape | ''>
        label="Marker"
        value={same((c) => c.marker, '' as MarkerShape | '')}
        options={[{ value: '', label: '(mixed)' }, ...MARKER_OPTIONS]}
        onChange={(marker) => marker && updateConnectors(ids, () => ({ marker }))}
      />
      <div className="faint" style={{ fontSize: 11, marginBottom: 8 }}>
        Drag to move all, arrow keys to nudge.
      </div>
      <hr />
      <div className="row">
        <button onClick={duplicateSelection}>Duplicate</button>
        <button className="danger" onClick={() => deleteConnectors(ids)}>
          Delete {sel.length}
        </button>
      </div>
    </div>
  )
}

function ArtworkInspector(): ReactNode {
  const part = useStore((s) => s.part)!
  const updateArtwork = useStore((s) => s.updateArtwork)
  const update = useStore((s) => s.update)
  const updateMetadata = useStore((s) => s.updateMetadata)
  const updatePcb = useStore((s) => s.updatePcb)
  const setTool = useStore((s) => s.setTool)
  const openDialog = useStore((s) => s.openDialog)
  const notify = useStore((s) => s.notify)
  const art = part.artwork

  const replaceArtwork = async (): Promise<void> => {
    const f = await platform.openFile(FILTERS.images)
    if (!f) return
    try {
      const a = await artworkFromFile(f.name, f.bytes, art?.widthMm ?? 50)
      update((p) => ({ ...p, artwork: a }))
      notify('Artwork replaced. Check connector positions.', 'success')
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  return (
    <div>
      <h3>Part</h3>
      <TextField label="Part name" value={part.metadata.title} onCommit={(title) => updateMetadata({ title })} />
      <div className="row" style={{ marginBottom: 10 }}>
        <button onClick={() => openDialog('metadata')}>Edit metadata…</button>
        <span className="dim">{part.connectors.length} connectors</span>
      </div>
      <Check label="This component is mounted on a PCB" checked={part.pcb.mode !== 'none'} onChange={(v) => updatePcb({ mode: v ? (part.pcb.customSvg ? 'custom' : 'generated') : 'none' })} />

      <h3 style={{ marginTop: 14 }}>Artwork</h3>
      {art ? (
        <>
          <div className="dim" style={{ marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={art.fileName}>
            {art.fileName} · {art.kind === 'svg' ? 'vector' : `${art.pixelWidth} × ${art.pixelHeight} px`}
          </div>
          <div className="two-col">
            <NumberField label="Physical width" value={art.widthMm} unit="mm" min={0.1} step={1} disabled={art.locked} onCommit={(v) => v && updateArtwork((a) => withWidthMm(a, v))} />
            <NumberField label="Physical height" value={art.heightMm} unit="mm" min={0.1} step={1} disabled={art.locked} onCommit={(v) => v && updateArtwork((a) => withHeightMm(a, v))} />
          </div>
          <div className="faint" style={{ fontSize: 11, marginBottom: 8 }}>
            Enter the real size of the component. The aspect ratio is kept. Scale: {round((art.widthMm / Math.max(1, art.pixelWidth)) * 1000, 1)} µm per pixel.
          </div>
          <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTool('calibrate')} disabled={art.locked} title="Click two points with a known distance">
              Calibrate scale…
            </button>
            <button onClick={() => updateArtwork((a) => rotated(a, -90))} disabled={art.locked}>
              ⟲ Rotate
            </button>
            <button onClick={() => updateArtwork((a) => rotated(a, 90))} disabled={art.locked}>
              ⟳ Rotate
            </button>
          </div>
          <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTool('crop')} disabled={art.locked || art.kind === 'svg'} title={art.kind === 'svg' ? 'Cropping applies to picture artwork only' : undefined}>
              Crop…
            </button>
            {art.crop && (
              <button onClick={() => updateArtwork((a) => withCrop(a, null))} disabled={art.locked}>
                Remove crop
              </button>
            )}
            <button onClick={replaceArtwork}>Replace artwork…</button>
          </div>
          <Check label="Lock artwork (prevent size changes)" checked={art.locked} onChange={(locked) => updateArtwork((a) => ({ ...a, locked }))} />
          {art.kind === 'raster' && (
            <div className="faint" style={{ fontSize: 11 }}>
              The picture is embedded in the Fritzing part exactly as supplied; it is never traced.
            </div>
          )}
        </>
      ) : (
        <div className="dim">
          No artwork. <button onClick={replaceArtwork}>Choose an image…</button> or drop one on the canvas.
        </div>
      )}

      <h3 style={{ marginTop: 14 }}>Canvas</h3>
      <Check label="Snap connectors to grid" checked={part.settings.snapToGrid} onChange={(snapToGrid) => update((p) => ({ ...p, settings: { ...p.settings, snapToGrid } }))} />
      <NumberField label="Grid" value={part.settings.gridMm} unit="mm" min={0.1} step={0.01} onCommit={(v) => v && update((p) => ({ ...p, settings: { ...p.settings, gridMm: v } }))} />
    </div>
  )
}

function SchematicInspector(): ReactNode {
  const part = useStore((s) => s.part)!
  const updateSchematic = useStore((s) => s.updateSchematic)
  const updateConnector = useStore((s) => s.updateConnector)
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const pins = useMemo(() => resolveSchematicPins(part), [part])
  const sch = part.schematic

  const importCustom = async (): Promise<void> => {
    const f = await platform.openFile(FILTERS.svg)
    if (!f) return
    updateSchematic({ mode: 'custom', customSvg: new TextDecoder().decode(f.bytes) })
    notify('Custom schematic loaded. Connector ids such as connector0pin must exist in it; check the validation list.', 'info')
  }

  const ordered = [...part.connectors].sort((a, b) => a.schematic.order - b.schematic.order || part.connectors.indexOf(a) - part.connectors.indexOf(b))
  const move = (c: Connector, dir: -1 | 1): void => {
    const i = ordered.indexOf(c)
    const j = i + dir
    if (j < 0 || j >= ordered.length) return
    const next = [...ordered]
    next[i] = ordered[j]
    next[j] = ordered[i]
    update((p) => ({ ...p, connectors: p.connectors.map((x) => ({ ...x, schematic: { ...x.schematic, order: next.indexOf(x) } })) }))
  }

  return (
    <div>
      <h3>Schematic symbol</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="radio" checked={sch.mode === 'generated'} onChange={() => updateSchematic({ mode: 'generated' })} /> Generated
        </label>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="radio" checked={sch.mode === 'custom'} onChange={() => (sch.customSvg ? updateSchematic({ mode: 'custom' }) : importCustom())} /> Custom SVG
        </label>
        <button className="small" onClick={importCustom}>
          Import…
        </button>
      </div>
      {sch.mode === 'generated' ? (
        <>
          <TextField label="Symbol title" value={sch.title ?? ''} placeholder={part.metadata.title} onCommit={(v) => updateSchematic({ title: v.trim() ? v : null })} />
          <Check label="Show pin numbers" checked={sch.showNumbers} onChange={(showNumbers) => updateSchematic({ showNumbers })} />
          <Check label="Show pin labels" checked={sch.showLabels} onChange={(showLabels) => updateSchematic({ showLabels })} />
          <NumberField label="Extra width (grid steps of 2.54 mm)" value={sch.extraWidth} min={0} max={40} step={1} decimals={0} onCommit={(v) => updateSchematic({ extraWidth: v ?? 0 })} />
          <h3 style={{ marginTop: 12 }}>Pins</h3>
          <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>
            Order, side and label of each pin. Pins snap to Fritzing's 0.1 inch grid automatically.
          </div>
          {ordered.map((c) => {
            const pin = pins.find((p) => p.connector.id === c.id)
            return (
              <div className="pin-row" key={c.id}>
                <span className="n">{c.number ?? ''}</span>
                <TextField value={c.schematic.label ?? ''} placeholder={connectorDisplayName(c, part.connectors.indexOf(c))} onCommit={(v) => updateConnector(c.id, { schematic: { ...c.schematic, label: v.trim() ? v : null } })} />
                <Select<SchematicSide>
                  value={c.schematic.side}
                  options={SIDE_OPTIONS.map((o) => (o.value === 'auto' && pin ? { ...o, label: `Auto (${pin.side})` } : o))}
                  onChange={(side) => updateConnector(c.id, { schematic: { ...c.schematic, side } })}
                />
                <button className="small" title="Move up" onClick={() => move(c, -1)}>
                  ↑
                </button>
                <button className="small" title="Move down" onClick={() => move(c, 1)}>
                  ↓
                </button>
              </div>
            )
          })}
        </>
      ) : (
        <div className="dim">
          Using your own schematic SVG. Each connector must have an element whose id is listed under "Fritzing advanced" in the connector inspector (for example <span className="mono">connector0pin</span>). The validation list reports any that are missing.
        </div>
      )}
    </div>
  )
}

const TEMPLATE_OPTIONS: Array<{ value: PcbTemplate; label: string }> = [
  { value: 'module', label: 'Module (pads where the connectors are)' },
  { value: 'dip', label: 'DIP (two rows)' },
  { value: 'sip', label: 'SIP (one row)' },
  { value: 'header', label: 'Pin header (rows × columns)' },
  { value: 'terminal', label: 'Terminal block' },
  { value: 'custom', label: 'Custom rectangle' }
]

function PcbInspector(): ReactNode {
  const part = useStore((s) => s.part)!
  const updatePcb = useStore((s) => s.updatePcb)
  const notify = useStore((s) => s.notify)
  const pcb = part.pcb
  const importCustom = async (): Promise<void> => {
    const f = await platform.openFile(FILTERS.svg)
    if (!f) return
    updatePcb({ mode: 'custom', customSvg: new TextDecoder().decode(f.bytes) })
    notify('Custom PCB footprint loaded. Check the validation list for missing pad ids.', 'info')
  }
  return (
    <div>
      <h3>PCB footprint</h3>
      <label className="row" style={{ cursor: 'pointer', marginBottom: 6 }}>
        <input type="radio" checked={pcb.mode === 'none'} onChange={() => updatePcb({ mode: 'none' })} /> This component is not PCB mounted
      </label>
      <label className="row" style={{ cursor: 'pointer', marginBottom: 6 }}>
        <input type="radio" checked={pcb.mode === 'generated'} onChange={() => updatePcb({ mode: 'generated' })} /> Generate a footprint
      </label>
      <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
        <input type="radio" checked={pcb.mode === 'custom'} onChange={() => (pcb.customSvg ? updatePcb({ mode: 'custom' }) : importCustom())} /> Custom SVG
        <button className="small" onClick={importCustom}>
          Import…
        </button>
      </label>
      {pcb.mode === 'generated' && (
        <>
          <Select<PcbTemplate> label="Template" value={pcb.template} options={TEMPLATE_OPTIONS} onChange={(template) => updatePcb({ template })} />
          <div className="two-col">
            <NumberField label="Pin pitch" value={pcb.pitchMm} unit="mm" min={0.3} step={0.01} onCommit={(v) => v && updatePcb({ pitchMm: v })} />
            {(pcb.template === 'dip' || pcb.template === 'header') && <NumberField label="Row spacing" value={pcb.rowSpacingMm} unit="mm" min={0.3} step={0.01} onCommit={(v) => v && updatePcb({ rowSpacingMm: v })} />}
            {pcb.template === 'header' && <NumberField label="Rows" value={pcb.rows} min={1} max={8} step={1} decimals={0} onCommit={(v) => v && updatePcb({ rows: Math.round(v) })} />}
            <NumberField label="Pad diameter" value={pcb.padDiameterMm} unit="mm" min={0.3} step={0.05} onCommit={(v) => v && updatePcb({ padDiameterMm: v })} />
            <NumberField label="Hole diameter" value={pcb.holeDiameterMm} unit="mm" min={0.1} step={0.05} disabled={pcb.smd} onCommit={(v) => v && updatePcb({ holeDiameterMm: v })} />
            <NumberField label="Outline width" value={pcb.outlineWidthMm} unit="mm" min={1} step={0.1} allowEmpty placeholder="auto" onCommit={(v) => updatePcb({ outlineWidthMm: v })} />
            <NumberField label="Outline height" value={pcb.outlineHeightMm} unit="mm" min={1} step={0.1} allowEmpty placeholder="auto" onCommit={(v) => updatePcb({ outlineHeightMm: v })} />
          </div>
          <Check label="Surface mount pads (SMD, top copper only)" checked={pcb.smd} onChange={(smd) => updatePcb({ smd })} />
          <Check label="Print the part name on the silkscreen" checked={pcb.silkLabel} onChange={(silkLabel) => updatePcb({ silkLabel })} />
          <div className="faint" style={{ fontSize: 11 }}>
            Pads are numbered in connector order. The "Module" template places each pad exactly where its connector sits on the artwork, scaled to the physical size.
          </div>
        </>
      )}
      {pcb.mode === 'custom' && (
        <div className="dim">
          Using your own footprint SVG. Pads need ids like <span className="mono">connector0pin</span> inside copper0/copper1 groups; the validation list reports anything missing.
        </div>
      )}
    </div>
  )
}

function IconInspector(): ReactNode {
  const part = useStore((s) => s.part)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const importCustom = async (): Promise<void> => {
    const f = await platform.openFile(FILTERS.svg)
    if (!f) return
    update((p) => ({ ...p, icon: { mode: 'custom', customSvg: new TextDecoder().decode(f.bytes) } }))
    notify('Custom icon loaded.', 'success')
  }
  return (
    <div>
      <h3>Parts-bin icon</h3>
      <label className="row" style={{ cursor: 'pointer', marginBottom: 6 }}>
        <input type="radio" checked={part.icon.mode === 'generated'} onChange={() => update((p) => ({ ...p, icon: { ...p.icon, mode: 'generated' } }))} /> Generate from the breadboard artwork
      </label>
      <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
        <input type="radio" checked={part.icon.mode === 'custom'} onChange={() => (part.icon.customSvg ? update((p) => ({ ...p, icon: { ...p.icon, mode: 'custom' } })) : importCustom())} /> Custom SVG
        <button className="small" onClick={importCustom}>
          Import…
        </button>
      </label>
      <div className="faint" style={{ fontSize: 11 }}>
        The icon keeps the artwork's aspect ratio inside a 32 × 32 pixel canvas with a transparent background.
      </div>
    </div>
  )
}
