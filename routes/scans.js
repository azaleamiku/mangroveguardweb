import { toScan } from '../services/scans.js'
import { logSubscribers, notifyLogSubscribers } from '../services/subscribers.js'
import { createLogger } from '../services/logger.js'
import { validateScanRequest, validateBatchRequest } from '../services/validation.js'

const logger = createLogger('scans')

export function registerScanRoutes(app, db, dataDirectory) {
  app.get('/api/scans', (_request, response, next) => {
    try {
      const scans = db.prepare('SELECT id, treeId, scannedAt, assessment, imagePath as imageUrl, sessionId, scans.deviceId, serverReceived, devices.deviceName FROM scans LEFT JOIN devices ON scans.deviceId = devices.deviceId ORDER BY scannedAt DESC').all()
      response.json(scans)
    } catch (error) { next(error) }
  })

  app.get('/api/scans/events', (request, response) => {
    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    })
    response.write('retry: 3000\n\n')
    logSubscribers.add(response)
    const heartbeatInterval = setInterval(() => {
      try {
        response.write(': heartbeat\n\n')
      } catch (_) {
        clearInterval(heartbeatInterval)
      }
    }, parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS, 10) || 15000)
    request.on('close', () => {
      clearInterval(heartbeatInterval)
      logSubscribers.delete(response)
    })
  })

  app.post('/api/scans/batch', validateBatchRequest, async (request, response, next) => {
    request.setTimeout(60000)
    try {
      const body = request.body || {}
      const scans = Array.isArray(body.scans) ? body.scans : []
      const batchDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : null
      // Phase A: async normalization + image I/O (cannot run inside better-sqlite3 txn).
      const validScans = []
      for (const payload of scans) {
        const merged = batchDeviceId && !payload.deviceId && !payload.device_id ? { ...payload, deviceId: batchDeviceId } : payload
        const scan = await toScan(db, dataDirectory, merged || {})
        if (scan) validScans.push(scan)
      }
      // Phase B: single synchronous transaction for all scan rows.
      const insert = db.prepare('INSERT OR IGNORE INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      const insertAll = db.transaction((rows) => {
        for (const scan of rows) {
          insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imageUrl || '', scan.sessionId, scan.deviceId, scan.serverReceived)
        }
      })
      insertAll(validScans)
      notifyLogSubscribers()
      response.status(201).json({ inserted: validScans.length, scans: validScans })
    } catch (error) { next(error) }
  })

  app.post('/api/scans', validateScanRequest, async (request, response, next) => {
    try {
      const scan = await toScan(db, dataDirectory, request.body || {})
      if (!scan) return response.status(400).json({ error: 'treeId, scannedAt, and a valid assessment are required.', code: 'VALIDATION_ERROR' })

      const insert = db.prepare('INSERT OR IGNORE INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imageUrl || '', scan.sessionId, scan.deviceId, scan.serverReceived)

      notifyLogSubscribers()
      response.status(201).json(scan)
    } catch (error) { next(error) }
  })
}