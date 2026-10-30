import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join, basename } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: 'Fritterzing',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1f24',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

interface FileFilter {
  name: string
  extensions: string[]
}

app.whenReady().then(() => {
  ipcMain.handle('dialog:open', async (_e, filters: FileFilter[]) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (r.canceled || r.filePaths.length === 0) return null
    const path = r.filePaths[0]
    const bytes = await readFile(path)
    return { path, name: basename(path), bytes: new Uint8Array(bytes) }
  })

  ipcMain.handle(
    'dialog:save',
    async (_e, args: { defaultPath: string; filters: FileFilter[]; bytes: Uint8Array }) => {
      const r = await dialog.showSaveDialog({ defaultPath: args.defaultPath, filters: args.filters })
      if (r.canceled || !r.filePath) return null
      await writeFile(r.filePath, Buffer.from(args.bytes))
      return r.filePath
    }
  )

  ipcMain.handle('fs:read', async (_e, path: string) => {
    const bytes = await readFile(path)
    return { path, name: basename(path), bytes: new Uint8Array(bytes) }
  })

  ipcMain.handle('fs:write', async (_e, args: { path: string; bytes: Uint8Array }) => {
    await writeFile(args.path, Buffer.from(args.bytes))
    return args.path
  })

  const autosaveDir = join(app.getPath('userData'), 'autosave')
  const autosavePath = join(autosaveDir, 'current.fpe')

  ipcMain.handle('autosave:write', async (_e, bytes: Uint8Array) => {
    await mkdir(autosaveDir, { recursive: true })
    await writeFile(autosavePath, Buffer.from(bytes))
    return autosavePath
  })
  ipcMain.handle('autosave:read', async () => {
    if (!existsSync(autosavePath)) return null
    const bytes = await readFile(autosavePath)
    return { path: autosavePath, name: 'current.fpe', bytes: new Uint8Array(bytes) }
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('shell:showItem', (_e, path: string) => shell.showItemInFolder(path))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
