import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import http from 'node:http'
import Database from 'better-sqlite3'
import express from 'express'
import { initDb } from '../db/migrate.js'
import { registerPairRoutes } from '../routes/pair.js'
import { registerDeviceRoutes } from '../routes/devices.js'

/**
 * Build a real Express app wired to the pair + device routes backed by an
 * in-memory SQLite DB. Mirrors how server.js mounts the route modules.
 */
function createApp(db) {
  const app = express()
  app.use(express.json())
  registerPairRoutes(app, db, '/tmp/mangrove-qr-test')
  registerDeviceRoutes(app, db)
  return app
}

function freshDb() {
  const db = new Database(':memory:')
  initDb(db)
  return db
}

/** Drive the Express app with a JSON request and resolve with the parsed body. */
function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const { port } = server.address()
      const data = body == null ? null : JSON.stringify(body)
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data, 'utf8') } : {}),
          },
        },
        (res) => {
          let raw = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            raw += chunk
          })
          res.on('end', () => {
            server.close()
            let parsed = raw
            try {
              parsed = raw ? JSON.parse(raw) : raw
            } catch (_) {}
            resolve({ status: res.statusCode, body: parsed })
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

describe('POST /api/pair/unpair', () => {
  let db
  beforeEach(() => {
    db = freshDb()
  })

  it('clears lastPairedToken and marks the device unpaired', async () => {
    const app = createApp(db)

    // Pair a device the way /api/pair/confirm does.
    const now = new Date().toISOString()
    db.prepare(
      'INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt, lastPairedToken) VALUES (?, ?, ?, ?, ?)'
    ).run('device-1', 'Field Tablet', now, now, 'pair-token-hash')

    const res = await request(app, 'POST', '/api/pair/unpair', { deviceId: 'device-1' })

    assert.equal(res.status, 200)
    assert.equal(res.body.deviceId, 'device-1')
    assert.ok(res.body.unpairedAt)

    const device = db
      .prepare('SELECT lastPairedToken, lastSeenAt FROM devices WHERE deviceId = ?')
      .get('device-1')
    assert.equal(device.lastPairedToken, null)

    // GET /api/devices must now report isPaired = 0.
    const list = await request(app, 'GET', '/api/devices')
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].isPaired, 0)
  })

  it('accepts snake_case deviceId alias', async () => {
    const app = createApp(db)
    const now = new Date().toISOString()
    db.prepare(
      'INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt, lastPairedToken) VALUES (?, ?, ?, ?, ?)'
    ).run('device-2', 'Drone', now, now, 'pair-token-hash')

    const res = await request(app, 'POST', '/api/pair/unpair', { device_id: 'device-2' })
    assert.equal(res.status, 200)
    assert.equal(res.body.deviceId, 'device-2')
  })

  it('rejects a missing/blank deviceId with 400', async () => {
    const app = createApp(db)

    const missing = await request(app, 'POST', '/api/pair/unpair', {})
    assert.equal(missing.status, 400)
    assert.equal(missing.body.code, 'VALIDATION_ERROR')

    const blank = await request(app, 'POST', '/api/pair/unpair', { deviceId: '   ' })
    assert.equal(blank.status, 400)
    assert.equal(blank.body.code, 'VALIDATION_ERROR')
  })

  it('is idempotent: unpairing an already-unpaired device succeeds', async () => {
    const app = createApp(db)
    const now = new Date().toISOString()
    db.prepare(
      'INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)'
    ).run('device-3', 'Tablet', now, now)

    const first = await request(app, 'POST', '/api/pair/unpair', { deviceId: 'device-3' })
    assert.equal(first.status, 200)

    const second = await request(app, 'POST', '/api/pair/unpair', { deviceId: 'device-3' })
    assert.equal(second.status, 200)
  })
})