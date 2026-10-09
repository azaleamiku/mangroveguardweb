import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { initDb, seedDatabase } from './db/migrate.js'
import { generateStyledQrDataUrl } from './services/qr.js'
import { createRateLimiter } from './services/rate-limit.js'
import { registerScanRoutes } from './routes/scans.js'
import { registerDeviceRoutes } from './routes/devices.js'
import { registerSessionRoutes } from './routes/sessions.js'
import { registerPairRoutes } from './routes/pair.js'
import { createLogger } from './services/logger.js'
import { logSubscribers, deviceSubscribers, sessionSubscribers } from './services/subscribers.js'

const logger = createLogger('server')
const app = express()
const port = Number(process.env.PORT || 8080)
const root = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.DATA_DIRECTORY || path.join(root, 'data')

app.use(express.json({ limit: '10mb' }))

app.use((req, res, next) => {
  req.setTimeout(30000)
  next()
})

const dbPath = path.join(dataDirectory, 'mangrove.db')
await mkdir(dataDirectory, { recursive: true })
const db = new Database(dbPath)

initDb(db)
//seedDatabase(db)

// Abuse-sensitive endpoints: QR issuance, pairing, and batch ingest.
const pairLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })
const batchLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })
app.use('/api/pair', pairLimiter)
app.use('/api/scans/batch', batchLimiter)

registerScanRoutes(app, db, dataDirectory)
registerDeviceRoutes(app, db)
registerSessionRoutes(app, db)
registerPairRoutes(app, db, root, generateStyledQrDataUrl)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', db: true }))

app.use('/scan-images', express.static(path.join(dataDirectory, 'scan-images')))
app.use(express.static(path.join(root, 'dist')))
app.get('*splat', (_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')))

app.use((error, _request, response, _next) => {
  logger.error('Unhandled error', { error: error.message })
  response.status(500).json({ error: 'Unable to process observation logs.', code: 'INTERNAL_ERROR' })
})

const server = app.listen(port, '0.0.0.0', () => logger.info('Listening', { port }))
server.timeout = 30000

function closeSseConnections() {
  logger.info('Closing SSE connections')
  for (const response of logSubscribers) {
    try { response.end() } catch (_) {}
  }
  for (const response of deviceSubscribers) {
    try { response.end() } catch (_) {}
  }
  for (const response of sessionSubscribers) {
    try { response.end() } catch (_) {}
  }
  logSubscribers.clear()
  deviceSubscribers.clear()
  sessionSubscribers.clear()
}

function shutdown(signal) {
  logger.info('Received signal, starting graceful shutdown', { signal })
  server.close(() => {
    logger.info('HTTP server closed')
    closeSseConnections()
    try { db.close() } catch (_) {}
    logger.info('Database closed')
    process.exit(0)
  })
  setTimeout(() => {
    logger.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
