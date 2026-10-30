import { useMemo, type ReactNode } from 'react'
import { generateSchematicSvg } from '@core/svg/schematic'
import { generatePcbSvg } from '@core/svg/pcb'
import { generateIconSvg } from '@core/svg/icon'
import { useStore } from '../store'
import { ZoomPane } from './ZoomPane'

export function SchematicView(): ReactNode {
  const part = useStore((s) => s.part)!
  const svg = useMemo(() => generateSchematicSvg(part), [part])
  return <ZoomPane svg={svg} />
}

export function PcbView(): ReactNode {
  const part = useStore((s) => s.part)!
  const svg = useMemo(() => generatePcbSvg(part), [part])
  if (!svg) {
    return (
      <div className="svg-preview">
        <div style={{ textAlign: 'center', maxWidth: 420 }} className="dim">
          <p style={{ fontSize: 15 }}>This component is not PCB mounted.</p>
          <p>It will appear in Fritzing's breadboard and schematic views and can be wired, but it is left off the PCB. Change this in the panel on the right if the part has a real footprint.</p>
        </div>
      </div>
    )
  }
  return <ZoomPane svg={svg} className="pcb" />
}

export function IconView(): ReactNode {
  const part = useStore((s) => s.part)!
  const svg = useMemo(() => generateIconSvg(part), [part])
  return (
    <ZoomPane svg={svg} initialScale={6}>
      <div style={{ position: 'absolute', left: 16, top: 16 }} className="dim">
        Parts-bin icon, shown at 6× (32 × 32 px).
        <div className="sheet" style={{ marginTop: 8, width: 32, height: 32, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </ZoomPane>
  )
}
