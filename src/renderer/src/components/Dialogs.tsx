import { useEffect, useState, type ReactNode } from 'react'
import { createConnector, kindInfo, nextConnectorNumber, type Artwork, type Gender, type Part } from '@core/model'
import { calibrated, naturalToMm, type Pt } from '@core/artwork'
import { TEMPLATES, partFromTemplate } from '@core/templates'
import { parseNames } from '@core/groups'
import { NAME_PRESETS } from '@core/presets'
import { round } from '@core/units'
import { CONNECTOR_KINDS, type ConnectorKind } from '@core/model'
import { makeConnectorAt } from '../ops'
import logo from '../assets/logo.png'
import sticker from '../assets/sticker.png'
import { applyFix, availableFixes, summarize, type Issue } from '@core/validate'
import { newModuleId } from '@core/ids'
import { useStore } from '../store'
import { FILTERS, platform } from '../platform'
import { artworkFromFile } from '../files'
import { loadProject, type ProjectMeta } from '@core/project'
import { NumberField, Select, TextField, Check } from './fields'

function Modal({ title, children, footer, wide, onClose }: { title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; onClose?: () => void }): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} onKeyDown={(e) => e.stopPropagation()}>
        <header>{title}</header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

export function Dialogs(): ReactNode {
  const dialog = useStore((s) => s.dialog)
  switch (dialog) {
    case 'new':
      return <NewPartDialog />
    case 'quickadd':
      return <QuickAddDialog />
    case 'metadata':
      return <MetadataDialog />
    case 'group':
      return <GroupDialog />
    case 'calibrate':
      return <CalibrateDialog />
    case 'issues':
      return <IssuesDialog />
    case 'importNotes':
      return <ImportNotesDialog />
    case 'artworkChoice':
      return <ArtworkChoiceDialog />
    case 'confirmDiscard':
      return <ConfirmDiscardDialog />
    case 'restore':
      return <RestoreDialog />
    case 'help':
      return <HelpDialog />
    default:
      return null
  }
}

