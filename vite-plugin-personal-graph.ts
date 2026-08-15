import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const GRAPH_PATH = path.resolve('src/data/personal-graph.json')

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Dev-only API: GET/POST src/data/personal-graph.json */
export function personalGraphApi(): Plugin {
  return {
    name: 'personal-graph-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/personal-graph')) return next()

        res.setHeader('Content-Type', 'application/json')

        try {
          if (req.method === 'GET') {
            const raw = fs.readFileSync(GRAPH_PATH, 'utf8')
            res.statusCode = 200
            res.end(raw)
            return
          }

          if (req.method === 'POST') {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            if (
              !parsed ||
              !Array.isArray(parsed.positions) ||
              !Array.isArray(parsed.transitions)
            ) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid game graph payload' }))
              return
            }
            fs.writeFileSync(GRAPH_PATH, `${JSON.stringify(parsed, null, 2)}\n`)
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true, path: 'src/data/personal-graph.json' }))
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
        } catch (err) {
          res.statusCode = 500
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Save failed',
            }),
          )
        }
      })
    },
  }
}
