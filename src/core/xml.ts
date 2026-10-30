/** Minimal XML helpers used by the generators. */

export function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Render an attribute list; attributes whose value is null/undefined are omitted. */
export function attrs(a: Record<string, string | number | null | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('')
}

export function el(name: string, a: Record<string, string | number | null | undefined>, inner?: string): string {
  if (inner === undefined || inner === '') return `<${name}${attrs(a)}/>`
  return `<${name}${attrs(a)}>${inner}</${name}>`
}

/** Make a string safe to use as an XML id (Fritzing is picky about odd characters). */
export function xmlId(s: string): string {
  const out = s.replace(/[^A-Za-z0-9_.:-]+/g, '_')
  return /^[A-Za-z_]/.test(out) ? out : `_${out}`
}

/** Parse XML with the platform DOMParser; throws a readable error on malformed input. */
export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const err = doc.getElementsByTagName('parsererror')[0]
  if (err) {
    throw new Error(`Malformed XML: ${err.textContent?.split('\n')[0] ?? 'unknown error'}`)
  }
  return doc
}

export function serializeXml(node: Node): string {
  return new XMLSerializer().serializeToString(node)
}
