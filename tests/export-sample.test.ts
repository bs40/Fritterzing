/**
 * Writes re-exported sample parts into files/ for manual testing in Fritzing.
 * Only runs when EXPORT_SAMPLE=1 is set:  EXPORT_SAMPLE=1 npx vitest run tests/export-sample.test.ts
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unpackFzpz, packFzpz } from '@core/fzpz'
import { importFzpz } from '@core/importFzp'
import { compilePart } from '@core/compile'
import { validatePart } from '@core/validate'

const enabled = process.env['EXPORT_SAMPLE'] === '1'
const dir = resolve(__dirname, '../files')

describe('export samples for Fritzing', () => {
  it.skipIf(!enabled || !existsSync(resolve(dir, 'YD7010_YaMoRC.fzpz')))('re-exports the YD7010 sample', async () => {
    const unpacked = await unpackFzpz(new Uint8Array(readFileSync(resolve(dir, 'YD7010_YaMoRC.fzpz'))))
    const { part } = importFzpz(unpacked, 'YD7010_YaMoRC.fzpz')
    // generated schematic variant as well as the original custom one
    const compiledCustom = compilePart(part)
    expect(validatePart(part, compiledCustom).filter((i) => i.severity === 'error')).toEqual([])
    writeFileSync(resolve(dir, 'YD7010_fritterzing_reexport.fzpz'), await packFzpz(compiledCustom))

    const generated = { ...part, schematic: { ...part.schematic, mode: 'generated' as const } }
    const compiledGen = compilePart(generated)
    expect(validatePart(generated, compiledGen).filter((i) => i.severity === 'error')).toEqual([])
    writeFileSync(resolve(dir, 'YD7010_fritterzing_generated_schematic.fzpz'), await packFzpz(compiledGen))
  })
})
