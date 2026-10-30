import type { ReactNode } from 'react'
import { useStore } from '../store'
import { openWithDialog } from '../actions'
import { platform } from '../platform'
import { readProjectMeta } from '@core/project'

export function StartScreen({ autosave }: { autosave: Uint8Array | null }): ReactNode {
  const openDialog = useStore((s) => s.openDialog)
  return (
    <div className="start">
      <div className="card">
        <h1>Fritterzing</h1>
        <div className="tagline">Fritzing Parts Editor. Drop in a picture of an electronic component, click where the wires attach, name the connections, and export a working Fritzing part.</div>
        <div className="actions">
          <button className="big primary" onClick={() => openDialog('new')}>
            <b>Create new part</b>
            <span>Start from a photo, illustration or SVG of the module. Only a name is required.</span>
          </button>
          <button className="big" onClick={openWithDialog}>
            <b>Open</b>
            <span>A Fritterzing project (.fpe), an existing Fritzing part (.fzpz / .fzp) to inspect or repair, or an image.</span>
          </button>
        </div>
        {autosave && (
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={() => void readProjectMeta(autosave).then((meta) => openDialog('restore', { bytes: autosave, meta }))}>Recover unsaved work</button>
            <span className="dim">Changes that were autosaved but never saved to a project file.</span>
          </div>
        )}
        <div className="dropzone">Or drop an image, .fzpz, .fzp or .fpe file anywhere in this window</div>
        <div className="faint" style={{ marginTop: 14, fontSize: 11 }}>
          {platform.isElectron ? 'Desktop app' : 'Browser mode: files are opened with the file picker and saved as downloads.'} · MIT licence ·{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); platform.openExternal('https://fritzing.org') }} style={{ color: 'var(--accent)' }}>
            fritzing.org
          </a>
        </div>
      </div>
    </div>
  )
}
