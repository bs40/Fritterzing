// Browser-only dev/build of the renderer (no Electron). Uses the browser
// platform shim for file access. Handy for quick UI testing.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  server: { port: 5174, strictPort: true, fs: { allow: [resolve('.')] } },
  build: { outDir: resolve('dist/web'), emptyOutDir: true }
})
