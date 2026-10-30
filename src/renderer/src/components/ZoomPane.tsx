import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Pan/zoom container for a rendered SVG string (schematic, PCB, icon previews). */
export function ZoomPane({ svg, className, initialScale, children }: { svg: string; className?: string; initialScale?: number; children?: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const sheet = sheetRef.current
    if (!el || !sheet) return
    const svgEl = sheet.querySelector('svg')
    if (!svgEl) return
    const w = svgEl.getBoundingClientRect().width / vp.k || 100
    const h = svgEl.getBoundingClientRect().height / vp.k || 100
    const k = initialScale ?? Math.min((el.clientWidth - 60) / w, (el.clientHeight - 60) / h, 12)
    setVp({ k, x: (el.clientWidth - w * k) / 2, y: (el.clientHeight - h * k) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg.length, initialScale])

  return (
    <div
      ref={ref}
      className={`svg-preview ${className ?? ''}`}
      style={{ cursor: 'grab' }}
      onWheel={(e) => {
        const r = ref.current!.getBoundingClientRect()
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        const k = Math.min(80, Math.max(0.05, vp.k * Math.exp(-e.deltaY * 0.0015)))
        setVp({ k, x: mx - (mx - vp.x) * (k / vp.k), y: my - (my - vp.y) * (k / vp.k) })
      }}
      onPointerDown={(e) => {
        drag.current = { sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        setVp({ ...vp, x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy })
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div
        ref={sheetRef}
        className={`sheet ${className ?? ''}`}
        style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.k})` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {children}
    </div>
  )
}
