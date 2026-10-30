import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface FileFilter {
  name: string
  extensions: string[]
}
export interface LoadedFile {
  path: string
  name: string
  bytes: Uint8Array
}

const api = {
  isElectron: true,
  openFile: (filters: FileFilter[]): Promise<LoadedFile | null> => ipcRenderer.invoke('dialog:open', filters),
  saveFileAs: (defaultPath: string, filters: FileFilter[], bytes: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save', { defaultPath, filters, bytes }),
  readFile: (path: string): Promise<LoadedFile> => ipcRenderer.invoke('fs:read', path),
  writeFile: (path: string, bytes: Uint8Array): Promise<string> => ipcRenderer.invoke('fs:write', { path, bytes }),
  autosaveWrite: (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke('autosave:write', bytes),
  autosaveRead: (): Promise<LoadedFile | null> => ipcRenderer.invoke('autosave:read'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type FritterzingApi = typeof api

contextBridge.exposeInMainWorld('fritterzing', api)
