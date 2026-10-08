import { deviceSubscribers, notifyDeviceSubscribers } from '../services/subscribers.js'
import { createLogger } from '../services/logger.js'

const logger = createLogger('devices')

export function registerDeviceRoutes(app, db) {
  app.get('/api/devices', (_request, response, next) => {
    try {
      const devices = db.prepare('SELECT deviceId, deviceName, registeredAt, lastSeenAt, lastPairedToken FROM devices ORDER BY lastSeenAt DESC').all()
      response.json(devices)
    } catch (error) { next(error) }
  })

  app.get('/api/devices/events', (request, response) => {
    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    })
    response.write('retry: 3000\n\n')
    deviceSubscribers.add(response)
    const heartbeatInterval = setInterval(() => {
      try {
        response.write(': heartbeat\n\n')
      } catch (_) {
        clearInterval(heartbeatInterval)
      }
    }, parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS, 10) || 15000)
    request.on('close', () => {
      clearInterval(heartbeatInterval)
      deviceSubscribers.delete(response)
    })
  })

  app.post('/api/devices', (request, response, next) => {
    try {
      const body = request.body || {}
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
      const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : typeof body.device_name === 'string' ? body.device_name.trim() : deviceId
      if (!deviceId) return response.status(400).json({ error: 'deviceId is required.', code: 'VALIDATION_ERROR' })

      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, deviceName || deviceId, now, now)
      db.prepare('UPDATE devices SET deviceName = COALESCE(?, deviceName), lastSeenAt = ? WHERE deviceId = ?').run(deviceName || null, now, deviceId)

      notifyDeviceSubscribers()

      const device = db.prepare('SELECT deviceId, deviceName, registeredAt, lastSeenAt FROM devices WHERE deviceId = ?').get(deviceId)
      response.status(device ? 200 : 201).json(device || { deviceId, deviceName: deviceName || deviceId, registeredAt: now, lastSeenAt: now })
    } catch (error) { next(error) }
  })
}
