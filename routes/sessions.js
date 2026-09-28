import { sessionSubscribers, notifySessionSubscribers } from '../services/subscribers.js'
import { createLogger } from '../services/logger.js'

const logger = createLogger('sessions')

export function registerSessionRoutes(app, db) {
  app.get('/api/sessions', (_request, response, next) => {
    try {
      const sessions = db.prepare('SELECT sessionId, deviceId, startedAt, endedAt FROM sessions ORDER BY startedAt DESC').all()
      response.json(sessions)
    } catch (error) { next(error) }
  })

  app.get('/api/sessions/events', (request, response) => {
    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    })
    response.write('retry: 3000\n\n')
    sessionSubscribers.add(response)
    request.on('close', () => sessionSubscribers.delete(response))
  })

  app.post('/api/sessions', (request, response, next) => {
    try {
      const body = request.body || {}
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : typeof body.session_id === 'string' ? body.session_id.trim() : ''
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
      if (!sessionId || !deviceId) return response.status(400).json({ error: 'sessionId and deviceId are required.', code: 'VALIDATION_ERROR' })

      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run(sessionId, deviceId, now, null)
      db.prepare('UPDATE sessions SET deviceId = ?, startedAt = COALESCE(startedAt, ?) WHERE sessionId = ?').run(deviceId, now, sessionId)

      notifySessionSubscribers()

      const session = db.prepare('SELECT sessionId, deviceId, startedAt, endedAt FROM sessions WHERE sessionId = ?').get(sessionId)
      response.status(session ? 200 : 201).json(session || { sessionId, deviceId, startedAt: now, endedAt: null })
    } catch (error) { next(error) }
  })

  app.post('/api/sessions/:sessionId/end', (request, response, next) => {
    try {
      const { sessionId } = request.params
      if (!sessionId) return response.status(400).json({ error: 'sessionId is required.', code: 'VALIDATION_ERROR' })

      const now = new Date().toISOString()
      const result = db.prepare('UPDATE sessions SET endedAt = ? WHERE sessionId = ? AND endedAt IS NULL').run(now, sessionId)
      if (result.changes === 0) return response.status(404).json({ error: 'Session not found or already ended.', code: 'NOT_FOUND' })

      notifySessionSubscribers()

      const session = db.prepare('SELECT sessionId, deviceId, startedAt, endedAt FROM sessions WHERE sessionId = ?').get(sessionId)
      response.json(session)
    } catch (error) { next(error) }
  })
}
