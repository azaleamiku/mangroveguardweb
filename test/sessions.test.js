import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { freshDb, createApp, request, makeTempDir } from './helpers.js'

function seedDevice(db, deviceId, name = 'Tablet') {
  const now = new Date().toISOString()
  db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, name, now, now)
}

function seedSession(db, sessionId, deviceId, startedAt, endedAt = null) {
  db.prepare('INSERT OR IGNORE INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run(sessionId, deviceId, startedAt, endedAt)
}

describe('POST /api/sessions', () => {
  let db
  let app
  beforeEach(async () => {
    db = freshDb()
    app = createApp(db, await makeTempDir())
  })

  it('creates a new session and returns 200', async () => {
    seedDevice(db, 'device-1')
    const res = await request(app, 'POST', '/api/sessions', { sessionId: 'session-1', deviceId: 'device-1' })
    assert.equal(res.status, 200)
    assert.equal(res.body.sessionId, 'session-1')
    assert.equal(res.body.deviceId, 'device-1')
    assert.ok(res.body.startedAt)
    assert.equal(res.body.endedAt, null)

    const row = db.prepare('SELECT sessionId, deviceId, endedAt FROM sessions WHERE sessionId = ?').get('session-1')
    assert.equal(row.sessionId, 'session-1')
    assert.equal(row.deviceId, 'device-1')
    assert.equal(row.endedAt, null)
  })

  it('returns 200 for an existing session without duplicating it', async () => {
    seedDevice(db, 'device-1')
    seedSession(db, 'session-1', 'device-1', '2026-01-01T00:00:00.000Z')
    const res = await request(app, 'POST', '/api/sessions', { sessionId: 'session-1', deviceId: 'device-1' })
    assert.equal(res.status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 1)
  })

  it('accepts snake_case aliases', async () => {
    seedDevice(db, 'device-2')
    const res = await request(app, 'POST', '/api/sessions', { session_id: 'session-2', device_id: 'device-2' })
    assert.equal(res.status, 200)
    assert.equal(res.body.sessionId, 'session-2')
    assert.equal(res.body.deviceId, 'device-2')
  })

  it('rejects a session bound to an unregistered device with 500', async () => {
    const res = await request(app, 'POST', '/api/sessions', { sessionId: 'session-1', deviceId: 'ghost-device' })
    assert.equal(res.status, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
  })

  it('rejects a missing sessionId with 400', async () => {
    const res = await request(app, 'POST', '/api/sessions', { deviceId: 'device-1' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects a missing deviceId with 400', async () => {
    const res = await request(app, 'POST', '/api/sessions', { sessionId: 'session-1' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an oversized sessionId with 400', async () => {
    const res = await request(app, 'POST', '/api/sessions', { sessionId: 's'.repeat(129), deviceId: 'device-1' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects a non-string deviceId with 400', async () => {
    const res = await request(app, 'POST', '/api/sessions', { sessionId: 'session-1', deviceId: 7 })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})

describe('GET /api/sessions', () => {
  let db
  let app
  beforeEach(async () => {
    db = freshDb()
    app = createApp(db, await makeTempDir())
  })

  it('lists sessions ordered by startedAt descending', async () => {
    seedDevice(db, 'device-1')
    seedDevice(db, 'device-2')
    seedSession(db, 'session-a', 'device-1', '2026-01-01T00:00:00.000Z')
    seedSession(db, 'session-b', 'device-2', '2026-02-01T00:00:00.000Z')
    const res = await request(app, 'GET', '/api/sessions')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.map((s) => s.sessionId), ['session-b', 'session-a'])
  })

  it('emits only the contracted session fields', async () => {
    seedDevice(db, 'device-1')
    seedSession(db, 'session-a', 'device-1', '2026-01-01T00:00:00.000Z')
    const res = await request(app, 'GET', '/api/sessions')
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['deviceId', 'endedAt', 'sessionId', 'startedAt'])
  })
})

describe('POST /api/sessions/:sessionId/end', () => {
  let db
  let app
  beforeEach(async () => {
    db = freshDb()
    app = createApp(db, await makeTempDir())
  })

  it('sets endedAt on an open session and returns 200', async () => {
    seedDevice(db, 'device-1')
    seedSession(db, 'session-1', 'device-1', '2026-01-01T00:00:00.000Z')
    const res = await request(app, 'POST', '/api/sessions/session-1/end')
    assert.equal(res.status, 200)
    assert.equal(res.body.sessionId, 'session-1')
    assert.ok(res.body.endedAt)

    const row = db.prepare('SELECT endedAt FROM sessions WHERE sessionId = ?').get('session-1')
    assert.ok(row.endedAt)
  })

  it('returns 404 for an unknown session', async () => {
    const res = await request(app, 'POST', '/api/sessions/does-not-exist/end')
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
  })

  it('returns 404 when the session is already ended', async () => {
    seedDevice(db, 'device-1')
    seedSession(db, 'session-1', 'device-1', '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z')
    const res = await request(app, 'POST', '/api/sessions/session-1/end')
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
    const row = db.prepare('SELECT endedAt FROM sessions WHERE sessionId = ?').get('session-1')
    assert.equal(row.endedAt, '2026-01-01T01:00:00.000Z')
  })

  it('rejects an oversized sessionId param with 400', async () => {
    const res = await request(app, 'POST', `/api/sessions/${'s'.repeat(129)}/end`)
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})
