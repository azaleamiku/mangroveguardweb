import path from 'node:path'
import http from 'node:http'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { mkdtemp } from 'node:fs/promises'
import express from 'express'
import Database from 'better-sqlite3'
import { initDb } from '../db/migrate.js'
import { registerScanRoutes } from '../routes/scans.js'
import { registerDeviceRoutes } from '../routes/devices.js'
import { registerSessionRoutes } from '../routes/sessions.js'
import { registerPairRoutes } from '../routes/pair.js'
import { generateStyledQrDataUrl } from '../services/qr.js'
import { createRateLimiter } from '../services/rate-limit.js'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'mangrove-test-'))
}

export function freshDb() {
  const db = new Database(':memory:')
  initDb(db)
  return db
}

export function createApp(db, dataDirectory, options = {}) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  const pairLimiter = createRateLimiter({ windowMs: 60_000, max: options.pairMax ?? 30 })
  const batchLimiter = createRateLimiter({ windowMs: 60_000, max: options.batchMax ?? 60 })
  app.use('/api/pair', pairLimiter)
  app.use('/api/scans/batch', batchLimiter)

  registerScanRoutes(app, db, dataDirectory)
  registerDeviceRoutes(app, db)
  registerSessionRoutes(app, db)
  registerPairRoutes(app, db, projectRoot, generateStyledQrDataUrl)

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', db: true }))

  app.use('/scan-images', express.static(path.join(dataDirectory, 'scan-images')))
  app.use(express.static(path.join(projectRoot, 'dist')))
  app.get('*splat', (_request, response) =>
    response.sendFile(path.join(projectRoot, 'dist', 'index.html'))
  )

  app.use((error, _request, response, _next) => {
    response.status(500).json({ error: 'Unable to process observation logs.', code: 'INTERNAL_ERROR' })
  })

  return app
}

export function request(app, method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const { port } = server.address()
      const data = body == null ? null : typeof body === 'string' ? body : JSON.stringify(body)
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: requestPath,
          method,
          headers: {
            'Content-Type': 'application/json',
            Connection: 'close',
            ...(data ? { 'Content-Length': Buffer.byteLength(data, 'utf8') } : {}),
            ...headers,
          },
        },
        (res) => {
          let raw = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => { raw += chunk })
          res.on('end', () => {
            server.close()
            let parsed = raw
            try { parsed = raw ? JSON.parse(raw) : raw } catch (_) {}
            resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw })
          })
        }
      )
      req.on('error', (err) => {
        server.close()
        reject(err)
      })
      if (data) req.write(data)
      req.end()
    })
  })
}

export function openEventStream(app, streamPath, { waitMs = 300, onOpen } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const { port } = server.address()
      const req = http.request(
        { hostname: '127.0.0.1', port, path: streamPath, method: 'GET', headers: { Connection: 'close' } },
        (res) => {
          let text = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => { text += chunk })
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            req.destroy()
            server.close()
            resolve({ status: res.statusCode, headers: res.headers, text })
          }
          const timer = setTimeout(finish, waitMs)
          res.on('end', finish)
          if (onOpen) Promise.resolve(onOpen()).catch(() => {})
        }
      )
      req.on('error', () => {})
      req.end()
    })
  })
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const validScanPayload = {
  treeId: 'MG-01-123456',
  scannedAt: '2026-01-02T03:04:05.000Z',
  assessment: 'high',
}
