import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createConnector, createPart, fzConnectorId, type Part } from '@core/model'
import { compilePart } from '@core/compile'
import { validatePart, applyFix, summarize } from '@core/validate'
import { packFzpz, unpackFzpz } from '@core/fzpz'
import { importFzpz, parseFzp } from '@core/importFzp'
import { saveProject, loadProject } from '@core/project'
import { schematicLayout } from '@core/svg/schematic'
import { measureSvg, pathBox, parseTransform } from '@core/svgGeom'
import { naturalToMm, outputToNatural, naturalToOutput, rotated, withCrop, calibrated } from '@core/artwork'
import { spacedPoints } from '@core/groups'
import { prefixIds, ensureLayer } from '@core/svg/common'
import { parseXml } from '@core/xml'

// 1x1 transparent png
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function samplePart(): Part {
  const part = createPart('YD7010', { manufacturer: 'YaMoRC', partNumber: 'YD7010', description: 'DCC command station' })
  part.artwork = {
    kind: 'raster',
    mime: 'image/png',
    fileName: 'yd7010.png',
    dataUrl: PNG,
    svgText: null,
    pixelWidth: 1600,
    pixelHeight: 800,
    widthMm: 160,
    heightMm: 80,
    rotation: 0,
    crop: null,
    locked: false
  }
  const names = ['Track A', 'Track B', 'Prog A', 'Prog B']
  part.connectors = names.map((name, i) =>
    createConnector({ name, number: i + 1, kind: 'screw', description: `${name} terminal`, breadboard: { x: 100 + i * 50, y: 100, w: 30, h: 30 } })
  )
  return part
}

