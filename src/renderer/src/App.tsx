import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from './store'
import { useValidation } from './useValidation'
import { platform } from './platform'
import { exportFzpz, filesFromDrop, openFiles, openWithDialog, saveProject, confirmDiscard } from './actions'
import { projectBytes } from './files'
import { nudgeSelection, duplicateSelection } from './ops'
import { Toolbar, Sidebar, BottomBar, Notices } from './components/Chrome'
import { BreadboardCanvas } from './components/BreadboardCanvas'
import { SchematicView, PcbView, IconView } from './components/Views'
import { Inspector } from './components/Inspector'
import { Dialogs } from './components/Dialogs'
import { StartScreen } from './components/StartScreen'

export function App(): ReactNode {
  const part = useStore((s) => s.part)
  const view = useStore((s) => s.view)
  const dirty = useStore((s) => s.dirty)
  const [dragging, setDragging] = useState(false)
  const [autosave, setAutosave] = useState<Uint8Array | null>(null)
  const dragDepth = useRef(0)
  useValidation()

  // Offer to restore an autosave on first start.
  useEffect(() => {
    void platform.autosaveRead().then((f) => {
      if (f && f.bytes.length > 0) setAutosave(f.bytes)
    })
  }, [])

  // Autosave the working project a few seconds after every change.
  useEffect(() => {
    if (!part || !dirty) return
    const t = setTimeout(() => {
      void projectBytes(part).then((bytes) => platform.autosaveWrite(bytes))
    }, 3000)
    return () => clearTimeout(t)
  }, [part, dirty])

  // Warn before closing with unsaved changes (browser mode and Electron).
  useEffect(() => {
    const h = (e: BeforeUnloadEvent): void => {
      if (useStore.getState().dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useStore.getState()
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveProject()
        return
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openWithDialog()
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void confirmDiscard().then((ok) => {
          if (ok) {
            st.closePart()
            st.openDialog('new')
          }
        })
        return
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        void exportFzpz()
        return
      }
      if (inField || st.dialog) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (!st.part) return
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        st.select(st.part.connectors.map((c) => c.id))
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if (mod) return
      switch (e.key) {
        case 'Escape':
          st.setTool('select')
          break
        case 'Delete':
        case 'Backspace':
          if (st.selection.length) {
            e.preventDefault()
            st.deleteConnectors(st.selection)
          }
          break
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!st.selection.length || st.view !== 'breadboard') return
          e.preventDefault()
          const step = e.shiftKey ? 0.1 : 1
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
          nudgeSelection(dx, dy)
          break
        }
        case 'a':
        case 'A':
          if (st.view === 'breadboard' && st.part.artwork) st.setTool(st.tool === 'add' ? 'select' : 'add')
          break
        case 'g':
        case 'G':
          if (st.view === 'breadboard' && st.part.artwork) st.openDialog('group')
          break
        case 'p':
        case 'P':
          if (st.view === 'breadboard' && st.part.artwork) st.setTool(st.tool === 'preview' ? 'select' : 'preview')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Drag and drop anywhere in the window.
  useEffect(() => {
    const over = (e: DragEvent): void => {
      e.preventDefault()
    }
    const enter = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) {
        dragDepth.current++
        setDragging(true)
      }
    }
    const leave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (!e.dataTransfer) return
      void filesFromDrop(e.dataTransfer).then(openFiles)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  useEffect(() => {
    document.title = part ? `${part.metadata.title || 'Untitled'}${dirty ? ' •' : ''} - Fritterzing` : 'Fritterzing'
  }, [part, dirty])

  return (
    <>
      {part ? (
        <div className="app">
          <Toolbar />
          <Sidebar />
          <div className="canvas-area">
            {view === 'breadboard' && <BreadboardCanvas />}
            {view === 'schematic' && <SchematicView />}
            {view === 'pcb' && <PcbView />}
            {view === 'icon' && <IconView />}
          </div>
          <div className="inspector">
            <Inspector />
          </div>
          <BottomBar />
        </div>
      ) : (
        <div className="app" style={{ gridTemplateAreas: "'toolbar toolbar toolbar' 'start start start' 'start start start'" }}>
          <Toolbar />
          <div style={{ gridArea: 'start', position: 'relative' }}>
            <StartScreen autosave={autosave} />
          </div>
        </div>
      )}
      {dragging && <div className="drop-overlay">Drop to open</div>}
      <Dialogs />
      <Notices />
    </>
  )
}
