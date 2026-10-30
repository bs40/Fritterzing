/**
 * File access abstraction: Electron (native dialogs via the preload bridge)
 * or plain browser (file inputs, downloads, IndexedDB autosave).
 */
export interface FileFilter {
  name: string
  extensions: string[]
}
export interface LoadedFile {
  path: string | null
  name: string
  bytes: Uint8Array
}

export interface Platform {
  isElectron: boolean
  openFile(filters: FileFilter[]): Promise<LoadedFile | null>
  saveFileAs(defaultName: string, filters: FileFilter[], bytes: Uint8Array): Promise<string | null>
  writeFile(path: string, bytes: Uint8Array): Promise<string>
  autosaveWrite(bytes: Uint8Array): Promise<void>
  autosaveRead(): Promise<LoadedFile | null>
  openExternal(url: string): void
}

export const FILTERS = {
  project: [{ name: 'Fritterzing project', extensions: ['fpe'] }],
  fzpz: [{ name: 'Fritzing part', extensions: ['fzpz'] }],
  openAny: [
    { name: 'All supported', extensions: ['fpe', 'fzpz', 'fzp', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp'] },
    { name: 'Fritterzing project', extensions: ['fpe'] },
    { name: 'Fritzing part', extensions: ['fzpz', 'fzp'] },
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp'] }
  ],
  images: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp'] }],
  svg: [{ name: 'SVG', extensions: ['svg'] }],
  fzp: [{ name: 'Fritzing part definition', extensions: ['fzp'] }],
  zip: [{ name: 'Zip archive', extensions: ['zip'] }]
}

function electronPlatform(api: NonNullable<Window['fritterzing']>): Platform {
  return {
    isElectron: true,
    openFile: (filters) => api.openFile(filters),
    saveFileAs: (defaultName, filters, bytes) => api.saveFileAs(defaultName, filters, bytes),
    writeFile: (path, bytes) => api.writeFile(path, bytes),
    autosaveWrite: async (bytes) => {
      await api.autosaveWrite(bytes)
    },
    autosaveRead: () => api.autosaveRead(),
    openExternal: (url) => void api.openExternal(url)
  }
}

const DB = 'fritterzing'
const STORE = 'autosave'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function browserPlatform(): Platform {
  return {
    isElectron: false,
    openFile: (filters) =>
      new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')
        input.onchange = async () => {
          const f = input.files?.[0]
          if (!f) return resolve(null)
          resolve({ path: null, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
        }
        input.oncancel = () => resolve(null)
        input.click()
      }),
    saveFileAs: async (defaultName, _filters, bytes) => {
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName.split(/[\\/]/).pop() ?? defaultName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      return a.download
    },
    writeFile: async (path, bytes) => {
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.split(/[\\/]/).pop() ?? path
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      return path
    },
    autosaveWrite: async (bytes) => {
      try {
        const db = await idb()
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite')
          tx.objectStore(STORE).put(bytes, 'current')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      } catch {
        /* autosave is best effort */
      }
    },
    autosaveRead: async () => {
      try {
        const db = await idb()
        const bytes = await new Promise<Uint8Array | undefined>((resolve, reject) => {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current')
          req.onsuccess = () => resolve(req.result as Uint8Array | undefined)
          req.onerror = () => reject(req.error)
        })
        return bytes ? { path: null, name: 'autosave.fpe', bytes } : null
      } catch {
        return null
      }
    },
    openExternal: (url) => window.open(url, '_blank', 'noopener')
  }
}

export const platform: Platform = window.fritterzing ? electronPlatform(window.fritterzing) : browserPlatform()

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

export function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '')
}
