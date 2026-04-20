import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SPRITES_DIR = resolve(__dirname, 'public/sprites')

// Dev-only endpoint: POST /__save-sprite/:id with PNG body writes to
// public/sprites/{id}.png so downloaded sprites can be committed to the repo.
function saveSpritePlugin(): Plugin {
  return {
    name: 'save-sprite',
    configureServer(server) {
      server.middlewares.use('/__sprite-exists/', (req, res) => {
        const match = req.url?.match(/^\/(\d+)$/)
        if (!match) {
          res.statusCode = 400
          res.end()
          return
        }
        const id = Number(match[1])
        const exists = existsSync(resolve(SPRITES_DIR, `${id}.png`))
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ exists }))
      })
      server.middlewares.use('/__save-sprite/', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const match = req.url?.match(/^\/(\d+)$/)
        if (!match) {
          res.statusCode = 400
          res.end('bad id')
          return
        }
        const id = Number(match[1])
        const outPath = resolve(SPRITES_DIR, `${id}.png`)
        if (existsSync(outPath)) {
          res.statusCode = 200
          res.end('exists')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            if (!existsSync(SPRITES_DIR)) mkdirSync(SPRITES_DIR, { recursive: true })
            writeFileSync(outPath, Buffer.concat(chunks))
            res.statusCode = 200
            res.end('saved')
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })
        req.on('error', () => {
          res.statusCode = 500
          res.end()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveSpritePlugin()],
  server: {
    port: parseInt(process.env.PORT || '5174', 10),
    strictPort: true,
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
