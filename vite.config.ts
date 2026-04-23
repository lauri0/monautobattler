import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SPRITES_DIR = resolve(__dirname, 'public/sprites')
const DATA_DIR = resolve(__dirname, 'public/data')
const MOD_DIR = resolve(__dirname, 'mod/data')
const DATA_KINDS = { pokemon: 'pokemon', move: 'moves', ability: 'abilities' } as const
type DataKind = keyof typeof DATA_KINDS
const NAME_RE = /^[a-z0-9-]+$/
const KIND_DIR_RE = /^(pokemon|moves|abilities)$/

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
        const match = req.url?.match(/^\/(\d+)$/)
        if (!match) {
          res.statusCode = 400
          res.end('bad id')
          return
        }
        const id = Number(match[1])
        const outPath = resolve(SPRITES_DIR, `${id}.png`)
        if (req.method === 'DELETE') {
          try {
            if (existsSync(outPath)) unlinkSync(outPath)
            res.statusCode = 200
            res.end('deleted')
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
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

// Dev-only endpoints for a JSON-backed data layer. The PokeAPI importer POSTs
// pokemon/move JSON here; the game reads files back via static `public/data/*`
// on startup. The user edits files directly between reloads.
function saveDataPlugin(): Plugin {
  return {
    name: 'save-data',
    configureServer(server) {
      server.middlewares.use('/__save-data/', (req, res) => {
        const match = req.url?.match(/^\/(pokemon|move|ability)\/([a-z0-9-]+)$/)
        if (!match) {
          res.statusCode = 400
          res.end('bad path')
          return
        }
        const kind = match[1] as DataKind
        const name = match[2]
        if (!NAME_RE.test(name)) {
          res.statusCode = 400
          res.end('bad name')
          return
        }
        const subdir = resolve(DATA_DIR, DATA_KINDS[kind])
        const outPath = resolve(subdir, `${name}.json`)
        if (req.method === 'DELETE') {
          try {
            if (existsSync(outPath)) unlinkSync(outPath)
            res.statusCode = 200
            res.end('deleted')
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            if (!existsSync(subdir)) mkdirSync(subdir, { recursive: true })
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

      server.middlewares.use('/__list-data/', (req, res) => {
        const match = req.url?.match(/^\/(pokemon|move|ability)$/)
        if (!match) {
          res.statusCode = 400
          res.end()
          return
        }
        const kind = match[1] as DataKind
        const sub = DATA_KINDS[kind]
        const publicSub = resolve(DATA_DIR, sub)
        const modSub = resolve(MOD_DIR, sub)
        const names = new Set<string>()
        if (existsSync(publicSub)) {
          for (const f of readdirSync(publicSub)) if (f.endsWith('.json')) names.add(f)
        }
        if (existsSync(modSub)) {
          for (const f of readdirSync(modSub)) if (f.endsWith('.json')) names.add(f)
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ files: Array.from(names) }))
      })

      // Serve mod overrides for /data/{kind}/{name}.json when present. Falls
      // through to Vite static serving from public/ otherwise.
      server.middlewares.use('/data/', (req, res, next) => {
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
          next()
          return
        }
        const url = (req.url ?? '').split('?')[0]
        const match = url.match(/^\/([a-z]+)\/([a-z0-9-]+)\.json$/)
        if (!match) { next(); return }
        const kindDir = match[1]
        const name = match[2]
        if (!KIND_DIR_RE.test(kindDir) || !NAME_RE.test(name)) { next(); return }
        const modPath = resolve(MOD_DIR, kindDir, `${name}.json`)
        if (!existsSync(modPath)) { next(); return }
        try {
          const body = readFileSync(modPath)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        } catch {
          next()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveSpritePlugin(), saveDataPlugin()],
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
