import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Artwork, Connector } from '@core/model'
import { connectorDisplayName } from '@core/model'
import { naturalToOutput, outputSizePx, outputToNatural, outputTransform, withCrop, naturalToMm, type Pt } from '@core/artwork'
import { spacedPoints } from '@core/groups'
import { clamp, round } from '@core/units'
import { useStore } from '../store'
import { makeConnectorAt, snapNatural } from '../ops'

interface Viewport {
  x: number
  y: number
  k: number
}

type DragMode = 'pan' | 'move' | 'wire' | 'crop' | null

interface DragState {
  mode: DragMode
  pointerId: number
  startClient: Pt
  startVp: Viewport
  startWorld: Pt
  orig: Map<string, Pt>
  moved: boolean
}

const MARKER_MIN_PX = 6

export function BreadboardCanvas(): ReactNode {
  const part = useStore((s) => s.part)!
  const tool = useStore((s) => s.tool)
  const selection = useStore((s) => s.selection)
  const showLabels = useStore((s) => s.showLabels)
  const previewWires = useStore((s) => s.previewWires)
  const groupFirst = useStore((s) => s.groupFirst)
  const groupSpec = useStore((s) => s.groupSpec)
  const calibratePts = useStore((s) => s.calibratePts)
  const lastKind = useStore((s) => s.lastKind)
  const art = part.artwork

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [vp, setVp] = useState<Viewport>({ x: 40, y: 40, k: 1 })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [cropRect, setCropRect] = useState<{ a: Pt; b: Pt } | null>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [cursorMm, setCursorMm] = useState<Pt | null>(null)
  const [wireDrag, setWireDrag] = useState<{ from: string; to: Pt } | null>(null)
  const drag = useRef<DragState | null>(null)

  const cropMode = tool === 'crop'
  // In crop mode show the whole image (current crop lifted) so a new crop can be drawn.
  const displayArt: Artwork | null = art ? (cropMode && art.crop ? withCrop(art, null) : art) : null
  const artKey = displayArt ? `${displayArt.pixelWidth}x${displayArt.pixelHeight}r${displayArt.rotation}c${JSON.stringify(displayArt.crop)}` : 'none'

  const fit = useCallback((): void => {
    const el = containerRef.current
    const a = useStore.getState().part?.artwork
    if (!el || !a) return
    const shown = cropMode && a.crop ? withCrop(a, null) : a
    const o = outputSizePx(shown)
    const cw = el.clientWidth
    const ch = el.clientHeight
    const k = clamp(Math.min((cw - 80) / Math.max(1, o.w), (ch - 80) / Math.max(1, o.h)), 0.01, 50)
    setVp({ k, x: (cw - o.w * k) / 2, y: (ch - o.h * k) / 2 })
  }, [cropMode])

  useLayoutEffect(() => {
    fit()
  }, [fit, artKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setSpaceHeld(e.type === 'keydown')
        if (e.type === 'keydown') e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  const toWorld = useCallback(
    (clientX: number, clientY: number, v: Viewport = vp): Pt => {
      const r = containerRef.current!.getBoundingClientRect()
      return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k }
    },
    [vp]
  )

  const toNatural = (world: Pt): Pt => {
    if (!displayArt) return world
    const n = outputToNatural(displayArt, world)
    return part.settings.snapToGrid && !cropMode ? snapNatural(displayArt, n, part.settings.gridMm) : n
  }

  const markerPos = (c: Connector): Pt | null => (c.breadboard && displayArt ? naturalToOutput(displayArt, c.breadboard) : null)

  // ---- pointer handling -------------------------------------------------
  const onBackgroundDown = (e: React.PointerEvent): void => {
    if (e.button === 1 || spaceHeld || (e.button === 0 && (tool === 'select' || tool === 'preview'))) {
      if (e.button !== 0 && e.button !== 1) return
      startDrag(e, 'pan')
      return
    }
    if (e.button !== 0 || !displayArt) return
    const world = toWorld(e.clientX, e.clientY)
    const st = useStore.getState()
    switch (tool) {
      case 'add': {
        const c = makeConnectorAt(displayArt, toNatural(world), lastKind)
        st.addConnector(c)
        break
      }
      case 'group': {
        const n = toNatural(world)
        if (!groupFirst) {
          st.setGroupFirst(n)
        } else {
          const spec = groupSpec ?? { count: 2, names: [], startNumber: 1, reverse: false, kind: lastKind }
          const pts = spacedPoints(groupFirst, n, spec.count)
          const ordered = spec.reverse ? [...pts].reverse() : pts
          const cs = ordered.map((p, i) => makeConnectorAt(displayArt, p, spec.kind, { name: spec.names[i] ?? '', number: spec.startNumber + i }))
          st.addConnectors(cs)
          st.setGroupFirst(null)
          st.setTool('select')
          st.notify(`Added ${cs.length} connectors. Name them in the Inspector.`, 'success')
        }
        break
      }
      case 'calibrate': {
        const n = outputToNatural(displayArt, world)
        const pts = [...calibratePts, n]
        if (pts.length < 2) st.setCalibratePts(pts)
        else {
          st.setCalibratePts([])
          st.openDialog('calibrate', { p1: pts[0], p2: pts[1] })
        }
        break
      }
      case 'crop':
        startDrag(e, 'crop')
        setCropRect({ a: world, b: world })
        break
    }
  }

  const onMarkerDown = (e: React.PointerEvent, c: Connector): void => {
    if (e.button === 1 || spaceHeld) return // let background pan
    if (tool === 'group' || tool === 'calibrate' || tool === 'crop') return
    if (e.button !== 0) return
    e.stopPropagation()
    const st = useStore.getState()
    if (tool === 'preview') {
      const world = toWorld(e.clientX, e.clientY)
      setWireDrag({ from: c.id, to: world })
      startDrag(e, 'wire')
      return
    }
    let sel = st.selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      st.select([c.id], true)
      sel = useStore.getState().selection
    } else if (!sel.includes(c.id)) {
      st.select([c.id])
      sel = [c.id]
    }
    const orig = new Map<string, Pt>()
    for (const sc of part.connectors) {
      const p = markerPos(sc)
      if (sel.includes(sc.id) && p) orig.set(sc.id, p)
    }
    st.beginDrag()
    startDrag(e, 'move', orig)
  }

  const startDrag = (e: React.PointerEvent, mode: DragMode, orig = new Map<string, Pt>()): void => {
    const svg = svgRef.current
    if (!svg) return
    svg.setPointerCapture(e.pointerId)
    drag.current = {
      mode,
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startVp: vp,
      startWorld: toWorld(e.clientX, e.clientY),
      orig,
      moved: false
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const world = toWorld(e.clientX, e.clientY)
    if (displayArt) {
      const mm = naturalToMm(displayArt, outputToNatural(displayArt, world))
      setCursorMm(mm)
    }
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startClient.x
    const dy = e.clientY - d.startClient.y
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
    switch (d.mode) {
      case 'pan':
        setVp({ ...d.startVp, x: d.startVp.x + dx, y: d.startVp.y + dy })
        break
      case 'move': {
        if (!displayArt) return
        const wdx = dx / d.startVp.k
        const wdy = dy / d.startVp.k
        useStore.getState().dragUpdate((p) => ({
          ...p,
          connectors: p.connectors.map((c) => {
            const o = d.orig.get(c.id)
            if (!o || !c.breadboard) return c
            const n = toNatural({ x: o.x + wdx, y: o.y + wdy })
            return { ...c, breadboard: { ...c.breadboard, x: n.x, y: n.y } }
          })
        }))
        break
      }
      case 'wire':
        setWireDrag((w) => (w ? { ...w, to: world } : w))
        break
      case 'crop':
        setCropRect({ a: d.startWorld, b: world })
        break
    }
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
    const st = useStore.getState()
    switch (d.mode) {
      case 'pan':
        if (!d.moved && tool === 'select' && e.button === 0) st.select([])
        break
      case 'move':
        st.endDrag()
        break
      case 'wire': {
        const target = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-id]') as HTMLElement | null
        const toId = target?.dataset['id']
        if (wireDrag) {
          if (toId && toId !== wireDrag.from) st.addPreviewWire({ from: wireDrag.from, to: toId })
          else if (d.moved) st.addPreviewWire({ from: wireDrag.from, to: toWorld(e.clientX, e.clientY) })
        }
        setWireDrag(null)
        break
      }
      case 'crop': {
        if (cropRect && displayArt && art) {
          const a = outputToNatural(displayArt, cropRect.a)
          const b = outputToNatural(displayArt, cropRect.b)
          const x = clamp(Math.min(a.x, b.x), 0, art.pixelWidth)
          const y = clamp(Math.min(a.y, b.y), 0, art.pixelHeight)
          const x2 = clamp(Math.max(a.x, b.x), 0, art.pixelWidth)
          const y2 = clamp(Math.max(a.y, b.y), 0, art.pixelHeight)
          if (x2 - x > 4 && y2 - y > 4) {
            st.updateArtwork((cur) => withCrop(cur, { x, y, w: x2 - x, h: y2 - y }))
            st.notify('Artwork cropped. Connector positions are unchanged.', 'success')
          }
        }
        setCropRect(null)
        st.setTool('select')
        break
      }
    }
  }

  const onWheel = (e: React.WheelEvent): void => {
    const r = containerRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const factor = Math.exp(-e.deltaY * 0.0015)
    const k = clamp(vp.k * factor, 0.01, 80)
    setVp({ k, x: mx - (mx - vp.x) * (k / vp.k), y: my - (my - vp.y) * (k / vp.k) })
  }

  const zoomBy = (factor: number): void => {
    const el = containerRef.current!
    const mx = el.clientWidth / 2
    const my = el.clientHeight / 2
    const k = clamp(vp.k * factor, 0.01, 80)
    setVp({ k, x: mx - (mx - vp.x) * (k / vp.k), y: my - (my - vp.y) * (k / vp.k) })
  }

  // ---- rendering -----------------------------------------------------------
  const out = displayArt ? outputSizePx(displayArt) : { w: 0, h: 0 }
  const k = vp.k
  const labelSize = 12 / k

  const hint = ((): string | null => {
    switch (tool) {
      case 'add':
        return 'Click the image where a wire attaches. Esc to finish.'
      case 'group':
        return groupFirst ? 'Now click the LAST pin of the group.' : 'Click the FIRST pin of the group.'
      case 'calibrate':
        return calibratePts.length ? 'Click the second known point.' : 'Click two points with a known distance between them.'
      case 'crop':
        return 'Drag a rectangle around the area to keep.'
      case 'preview':
        return 'Fritzing preview: drag from a connector to draw a wire, click a wire to remove it. Hover shows the name.'
      default:
        return null
    }
  })()

  const renderMarker = (c: Connector): ReactNode => {
    const p = markerPos(c)
    if (!p || !c.breadboard) return null
    const w = Math.max(MARKER_MIN_PX / k, c.breadboard.w)
    const h = Math.max(MARKER_MIN_PX / k, c.breadboard.h)
    const r = Math.min(w, h) / 2
    const idx = part.connectors.indexOf(c)
    const selected = selection.includes(c.id)
    const cls = `marker${selected ? ' selected' : ''}${tool === 'preview' ? ' preview' : ''}`
    const arm = r * 1.6
    let shape: ReactNode
    switch (c.marker) {
      case 'rect':
        shape = <rect className="shape" x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} />
        break
      case 'crosshair':
        shape = (
          <>
            <circle className="shape" cx={p.x} cy={p.y} r={r} fill="transparent" />
            <line className="cross" x1={p.x - arm} y1={p.y} x2={p.x + arm} y2={p.y} />
            <line className="cross" x1={p.x} y1={p.y - arm} x2={p.x} y2={p.y + arm} />
          </>
        )
        break
      case 'pin':
        shape = (
          <>
            <rect className="shape" x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} />
            <line className="cross" x1={p.x} y1={p.y + h / 2} x2={p.x} y2={p.y + h * 1.4} />
          </>
        )
        break
      case 'target':
        shape = (
          <>
            <circle className="shape" cx={p.x} cy={p.y} r={r} />
            <circle className="cross" cx={p.x} cy={p.y} r={r * 0.4} fill="none" />
            <line className="cross" x1={p.x - arm} y1={p.y} x2={p.x - r * 0.5} y2={p.y} />
            <line className="cross" x1={p.x + r * 0.5} y1={p.y} x2={p.x + arm} y2={p.y} />
            <line className="cross" x1={p.x} y1={p.y - arm} x2={p.x} y2={p.y - r * 0.5} />
            <line className="cross" x1={p.x} y1={p.y + r * 0.5} x2={p.x} y2={p.y + arm} />
          </>
        )
        break
      default:
        shape = <circle className="shape" cx={p.x} cy={p.y} r={r} />
    }
    const label = c.number !== null && c.name ? `${c.number} ${c.name}` : connectorDisplayName(c, idx)
    return (
      <g
        key={c.id}
        className={cls}
        data-id={c.id}
        onPointerDown={(e) => onMarkerDown(e, c)}
        onPointerEnter={(e) => setHover({ id: c.id, x: e.clientX, y: e.clientY })}
        onPointerMove={(e) => setHover((hv) => (hv?.id === c.id ? { id: c.id, x: e.clientX, y: e.clientY } : hv))}
        onPointerLeave={() => setHover((hv) => (hv?.id === c.id ? null : hv))}
      >
        {/* invisible hit area */}
        <circle cx={p.x} cy={p.y} r={Math.max(r, 10 / k)} fill="transparent" />
        {shape}
        {showLabels && tool !== 'preview' && (
          <text x={p.x} y={p.y - h / 2 - 4 / k} fontSize={labelSize} textAnchor="middle">
            {label}
          </text>
        )}
      </g>
    )
  }

  const wirePath = (a: Pt, b: Pt): string => {
    const dx = Math.max(20 / k, Math.abs(b.x - a.x) * 0.4)
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  }
  const wireEnd = (to: string | Pt): Pt | null => {
    if (typeof to === 'string') {
      const c = part.connectors.find((x) => x.id === to)
      return c ? markerPos(c) : null
    }
    return to
  }

  const hoverConn = hover ? part.connectors.find((c) => c.id === hover.id) : null
  const containerRect = containerRef.current?.getBoundingClientRect()
  const cropBox = cropMode && art?.crop && displayArt ? cropOutline(displayArt, art.crop) : null

  return (
    <div ref={containerRef} className={`canvas tool-${tool}${spaceHeld ? ' panning' : ''}`} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}>
      <svg
        ref={svgRef}
        className="world"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursorMm(null)}
      >
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.k})`}>
          {displayArt && art ? (
            <>
              <defs>
                {art.crop && !cropMode && (
                  <clipPath id="artwork-crop">
                    <rect x={art.crop.x} y={art.crop.y} width={art.crop.w} height={art.crop.h} />
                  </clipPath>
                )}
              </defs>
              <rect x={0} y={0} width={out.w} height={out.h} fill="#ffffff" />
              <g transform={outputTransform(displayArt)}>
                <image
                  href={art.dataUrl}
                  width={art.pixelWidth}
                  height={art.pixelHeight}
                  preserveAspectRatio="none"
                  clipPath={art.crop && !cropMode ? 'url(#artwork-crop)' : undefined}
                  style={{ imageRendering: k > 4 ? 'pixelated' : 'auto' }}
                />
              </g>
              <rect x={0} y={0} width={out.w} height={out.h} fill="none" stroke="#5a5b66" strokeWidth={1 / k} />
              {cropBox && (
                <rect x={cropBox.x} y={cropBox.y} width={cropBox.w} height={cropBox.h} fill="none" stroke="#f0a033" strokeDasharray={`${6 / k} ${4 / k}`} strokeWidth={1 / k} />
              )}
            </>
          ) : (
            <text x={0} y={0} fill="#777" fontSize={16 / k}>
              Drop an image here, or use Open to choose one.
            </text>
          )}

          {/* preview wires */}
          {previewWires.map((w) => {
            const a = wireEnd(w.from)
            const b = wireEnd(w.to)
            if (!a || !b) return null
            return (
              <path
                key={w.id}
                className="wire"
                d={wirePath(a, b)}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  useStore.getState().removePreviewWire(w.id)
                }}
              />
            )
          })}
          {wireDrag && wireEnd(wireDrag.from) && <path className="wire dragging" d={wirePath(wireEnd(wireDrag.from)!, wireDrag.to)} />}

          {part.connectors.map(renderMarker)}

          {groupFirst && displayArt && (
            <circle cx={naturalToOutput(displayArt, groupFirst).x} cy={naturalToOutput(displayArt, groupFirst).y} r={6 / k} fill="#4fd1ff" stroke="#fff" strokeWidth={1 / k} />
          )}
          {displayArt &&
            calibratePts.map((p, i) => (
              <circle key={i} cx={naturalToOutput(displayArt, p).x} cy={naturalToOutput(displayArt, p).y} r={5 / k} fill="#f0a033" stroke="#fff" strokeWidth={1 / k} />
            ))}
          {cropRect && (
            <rect
              x={Math.min(cropRect.a.x, cropRect.b.x)}
              y={Math.min(cropRect.a.y, cropRect.b.y)}
              width={Math.abs(cropRect.b.x - cropRect.a.x)}
              height={Math.abs(cropRect.b.y - cropRect.a.y)}
              fill="rgba(79,156,245,0.15)"
              stroke="#4f9cf5"
              strokeWidth={1 / k}
            />
          )}
        </g>
      </svg>

      {hint && <div className="canvas-hint">{hint}</div>}
      {hoverConn && hover && containerRect && (tool === 'preview' || !showLabels) && (
        <div className="canvas-tooltip" style={{ left: hover.x - containerRect.left, top: hover.y - containerRect.top }}>
          {connectorDisplayName(hoverConn, part.connectors.indexOf(hoverConn))}
          {hoverConn.description ? <div className="dim">{hoverConn.description}</div> : null}
        </div>
      )}
      <div className="zoom-ctl">
        <button className="small" onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
          −
        </button>
        <button className="small" onClick={fit} title="Fit to window">
          Fit
        </button>
        <button className="small" onClick={() => zoomBy(1.25)} title="Zoom in">
          +
        </button>
        <span className="dim" style={{ padding: '2px 6px', fontSize: 11, minWidth: 110 }}>
          {Math.round(k * 100)}%{cursorMm ? ` · ${round(cursorMm.x, 1)}, ${round(cursorMm.y, 1)} mm` : ''}
        </span>
      </div>
    </div>
  )
}

/** Outline of a natural-px crop rectangle in output space (for the uncropped display used while cropping). */
function cropOutline(displayArt: Artwork, crop: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const a = naturalToOutput(displayArt, { x: crop.x, y: crop.y })
  const b = naturalToOutput(displayArt, { x: crop.x + crop.w, y: crop.y + crop.h })
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}