describe('compile', () => {
  it('produces all files with Fritzing naming and ids', () => {
    const part = samplePart()
    const c = compilePart(part)
    expect(c.files.map((f) => f.archiveName)).toEqual([
      `part.${part.moduleId}.fzp`,
      `svg.breadboard.${part.moduleId}_breadboard.svg`,
      `svg.schematic.${part.moduleId}_schematic.svg`,
      `svg.icon.${part.moduleId}_icon.svg`
    ])
    expect(c.breadboard).toContain('id="breadboard"')
    expect(c.breadboard).toContain('id="connector0pin"')
    expect(c.breadboard).toContain('id="connector3terminal"')
    expect(c.schematic).toContain('id="schematic"')
    expect(c.schematic).toContain('id="connector2pin"')
    expect(c.icon).toContain('id="icon"')
    expect(c.fzp).toContain('moduleId="' + part.moduleId + '"')
    expect(c.fzp).toContain('<property name="family">')
    // wiring-only: pcb view reuses breadboard
    expect(c.pcb).toBeNull()
    expect(c.fzp).toMatch(/<pcbView>\s*<layers image="breadboard\//)
    // all svgs parse
    for (const f of c.files) parseXml(f.content)
  })

  it('positions breadboard connectors at the physical location', () => {
    const part = samplePart()
    const c = compilePart(part)
    // connector0 at px (100,100) of 1600x800 => 10mm,10mm
    expect(c.breadboard).toMatch(/id="connector0pin" cx="10" cy="10"/)
  })

  it('generates copper layers for PCB-mounted parts', () => {
    const part = samplePart()
    part.pcb = { ...part.pcb, mode: 'generated', template: 'sip', pitchMm: 5.08 }
    const c = compilePart(part)
    expect(c.pcb).not.toBeNull()
    expect(c.pcb).toContain('id="copper1"')
    expect(c.pcb).toContain('id="copper0"')
    expect(c.pcb).toContain('id="silkscreen"')
    expect(c.pcb).toContain('id="connector3pin"')
    expect(c.fzp).toContain('<p layer="copper0" svgId="connector0pin"/>')
    expect(c.fzp).toContain('<layer layerId="copper1"/>')
  })

  it('schematic pins land on the 2.54 mm grid', () => {
    const part = samplePart()
    const lay = schematicLayout(part)
    for (const p of lay.pins) {
      const y = p.side === 'left' || p.side === 'right' ? p.y1 : p.x1
      expect(Math.abs((y / 2.54) % 1)).toBeLessThan(1e-6)
    }
    expect(lay.pins.filter((p) => p.side === 'left').length).toBe(2)
    expect(lay.pins.filter((p) => p.side === 'right').length).toBe(2)
  })

  it('validates a good part as ready', () => {
    const part = samplePart()
    const issues = validatePart(part, compilePart(part))
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(summarize(issues).level).toBe('ok')
  })

  it('reports and fixes problems in plain language', () => {
    const part = samplePart()
    part.connectors[1].breadboard = null
    part.connectors[2].name = 'Track A'
    const issues = validatePart(part, compilePart(part))
    expect(issues.some((i) => i.message.startsWith('Track B has no connection point in Breadboard View'))).toBe(true)
    expect(issues.some((i) => i.fix === 'dedupe-names')).toBe(true)
    const fixed = applyFix(part, 'dedupe-names')
    const names = fixed.connectors.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('fzpz round trip', () => {
  it('packs, unpacks and re-imports with connector positions intact', async () => {
    const part = samplePart()
    const compiled = compilePart(part)
    const bytes = await packFzpz(compiled)
    const unpacked = await unpackFzpz(bytes)
    expect(unpacked.fzpName).toBe(`part.${part.moduleId}.fzp`)
    expect(Object.keys(unpacked.svgs).sort()).toEqual(['breadboard', 'icon', 'schematic'])
    const parsed = parseFzp(unpacked.fzp)
    expect(parsed.connectors.length).toBe(4)
    expect(parsed.title).toBe('YD7010')

    const { part: imported, notes } = importFzpz(unpacked, 'YD7010.fzpz')
    expect(notes).toEqual([])
    expect(imported.artwork?.kind).toBe('svg')
    expect(imported.artwork?.widthMm).toBeCloseTo(160, 3)
    expect(imported.connectors.map((c) => c.name)).toEqual(['Track A', 'Track B', 'Prog A', 'Prog B'])
    expect(imported.connectors[0].fzId).toBe('connector0')
    // connector 0 at 10mm,10mm in a 160x80 viewBox
    expect(imported.connectors[0].breadboard?.x).toBeCloseTo(10, 3)
    expect(imported.connectors[0].breadboard?.y).toBeCloseTo(10, 3)
    expect(imported.pcb.mode).toBe('none')
    expect(imported.schematic.mode).toBe('custom')

    // Re-export of the imported part is valid and keeps connector ids.
    const again = compilePart(imported)
    const issues = validatePart(imported, again)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(again.breadboard).toContain('id="art-connector0pin"')
    expect(again.breadboard).toContain('id="connector0pin"')
    expect(fzConnectorId(imported.connectors[3], 3)).toBe('connector3')
  })
})

describe('sample YD7010 part from files/', () => {
  const samplePath = resolve(__dirname, '../files/YD7010_YaMoRC.fzpz')
  const exists = existsSync(samplePath)
  it.skipIf(!exists)('imports, unwraps the embedded picture and re-exports cleanly', async () => {
    const bytes = new Uint8Array(readFileSync(samplePath))
    const unpacked = await unpackFzpz(bytes)
    const { part, notes } = importFzpz(unpacked, 'YD7010_YaMoRC.fzpz')
    expect(part.metadata.title).toBe('YaMoRC YD7010 Command Station')
    expect(part.metadata.manufacturer).toBe('YaMoRC')
    expect(part.metadata.partNumber).toBe('YD7010')
    expect(part.connectors.length).toBe(14)
    expect(part.connectors.map((c) => c.name).slice(0, 6)).toEqual(['LAN', 'S88N-IN', 'LocoNET B', 'LocoNET T', 'TRACK A', 'TRACK B'])
    // picture unwrapped from the svg wrapper
    expect(part.artwork?.kind).toBe('raster')
    expect(part.artwork?.pixelWidth).toBe(1710)
    expect(part.artwork?.widthMm).toBeCloseTo(152.4, 2)
    // connector4 (TRACK A) terminal at 795,110 viewBox units
    expect(part.connectors[4].breadboard?.x).toBeCloseTo(795, 3)
    expect(part.connectors[4].breadboard?.y).toBeCloseTo(110, 3)
    expect(part.connectors[4].breadboard?.w).toBeCloseTo(28, 3)
    // oversized icon discarded, schematic kept, no pcb
    expect(part.icon.mode).toBe('generated')
    expect(part.schematic.mode).toBe('custom')
    expect(part.pcb.mode).toBe('none')
    expect(notes.some((n) => n.includes('icon'))).toBe(true)

    const compiled = compilePart(part)
    const issues = validatePart(part, compiled)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(compiled.breadboard).toMatch(/<image[^>]*xlink:href="data:image\/png;base64,/)
    expect(compiled.breadboard).not.toContain('art-')
    expect(compiled.icon.length).toBeLessThan(2_100_000)
    expect(compiled.icon).toContain('id="icon"')
    // TRACK A pad centre in mm: 795/1710*152.4, 110/920*(3.22807*25.4)
    expect(compiled.breadboard).toMatch(/id="connector4pin" cx="70\.85\d*" cy="9\.80\d*"/)
    expect(compiled.fzp).toContain('<p layer="schematic" svgId="connector4pin" terminalId="connector4terminal"/>')
    const packed = await packFzpz(compiled)
    expect(packed.length).toBeGreaterThan(1000)
  })
})

describe('project file', () => {
  it('saves and loads .fpe with artwork', async () => {
    const part = samplePart()
    const bytes = await saveProject(part, compilePart(part))
    const loaded = await loadProject(bytes)
    expect(loaded.metadata.title).toBe('YD7010')
    expect(loaded.artwork?.dataUrl).toBe(PNG)
    expect(loaded.connectors.length).toBe(4)
    expect(loaded.connectors[2].breadboard).toEqual({ x: 200, y: 100, w: 30, h: 30 })
  })
})

describe('svg geometry', () => {
  it('measures transformed elements', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="0.5in" viewBox="0 0 100 50">
      <g transform="translate(10 5)"><g transform="scale(2)"><rect id="a" x="5" y="5" width="10" height="10"/></g>
      <path id="p" d="M 0 0 l 10 0 L 10 10 z"/></g>
      <circle id="c" cx="50" cy="25" r="5" transform="rotate(90 50 25)"/>
    </svg>`
    const m = measureSvg(svg, ['a', 'p', 'c', 'missing'])
    expect(m.info.widthMm).toBeCloseTo(25.4, 4)
    expect(m.boxes.get('a')!.cx).toBeCloseTo(10 + 2 * 10, 4)
    expect(m.boxes.get('a')!.cy).toBeCloseTo(5 + 2 * 10, 4)
    expect(m.boxes.get('p')!.box).toEqual({ x: 10, y: 5, w: 10, h: 10 })
    expect(m.boxes.get('c')!.cx).toBeCloseTo(50, 4)
    expect(m.boxes.has('missing')).toBe(false)
  })
  it('parses paths and transforms', () => {
    expect(pathBox('M10,10 h20 v5 c1,1 2,2 3,3')).toEqual({ x: 10, y: 10, w: 23, h: 8 })
    const t = parseTransform('translate(3,4) scale(2)')
    expect(t).toEqual([2, 0, 0, 2, 3, 4])
  })
  it('prefixes ids and references, and adds layers', () => {
    const frag = '<defs><linearGradient id="g1"/></defs><rect id="r" fill="url(#g1)"/><use xlink:href="#r"/>'
    const out = prefixIds(frag, 'art-')
    expect(out).toContain('id="art-g1"')
    expect(out).toContain('url(#art-g1)')
    expect(out).toContain('xlink:href="#art-r"')
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    expect(ensureLayer(svg, 'schematic').svg).toContain('<g id="schematic"><rect/></g>')
    expect(ensureLayer(ensureLayer(svg, 'schematic').svg, 'schematic').added).toBe(false)
  })
})

describe('artwork geometry', () => {
  it('rotation and crop map points consistently', () => {
    const art = samplePart().artwork!
    const r = rotated(art, 90)
    expect(r.widthMm).toBe(80)
    expect(r.heightMm).toBe(160)
    const p = { x: 100, y: 100 }
    const o = naturalToOutput(r, p)
    expect(o).toEqual({ x: 700, y: 100 })
    expect(outputToNatural(r, o)).toEqual(p)
    const cropped = withCrop(art, { x: 100, y: 100, w: 800, h: 400 })
    expect(cropped.widthMm).toBeCloseTo(80)
    expect(naturalToMm(cropped, { x: 100, y: 100 })).toEqual({ x: 0, y: 0 })
    const cal = calibrated(art, { x: 0, y: 0 }, { x: 100, y: 0 }, 5.08)
    expect(cal.widthMm).toBeCloseTo(81.28)
  })
  it('spaces group points', () => {
    const pts = spacedPoints({ x: 0, y: 0 }, { x: 30, y: 0 }, 4)
    expect(pts.map((p) => p.x)).toEqual([0, 10, 20, 30])
  })
})
