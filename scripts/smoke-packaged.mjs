#!/usr/bin/env node
/**
 * Smoke-test a packaged Fritterzing build over the Chrome DevTools Protocol.
 *
 *   npm run smoke -- "release/Fritterzing 0.1.0.exe" [files/YD7010_YaMoRC.fzpz]
 *
 * Launches the executable with --remote-debugging-port, waits for the renderer,
 * checks the Electron bridge, imports the sample part through the app's own
 * drop handler, verifies the connectors and validation state, round-trips the
 * autosave, saves screenshots into smoke-out/, closes the app and exits
 * non-zero on any failure. Needs Node 22+ (built-in fetch and WebSocket).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const exe = process.argv[2]
const sample = resolve(process.argv[3] ?? 'files/YD7010_YaMoRC.fzpz')
const port = Number(process.env.SMOKE_PORT ?? 9333)
const outDir = resolve('smoke-out')
if (!exe || !existsSync(exe)) {
  console.error('usage: node scripts/smoke-packaged.mjs <path to Fritterzing exe> [sample.fzpz]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const child = spawn(exe, [`--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore' })
child.unref()

let target = null
for (let i = 0; i < 60 && !target; i++) {
  await sleep(1000)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    target = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
  } catch {
    /* not up yet */
  }
}
check('renderer page reachable', !!target)
if (!target) process.exit(1)

const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const consoleMsgs = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push('exception: ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text))
  } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    consoleMsgs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`)
  }
}
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'))
}

try {
  await send('Runtime.enable')
  await send('Page.enable')
  // Give React a moment on slow machines.
  for (let i = 0; i < 20 && !(await js("!!document.querySelector('.start .logo')")); i++) await sleep(500)

  check('document title', (await js('document.title')) === 'Fritterzing')
  check('start screen rendered', (await js("document.querySelector('.start .logo')?.alt ?? ''")) === 'Fritterzing Parts Editor')
  const bridge = JSON.parse(await js('JSON.stringify({ e: !!window.fritterzing?.isElectron, n: Object.keys(window.fritterzing ?? {}).length })'))
  check('electron bridge present', bridge.e && bridge.n >= 10, `${bridge.n} functions`)
  const version = await js('window.fritterzing.appVersion()')
  check('app version reported', typeof version === 'string' && version.length > 0, version)
  await shot('01-start')

  if (existsSync(sample)) {
    const dialog = await js(`(async () => {
      const f = await window.fritterzing.readFile(${JSON.stringify(sample)});
      const file = new File([f.bytes], f.name);
      const dt = new DataTransfer(); dt.items.add(file);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      for (let i = 0; i < 40 && !document.querySelector('.modal header'); i++) await new Promise(r => setTimeout(r, 250));
      return document.querySelector('.modal header')?.textContent ?? '';
    })()`)
    check('sample imported (summary dialog)', dialog.startsWith('Imported'), dialog)
    await shot('02-import-dialog')
    const state = JSON.parse(
      await js(`(async () => {
        document.querySelector('.modal footer button.primary')?.click();
        await new Promise(r => setTimeout(r, 400));
        [...document.querySelectorAll('.zoom-ctl button')].find(b => b.textContent.trim() === 'Fit')?.click();
        await new Promise(r => setTimeout(r, 800));
        return JSON.stringify({
          markers: document.querySelectorAll('g.marker').length,
          listed: document.querySelectorAll('.conn-list .item').length,
          status: document.querySelector('.validation span:last-child')?.textContent ?? ''
        });
      })()`)
    )
    check('connectors placed on canvas', state.markers > 0 && state.markers === state.listed, `${state.markers} markers, ${state.listed} listed`)
    check('part validates', state.status === 'Ready to export', state.status)
    await shot('03-imported-canvas')
  } else {
    console.log(`skip sample import (not found: ${sample})`)
  }

  const auto = JSON.parse(
    await js(`(async () => {
      const prev = await window.fritterzing.autosaveRead();
      await window.fritterzing.autosaveWrite(new Uint8Array([7, 8, 9]));
      const back = await window.fritterzing.autosaveRead();
      if (prev) await window.fritterzing.autosaveWrite(prev.bytes); else await window.fritterzing.autosaveWrite(new Uint8Array());
      return JSON.stringify({ bytes: back ? Array.from(back.bytes) : null });
    })()`)
  )
  check('autosave round trip', JSON.stringify(auto.bytes) === '[7,8,9]')

  await sleep(500)
  check('no console errors or warnings', consoleMsgs.length === 0, consoleMsgs.join(' | ').slice(0, 300))
} catch (e) {
  check('script completed', false, e.message)
} finally {
  // The app quits before answering Browser.close, so do not wait on its reply.
  await Promise.race([send('Browser.close'), sleep(1500)])
  ws.close()
  await sleep(1000)
  try {
    process.kill(child.pid)
  } catch {
    /* already gone */
  }
}

console.log(failures.length ? `\n${failures.length} check(s) failed. Screenshots in ${outDir}` : `\nAll checks passed. Screenshots in ${outDir}`)
process.exit(failures.length ? 1 : 0)
