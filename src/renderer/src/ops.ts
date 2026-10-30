/** Canvas operations shared by the canvas, keyboard handling and dialogs. */
import type { Artwork, Connector, ConnectorKind } from '@core/model'
import { createConnector, kindInfo, nextConnectorNumber } from '@core/model'
import { mmPerPx, mmToNatural, naturalToMm, naturalToOutput, outputToNatural, sizeToPx, type Pt } from '@core/artwork'
import { useStore } from './store'

export function snapNatural(art: Artwork, p: Pt, gridMm: number): Pt {
  if (!(gridMm > 0)) return p
  const mm = naturalToMm(art, p)
  return mmToNatural(art, { x: Math.round(mm.x / gridMm) * gridMm, y: Math.round(mm.y / gridMm) * gridMm })
}

export function makeConnectorAt(art: Artwork, natural: Pt, kind: ConnectorKind, extra: Partial<Connector> = {}): Connector {
  const part = useStore.getState().part!
  const info = kindInfo(kind)
  const sizePx = Math.max(4, sizeToPx(art, info.sizeMm))
  return createConnector({
    kind,
    number: nextConnectorNumber(part),
    marker: info.marker,
    breadboard: { x: natural.x, y: natural.y, w: sizePx, h: sizePx },
    ...extra
  })
}

/** Move the selected connectors by a screen-oriented offset in millimetres. */
export function nudgeSelection(dxMm: number, dyMm: number): void {
  const st = useStore.getState()
  const part = st.part
  if (!part?.artwork || st.selection.length === 0) return
  const art = part.artwork
  const s = mmPerPx(art)
  const dx = s.x ? dxMm / s.x : 0
  const dy = s.y ? dyMm / s.y : 0
  st.updateConnectors(st.selection, (c) => {
    if (!c.breadboard) return {}
    const o = naturalToOutput(art, c.breadboard)
    const n = outputToNatural(art, { x: o.x + dx, y: o.y + dy })
    return { breadboard: { ...c.breadboard, x: n.x, y: n.y } }
  })
}

export function duplicateSelection(): void {
  const st = useStore.getState()
  const part = st.part
  if (!part?.artwork) return
  const art = part.artwork
  const off = sizeToPx(art, 2.54)
  const copies = part.connectors
    .filter((c) => st.selection.includes(c.id))
    .map((c, i) =>
      createConnector({
        ...c,
        id: undefined,
        name: c.name ? `${c.name} copy` : '',
        number: nextConnectorNumber(part) + i,
        fzId: null,
        importedIds: {},
        breadboard: c.breadboard ? { ...c.breadboard, x: c.breadboard.x + off, y: c.breadboard.y + off } : null
      })
    )
  if (copies.length) st.addConnectors(copies)
}
