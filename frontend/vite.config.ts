import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The pipeline writes its snapshot to ../data/snapshot. Serve it at /data in dev
// and copy it into the build, so a static deploy carries real data with no backend.
const SNAPSHOT = resolve(__dirname, '../data/snapshot')

function snapshot(): Plugin {
  let outDir = resolve(__dirname, 'dist')
  return {
    name: 'finn-snapshot',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const f = join(SNAPSHOT, decodeURIComponent((req.url ?? '').split('?')[0]))
        if (!f.startsWith(SNAPSHOT) || !existsSync(f) || !statSync(f).isFile()) return next()
        res.setHeader('content-type', 'application/json')
        createReadStream(f).pipe(res)
      })
    },
    closeBundle() {
      if (existsSync(SNAPSHOT)) cpSync(SNAPSHOT, join(outDir, 'data'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), snapshot()],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