function NewPartDialog(): ReactNode {
  const part = useStore((s) => s.part)
  const data = useStore((s) => s.dialogData) as { fromArtwork?: boolean } | null
  const closeDialog = useStore((s) => s.closeDialog)
  const loadPart = useStore((s) => s.loadPart)
  const notify = useStore((s) => s.notify)
  const fromArtwork = !!data?.fromArtwork && !!part?.artwork
  const [name, setName] = useState(fromArtwork ? part!.metadata.title : '')
  const [manufacturer, setManufacturer] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('generic')
  const [artwork, setArtwork] = useState<Artwork | null>(fromArtwork ? part!.artwork : null)
  const [widthMm, setWidthMm] = useState<number>(artwork?.widthMm ?? 50)

  const chooseArtwork = async (): Promise<void> => {
    const f = await platform.openFile(FILTERS.images)
    if (!f) return
    try {
      const a = await artworkFromFile(f.name, f.bytes, widthMm)
      setArtwork(a)
      if (!name) setName(f.name.replace(/\.[a-z0-9]+$/i, ''))
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  const create = (): void => {
    const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
    const p: Part = partFromTemplate(t, name.trim() || 'Untitled part')
    p.metadata = { ...p.metadata, manufacturer, partNumber, description, label: name.trim().split(/\s+/)[0] ?? '' }
    if (artwork) {
      const a = { ...artwork }
      if (a.kind === 'raster') {
        a.widthMm = widthMm
        a.heightMm = (widthMm * a.pixelHeight) / a.pixelWidth
      }
      p.artwork = a
    }
    loadPart(p)
    closeDialog()
    if (p.connectors.length) notify(`${p.connectors.length} connectors from the template are ready. Select each and click its position on the image.`, 'info')
  }

  return (
    <Modal
      title="Create new part"
      wide
      onClose={closeDialog}
      footer={
        <>
          <button onClick={closeDialog}>Cancel</button>
          <button className="primary" onClick={create} disabled={!name.trim()}>
            Create part
          </button>
        </>
      }
    >
      <div className="two-col">
        <label className="field">
          <span>Part name (required)</span>
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. YD7010 Command Station" onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
        </label>
        <label className="field">
          <span>Manufacturer</span>
          <input type="text" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. YaMoRC" />
        </label>
        <label className="field">
          <span>Part number</span>
          <input type="text" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="e.g. YD7010" />
        </label>
        <label className="field">
          <span>Description</span>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <h3>Artwork</h3>
      <div className="row" style={{ marginBottom: 10 }}>
        <button onClick={chooseArtwork}>{artwork ? 'Change artwork…' : 'Choose artwork (PNG, JPEG or SVG)…'}</button>
        <span className="dim">{artwork ? `${artwork.fileName}` : 'You can also drop an image onto the canvas later.'}</span>
      </div>
      {artwork && artwork.kind === 'raster' && (
        <div style={{ maxWidth: 260 }}>
          <NumberField label="Real width of the component" value={widthMm} unit="mm" min={0.5} step={1} onCommit={(v) => v && setWidthMm(v)} />
        </div>
      )}
      <h3>Template</h3>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className={templateId === t.id ? 'active' : ''} onClick={() => setTemplateId(t.id)}>
            <b>{t.label}</b>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Quick add mode: one dialog per click on the board. */
function QuickAddDialog(): ReactNode {
  const data = useStore((s) => s.dialogData) as { natural: Pt }
  const part = useStore((s) => s.part)!
  const closeDialog = useStore((s) => s.closeDialog)
  const addConnectors = useStore((s) => s.addConnectors)
  const defaults = useStore((s) => s.quickAddDefaults)
  const setQuickAddDefaults = useStore((s) => s.setQuickAddDefaults)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ConnectorKind>(defaults.kind)
  const [gender, setGender] = useState<Gender>(defaults.gender)
  const [genderTouched, setGenderTouched] = useState(defaults.gender !== kindInfo(defaults.kind).gender)
  const [description, setDescription] = useState('')
  const existing = part.connectors.map((c) => c.name)
  const nextNumber = nextConnectorNumber(part)

  const ok = (): void => {
    if (!part.artwork) return closeDialog()
    const c = makeConnectorAt(part.artwork, data.natural, kind, { name: name.trim(), description: description.trim(), gender })
    addConnectors([c])
    setQuickAddDefaults({ kind, gender })
    closeDialog()
  }

  return (
    <Modal
      title={`New connector ${nextNumber}`}
      onClose={closeDialog}
      footer={
        <>
          <button onClick={closeDialog}>Cancel</button>
          <button className="primary" onClick={ok}>
            OK
          </button>
        </>
      }
    >
      <datalist id="quickadd-presets">
        {NAME_PRESETS.filter((n) => !existing.includes(n)).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          list="quickadd-presets"
          value={name}
          placeholder="e.g. Track A, GND, SDA"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
        />
      </label>
      <Select<ConnectorKind>
        label="Type"
        value={kind}
        options={CONNECTOR_KINDS.map((k) => ({ value: k.id, label: k.label }))}
        onChange={(k) => {
          setKind(k)
          if (!genderTouched) setGender(kindInfo(k).gender)
        }}
      />
      <label className="field">
        <span>Description</span>
        <textarea value={description} placeholder="What this connection is for" onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span>Socket type</span>
        <div className="row">
          {(
            [
              ['female', 'Female (socket a wire or pin plugs into)'],
              ['male', 'Male (pin that plugs in)'],
              ['pad', 'Pad (surface contact)']
            ] as Array<[Gender, string]>
          ).map(([g, label]) => (
            <label key={g} className="row" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="quickadd-gender"
                checked={gender === g}
                onChange={() => {
                  setGender(g)
                  setGenderTouched(true)
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </label>
      <div className="faint" style={{ fontSize: 11 }}>
        Position: {part.artwork ? `${round(naturalToMm(part.artwork, data.natural).x, 1)}, ${round(naturalToMm(part.artwork, data.natural).y, 1)} mm` : ''}. You can move it afterwards by dragging.
      </div>
    </Modal>
  )
}

function MetadataDialog(): ReactNode {
  const part = useStore((s) => s.part)!
  const closeDialog = useStore((s) => s.closeDialog)
  const updateMetadata = useStore((s) => s.updateMetadata)
  const update = useStore((s) => s.update)
  const m = part.metadata
  return (
    <Modal title="Part metadata" wide onClose={closeDialog} footer={<button className="primary" onClick={closeDialog}>Done</button>}>
      <div className="two-col">
        <TextField label="Title" value={m.title} onCommit={(title) => updateMetadata({ title })} />
        <TextField label="Label (shown on the part in sketches)" value={m.label} placeholder={m.title} onCommit={(label) => updateMetadata({ label })} />
        <TextField label="Manufacturer" value={m.manufacturer} onCommit={(manufacturer) => updateMetadata({ manufacturer })} />
        <TextField label="Part number" value={m.partNumber} onCommit={(partNumber) => updateMetadata({ partNumber })} />
        <TextField label="Family (groups swappable parts in Fritzing)" value={m.family} placeholder={m.title} onCommit={(family) => updateMetadata({ family })} />
        <TextField label="Author" value={m.author} onCommit={(author) => updateMetadata({ author })} />
        <TextField label="Version" value={m.version} onCommit={(version) => updateMetadata({ version })} />
        <TextField label="Date" value={m.date} onCommit={(date) => updateMetadata({ date })} />
        <TextField label="URL" value={m.url} onCommit={(url) => updateMetadata({ url })} />
        <TextField label="Licence" value={m.licence} placeholder="e.g. CC BY-SA 4.0" onCommit={(licence) => updateMetadata({ licence })} />
      </div>
      <TextField label="Tags (comma separated)" value={m.tags.join(', ')} onCommit={(v) => updateMetadata({ tags: parseNames(v) })} />
      <TextField label="Description" value={m.description} multiline onCommit={(description) => updateMetadata({ description })} />
      <details className="collapsible">
        <summary>Fritzing advanced</summary>
        <label className="field">
          <span>Module ID (must be unique across all parts in Fritzing)</span>
          <div className="row">
            <input type="text" className="mono" readOnly value={part.moduleId} />
            <button className="small" onClick={() => update((p) => ({ ...p, moduleId: newModuleId(p.metadata.title) }))}>
              New ID
            </button>
          </div>
        </label>
        {part.imported && (
          <div className="faint" style={{ fontSize: 11 }}>
            Imported from {part.imported.fileName} (original module ID <span className="mono">{part.imported.originalModuleId}</span>). A new ID was issued so both can coexist in Fritzing.
          </div>
        )}
      </details>
    </Modal>
  )
}

function GroupDialog(): ReactNode {
  const closeDialog = useStore((s) => s.closeDialog)
  const setGroupSpec = useStore((s) => s.setGroupSpec)
  const setTool = useStore((s) => s.setTool)
  const lastKind = useStore((s) => s.lastKind)
  const part = useStore((s) => s.part)!
  const prev = useStore((s) => s.groupSpec)
  const [count, setCount] = useState(prev?.count ?? 4)
  const [names, setNames] = useState(prev?.names.join(', ') ?? '')
  const [kind, setKind] = useState<ConnectorKind>(prev?.kind ?? lastKind)
  const [reverse, setReverse] = useState(prev?.reverse ?? false)
  const maxNum = part.connectors.reduce((m, c) => Math.max(m, c.number ?? 0), 0)
  const [startNumber, setStartNumber] = useState(maxNum + 1)
  const parsed = parseNames(names)
  return (
    <Modal
      title="Add a connector group"
      onClose={closeDialog}
      footer={
        <>
          <button onClick={closeDialog}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              setGroupSpec({ count: Math.max(1, Math.round(count)), names: parsed, startNumber, reverse, kind })
              closeDialog()
              setTool('group')
            }}
          >
            Place on image
          </button>
        </>
      }
    >
      <p className="dim" style={{ marginTop: 0 }}>
        After pressing <b>Place on image</b>, click the first pin and then the last pin; the others are spaced evenly between them.
      </p>
      <div className="two-col">
        <NumberField label="Number of pins" value={count} min={1} max={200} step={1} decimals={0} onCommit={(v) => v && setCount(v)} />
        <NumberField label="First pin number" value={startNumber} min={0} step={1} decimals={0} onCommit={(v) => v !== null && setStartNumber(v)} />
      </div>
      <Select<ConnectorKind> label="Connector type" value={kind} options={CONNECTOR_KINDS.map((k) => ({ value: k.id, label: k.label }))} onChange={setKind} />
      <label className="field">
        <span>Names (comma or newline separated, optional)</span>
        <textarea value={names} onChange={(e) => setNames(e.target.value)} placeholder={'RS A, RS B, Prog A, Prog B'} />
      </label>
      {parsed.length > 0 && parsed.length !== count && (
        <div className="dim" style={{ marginBottom: 6 }}>
          {parsed.length} names for {count} pins. Pins without a name stay unnamed.
        </div>
      )}
      <Check label="Reverse numbering (last clicked pin gets the first number)" checked={reverse} onChange={setReverse} />
    </Modal>
  )
}

function CalibrateDialog(): ReactNode {
  const data = useStore((s) => s.dialogData) as { p1: Pt; p2: Pt }
  const closeDialog = useStore((s) => s.closeDialog)
  const updateArtwork = useStore((s) => s.updateArtwork)
  const setTool = useStore((s) => s.setTool)
  const notify = useStore((s) => s.notify)
  const [dist, setDist] = useState(5.08)
  const done = (): void => {
    closeDialog()
    setTool('select')
  }
  return (
    <Modal
      title="Calibrate scale"
      onClose={done}
      footer={
        <>
          <button onClick={done}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              updateArtwork((a) => calibrated(a, data.p1, data.p2, dist))
              notify('Physical size updated from the calibration distance.', 'success')
              done()
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <NumberField label="Distance between the two points you clicked" value={dist} unit="mm" min={0.01} step={0.01} decimals={3} onCommit={(v) => v && setDist(v)} />
      <div className="faint" style={{ fontSize: 11 }}>Tip: 2.54 mm between header pins, 5.08 mm between screw terminals, or a known board edge length.</div>
    </Modal>
  )
}

function IssuesDialog(): ReactNode {
  const issues = useStore((s) => s.issues)
  const data = useStore((s) => s.dialogData) as { blocking?: boolean } | null
  const closeDialog = useStore((s) => s.closeDialog)
  const part = useStore((s) => s.part)!
  const replace = useStore((s) => s.replace)
  const select = useStore((s) => s.select)
  const setView = useStore((s) => s.setView)
  const notify = useStore((s) => s.notify)
  const sum = summarize(issues)
  const fixes = availableFixes(issues)

  const go = (i: Issue): void => {
    if (i.connectorId) select([i.connectorId])
    if (i.view) setView(i.view)
    closeDialog()
  }
  const fix = (i: Issue): void => {
    if (!i.fix) return
    replace(applyFix(part, i.fix))
    notify('Repaired.', 'success')
  }
  const repairAll = (): void => {
    let p = part
    for (const f of fixes) p = applyFix(p, f)
    replace(p)
    notify(`Applied ${fixes.length} repair${fixes.length === 1 ? '' : 's'}.`, 'success')
  }

  return (
    <Modal
      title={data?.blocking ? 'Fix these before exporting' : 'Part check'}
      wide
      onClose={closeDialog}
      footer={
        <>
          {fixes.length > 0 && <button onClick={repairAll}>Repair all ({fixes.length})</button>}
          <button className="primary" onClick={closeDialog}>
            Close
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 10 }}>
        <span className={`validation ${sum.level}`} style={{ cursor: 'default' }}>
          <span className="dot" /> {sum.label}
        </span>
      </div>
      <DiagnosticsSummary part={part} issues={issues} />
      {issues.length === 0 ? (
        <p className="dim">Everything checks out. The part has all the graphics, layers and connector mappings Fritzing needs.</p>
      ) : (
        issues.map((i) => (
          <div className="issue" key={i.id} onClick={() => go(i)}>
            <span className={`sev ${i.severity}`} />
            <span className="msg">{i.message}</span>
            {i.fix && (
              <button
                className="small"
                onClick={(e) => {
                  e.stopPropagation()
                  fix(i)
                }}
              >
                {i.fixLabel ?? 'Repair'}
              </button>
            )}
          </div>
        ))
      )}
    </Modal>
  )
}

function DiagnosticsSummary({ part, issues }: { part: Part; issues: Issue[] }): ReactNode {
  const has = (view: string, sev: 'error' | 'warning'): boolean => issues.some((i) => i.view === view && i.severity === sev)
  const mark = (view: string): string => (has(view, 'error') ? '✗' : has(view, 'warning') ? '⚠' : '✓')
  const placed = part.connectors.filter((c) => c.breadboard).length
  return (
    <div className="mono" style={{ marginBottom: 12, lineHeight: 1.6 }}>
      <div>
        {mark('breadboard')} Breadboard graphic {part.artwork ? `(${part.artwork.kind === 'svg' ? 'vector' : 'picture'}, ${Math.round(part.artwork.widthMm)} × ${Math.round(part.artwork.heightMm)} mm)` : '(missing)'}
      </div>
      <div>
        {placed === part.connectors.length ? '✓' : '✗'} {part.connectors.length} connectors, {placed} placed
      </div>
      <div>
        {mark('schematic')} Schematic {part.schematic.mode === 'custom' ? '(custom)' : '(generated)'}
      </div>
      <div>
        {part.pcb.mode === 'none' ? '⚠' : mark('pcb')} PCB {part.pcb.mode === 'none' ? 'not mounted (left off the PCB)' : part.pcb.mode === 'custom' ? '(custom)' : `(generated ${part.pcb.template})`}
      </div>
      <div>
        {mark('icon')} Icon {part.icon.mode === 'custom' ? '(custom)' : '(generated)'}
      </div>
      <div>{part.metadata.title ? '✓' : '✗'} Metadata</div>
    </div>
  )
}

function ImportNotesDialog(): ReactNode {
  const notes = useStore((s) => s.importNotes)
  const part = useStore((s) => s.part)!
  const issues = useStore((s) => s.issues)
  const closeDialog = useStore((s) => s.closeDialog)
  const openDialog = useStore((s) => s.openDialog)
  return (
    <Modal
      title={`Imported ${part.metadata.title}`}
      onClose={closeDialog}
      footer={
        <>
          <button onClick={() => openDialog('issues')}>Show part check</button>
          <button className="primary" onClick={closeDialog}>
            OK
          </button>
        </>
      }
    >
      <DiagnosticsSummary part={part} issues={issues} />
      {notes.length > 0 && (
        <ul style={{ paddingLeft: 18 }}>
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="dim">The existing graphics are kept. Any changes you make are re-exported as a new, valid Fritzing part.</p>
    </Modal>
  )
}

function ArtworkChoiceDialog(): ReactNode {
  const artwork = useStore((s) => s.dialogData) as Artwork
  const closeDialog = useStore((s) => s.closeDialog)
  const update = useStore((s) => s.update)
  const loadPart = useStore((s) => s.loadPart)
  const openDialog = useStore((s) => s.openDialog)
  const part = useStore((s) => s.part)!
  return (
    <Modal title={`What should ${artwork.fileName} become?`} onClose={closeDialog} footer={<button onClick={closeDialog}>Cancel</button>}>
      <div className="start" style={{ position: 'static' }}>
        <div className="actions" style={{ width: '100%' }}>
          <button
            className="big"
            onClick={() => {
              update((p) => ({ ...p, artwork: { ...artwork, widthMm: p.artwork?.widthMm ?? artwork.widthMm, heightMm: ((p.artwork?.widthMm ?? artwork.widthMm) * artwork.pixelHeight) / artwork.pixelWidth } }))
              closeDialog()
            }}
          >
            <b>Replace the artwork</b>
            <span>Keep the {part.connectors.length} connectors of "{part.metadata.title}" and swap the picture.</span>
          </button>
          <button
            className="big"
            onClick={() => {
              const p = createEmptyFromArtwork(artwork)
              loadPart(p)
              openDialog('new', { fromArtwork: true })
            }}
          >
            <b>Start a new part</b>
            <span>Close the current part and begin a new one from this image.</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

function createEmptyFromArtwork(artwork: Artwork): Part {
  const p = partFromTemplate(TEMPLATES[0], artwork.fileName.replace(/\.[a-z0-9]+$/i, ''))
  p.artwork = artwork
  p.connectors = p.connectors.map((c) => createConnector(c))
  return p
}

function ConfirmDiscardDialog(): ReactNode {
  const data = useStore((s) => s.dialogData) as { resolve: (ok: boolean) => void }
  const closeDialog = useStore((s) => s.closeDialog)
  const part = useStore((s) => s.part)
  const answer = (ok: boolean): void => {
    closeDialog()
    data.resolve(ok)
  }
  return (
    <Modal
      title="Unsaved changes"
      onClose={() => answer(false)}
      footer={
        <>
          <button onClick={() => answer(false)}>Cancel</button>
          <button className="danger" onClick={() => answer(true)}>
            Discard changes
          </button>
        </>
      }
    >
      <p>"{part?.metadata.title || 'Untitled part'}" has unsaved changes. Discard them?</p>
      <p className="dim">An autosaved copy is kept and offered the next time Fritterzing starts.</p>
    </Modal>
  )
}

function RestoreDialog(): ReactNode {
  const data = useStore((s) => s.dialogData) as { bytes: Uint8Array; meta: ProjectMeta | null }
  const closeDialog = useStore((s) => s.closeDialog)
  const loadPart = useStore((s) => s.loadPart)
  const notify = useStore((s) => s.notify)
  const meta = data.meta
  const when = meta?.savedAt ? new Date(meta.savedAt).toLocaleString() : 'unknown time'
  const discard = async (): Promise<void> => {
    await platform.autosaveClear()
    closeDialog()
  }
  return (
    <Modal
      title="Recover unsaved work?"
      onClose={closeDialog}
      footer={
        <>
          <button onClick={closeDialog}>Not now</button>
          <button className="danger" onClick={discard}>
            Discard it
          </button>
          <button
            className="primary"
            onClick={async () => {
              try {
                const p = await loadProject(data.bytes)
                loadPart(p, { path: meta?.filePath ?? null, name: meta?.fileName ?? null })
                useStore.setState({ dirty: true })
                notify('Unsaved work recovered. Save it to keep it.', 'success')
              } catch (e) {
                notify(`The autosave could not be read: ${(e as Error).message}`, 'error')
              }
              closeDialog()
            }}
          >
            Recover
          </button>
        </>
      }
    >
      <p>
        Fritterzing has unsaved changes to <b>{meta?.title || 'an untitled part'}</b>
        {meta?.fileName ? ` (${meta.fileName})` : ''}, autosaved at {when}. This happens when the app was closed or crashed before saving.
      </p>
      <p className="dim">Recover it to carry on where you left off. "Not now" keeps the autosave for next time.</p>
    </Modal>
  )
}

function HelpDialog(): ReactNode {
  const closeDialog = useStore((s) => s.closeDialog)
  return (
    <Modal title="Fritterzing help" wide onClose={closeDialog} footer={<button className="primary" onClick={closeDialog}>Close</button>}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <img src={sticker} alt="" aria-hidden="true" style={{ width: 96, flex: 'none' }} />
        <div>
          <img src={logo} alt="Fritterzing Parts Editor" style={{ width: 260, display: 'block', marginBottom: 6 }} />
          <p style={{ margin: 0 }}>
            <b>Drop in a picture of an electronic component, click where the wires attach, name the connections, and export a working Fritzing part.</b>
          </p>
        </div>
      </div>
      <ol style={{ paddingLeft: 18 }}>
        <li>Drop a PNG, JPEG or SVG of the component onto the window (or use New).</li>
        <li>Enter its real width in millimetres, or use Calibrate scale and click two points a known distance apart.</li>
        <li>Press Add connector and click each place a wire attaches. Name each connector in the Inspector.</li>
        <li>Use Connector group for rows of screw terminals or pin headers: click the first and last pin.</li>
        <li>Check the schematic symbol (generated automatically) and decide whether the part is PCB mounted.</li>
        <li>When the indicator says Ready to export, press Export Fritzing Part. In Fritzing choose File › Open on the .fzpz file, or drag it onto the parts bin.</li>
      </ol>
      <h3>Keyboard</h3>
      <table className="help-table">
        <tbody>
          <tr><td><kbd>A</kbd></td><td>Add connector tool (places a marker, name it in the Inspector)</td></tr>
          <tr><td><kbd>Q</kbd></td><td>Quick add mode (each click opens a dialog for name, type and description)</td></tr>
          <tr><td><kbd>G</kbd></td><td>Connector group</td></tr>
          <tr><td><kbd>P</kbd></td><td>Fritzing preview (drag wires)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Back to the select tool</td></tr>
          <tr><td><kbd>Arrows</kbd> / <kbd>Shift</kbd>+<kbd>Arrows</kbd></td><td>Move selected connectors by the snap step / a tenth of it (1 mm / 0.1 mm when snap is off)</td></tr>
          <tr><td><kbd>Delete</kbd></td><td>Delete selected connectors</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplicate selected connectors</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select all connectors</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Undo / redo</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>O</kbd> / <kbd>Ctrl</kbd>+<kbd>N</kbd></td><td>Save / open / new</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>E</kbd></td><td>Export Fritzing part</td></tr>
          <tr><td><kbd>Space</kbd>+drag, wheel</td><td>Pan, zoom the canvas</td></tr>
        </tbody>
      </table>
      <h3>Files</h3>
      <p className="dim">
        <b>.fpe</b> is Fritterzing's editable project (artwork, connectors, settings). <b>.fzpz</b> is the Fritzing part you export, and can also be opened here to inspect or repair an existing part.
      </p>
      <h3>Disclaimer</h3>
      <p className="dim">
        This software is provided as-is and offers no guarantees of any kind. Usage is entirely at your own risk. The authors accept no liability for any loss or damage arising from its use or from parts produced with it; check generated parts against the manufacturer's documentation before connecting real hardware. Fritterzing is an independent project, not affiliated with the Fritzing project.
      </p>
    </Modal>
  )
}
