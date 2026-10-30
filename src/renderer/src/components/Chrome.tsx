/** Toolbar, sidebar, bottom bar and notices. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CONNECTOR_KINDS, connectorDisplayName, type ConnectorKind, type ViewName } from '@core/model'
import { summarize } from '@core/validate'
import { useStore } from '../store'
import { exportFzpz, exportSingle, openWithDialog, saveProject, saveProjectAs, confirmDiscard } from '../actions'
import { Select } from './fields'

export function Toolbar(): ReactNode {
  const part = useStore((s) => s.part)
  const dirty = useStore((s) => s.dirty)
  const fileName = useStore((s) => s.fileName)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const issues = useStore((s) => s.issues)
  const openDialog = useStore((s) => s.openDialog)
  const closePart = useStore((s) => s.closePart)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const sum = summarize(issues)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  return (
    <div className="toolbar">
      <span className="title">Fritterzing</span>
      <button
        onClick={async () => {
          if (await confirmDiscard()) {
            closePart()
            openDialog('new')
          }
        }}
        title="New part (Ctrl+N)"
      >
        New
      </button>
      <button onClick={openWithDialog} title="Open project, Fritzing part or image (Ctrl+O)">
        Open
      </button>
      <button onClick={saveProject} disabled={!part} title="Save project (Ctrl+S)">
        Save
      </button>
      <button onClick={saveProjectAs} disabled={!part} title="Save project as…">
        Save As
      </button>
      <span className="sep" />
      <button className="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶ Undo
      </button>
      <button className="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        ↷ Redo
      </button>
      <span className="sep" />
      <button onClick={() => openDialog('metadata')} disabled={!part}>
        Metadata
      </button>
      <span className="grow dim" style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {part ? `${part.metadata.title || 'Untitled part'}${fileName ? ` · ${fileName}` : ''}${dirty ? ' •' : ''}` : ''}
      </span>
      {part && (
        <div className={`validation ${sum.level}`} onClick={() => openDialog('issues')} title="Show validation details">
          <span className="dot" />
          <span>{sum.label}</span>
        </div>
      )}
      <button className="primary" onClick={exportFzpz} disabled={!part} title="Export a Fritzing part (.fzpz) (Ctrl+E)">
        Export Fritzing Part
      </button>
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button onClick={() => setMenu((m) => !m)} disabled={!part} title="More export options">
          ▾
        </button>
        {menu && (
          <div className="menu" onClick={() => setMenu(false)}>
            <button onClick={exportFzpz}>Fritzing part (.fzpz)</button>
            <hr />
            <button onClick={() => exportSingle('breadboard')}>Breadboard SVG</button>
            <button onClick={() => exportSingle('schematic')}>Schematic SVG</button>
            <button onClick={() => exportSingle('pcb')}>PCB SVG</button>
            <button onClick={() => exportSingle('icon')}>Icon SVG</button>
            <button onClick={() => exportSingle('fzp')}>Part definition (.fzp)</button>
            <hr />
            <button onClick={() => exportSingle('folder')}>Unpacked part folder (.zip)</button>
          </div>
        )}
      </div>
      <button className="ghost" onClick={() => openDialog('help')} title="Help">
        ?
      </button>
    </div>
  )
}

const VIEWS: Array<{ id: ViewName; label: string }> = [
  { id: 'breadboard', label: 'Breadboard' },
  { id: 'schematic', label: 'Schematic' },
  { id: 'pcb', label: 'PCB' },
  { id: 'icon', label: 'Icon' }
]

export function Sidebar(): ReactNode {
  const part = useStore((s) => s.part)!
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const issues = useStore((s) => s.issues)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selection.length === 1) listRef.current?.querySelector(`[data-id="${selection[0]}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selection])

  const badge = (v: ViewName): ReactNode => {
    const errs = issues.filter((i) => i.view === v && i.severity === 'error').length
    const warns = issues.filter((i) => i.view === v && i.severity === 'warning').length
    if (errs) return <span className="badge err">{errs}</span>
    if (warns) return <span className="badge warn">{warns}</span>
    return null
  }

  return (
    <div className="side">
      <div className="views">
        <h3 style={{ padding: '4px 8px 0' }}>Views</h3>
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
            <span>{view === v.id ? '●' : '○'}</span>
            {v.label}
            {badge(v.id)}
          </button>
        ))}
        {part.pcb.mode === 'none' && (
          <div className="faint" style={{ fontSize: 11, padding: '0 10px' }}>
            Not PCB mounted
          </div>
        )}
      </div>
      <h3 style={{ padding: '8px 16px 0' }}>Connectors ({part.connectors.length})</h3>
      <div className="conn-list" ref={listRef}>
        {part.connectors.length === 0 && (
          <div className="faint" style={{ padding: 8, fontSize: 12 }}>
            None yet. Use <b>Add connector</b> below and click the image.
          </div>
        )}
        {part.connectors.map((c, i) => {
          const problem = issues.find((x) => x.connectorId === c.id && x.severity === 'error')
          return (
            <div
              key={c.id}
              data-id={c.id}
              className={`item${selection.includes(c.id) ? ' selected' : ''}`}
              title={problem?.message ?? c.description}
              onClick={(e) => {
                select([c.id], e.shiftKey || e.ctrlKey || e.metaKey)
                if (view !== 'breadboard') setView('breadboard')
              }}
            >
              <span className="num">{c.number ?? ''}</span>
              <span className={`name${c.name ? '' : ' empty'}`}>{c.name || connectorDisplayName(c, i)}</span>
              {!c.breadboard && <span title="Not placed on the artwork">⚠</span>}
              {problem && c.breadboard && <span style={{ color: 'var(--err)' }}>●</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function BottomBar(): ReactNode {
  const view = useStore((s) => s.view)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const lastKind = useStore((s) => s.lastKind)
  const setLastKind = useStore((s) => s.setLastKind)
  const showLabels = useStore((s) => s.showLabels)
  const setShowLabels = useStore((s) => s.setShowLabels)
  const openDialog = useStore((s) => s.openDialog)
  const part = useStore((s) => s.part)!
  const previewWires = useStore((s) => s.previewWires)
  const clearPreviewWires = useStore((s) => s.clearPreviewWires)
  const issues = useStore((s) => s.issues)
  const sum = summarize(issues)
  const hasArt = !!part.artwork

  if (view !== 'breadboard') {
    return (
      <div className="bottom">
        <span className="dim">
          {view === 'schematic' && 'The schematic symbol is generated from the connector list. Adjust pins in the panel on the right.'}
          {view === 'pcb' && 'Choose whether the component is PCB mounted and which footprint to generate.'}
          {view === 'icon' && 'The parts-bin icon is generated from the breadboard artwork.'}
        </span>
        <span className="status">{sum.label}</span>
      </div>
    )
  }
  return (
    <div className="bottom">
      <button className={tool === 'add' ? 'active' : ''} disabled={!hasArt} onClick={() => setTool(tool === 'add' ? 'select' : 'add')} title="Add a connector: click where a wire attaches (A)">
        + Add connector
      </button>
      <button className={tool === 'group' ? 'active' : ''} disabled={!hasArt} onClick={() => openDialog('group')} title="Add several evenly spaced connectors at once (G)">
        + Connector group
      </button>
      <div style={{ width: 190 }}>
        <Select<ConnectorKind> value={lastKind} options={CONNECTOR_KINDS.map((k) => ({ value: k.id, label: k.label }))} onChange={setLastKind} />
      </div>
      <span className="sep" style={{ width: 1, height: 22, background: 'var(--border)' }} />
      <button className={tool === 'preview' ? 'active' : ''} disabled={!hasArt} onClick={() => setTool(tool === 'preview' ? 'select' : 'preview')} title="Try wiring the part as Fritzing would show it (P)">
        Fritzing preview
      </button>
      {tool === 'preview' && previewWires.length > 0 && (
        <button className="small" onClick={clearPreviewWires}>
          Clear wires
        </button>
      )}
      <label className="row" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels
      </label>
      <span className="status">{sum.label}</span>
    </div>
  )
}

export function Notices(): ReactNode {
  const notices = useStore((s) => s.notices)
  const dismiss = useStore((s) => s.dismissNotice)
  return (
    <div className="notices">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} onClick={() => dismiss(n.id)}>
          {n.text}
        </div>
      ))}
    </div>
  )
}
