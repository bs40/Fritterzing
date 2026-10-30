/** Identifier helpers: unique module ids, safe file names, local ids. */

export function randomHex(chars = 8): string {
  const bytes = new Uint8Array(Math.ceil(chars / 2))
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, chars)
}

/** Reduce an arbitrary title to something safe for file names and XML ids. */
export function safeName(input: string, maxLen = 40): string {
  const s = (input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, maxLen)
  return s || 'part'
}

/** A Fritzing moduleId such as `YD7010_a84f9192`. */
export function newModuleId(title: string): string {
  return `${safeName(title)}_${randomHex(8)}`
}

/** A stable local id for model objects, independent of Fritzing's connectorN numbering. */
export function newLocalId(prefix = 'c'): string {
  return `${prefix}_${randomHex(10)}`
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
