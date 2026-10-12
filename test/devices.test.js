import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { freshDb, createApp, request, makeTempDir } from './helpers.js'

describe('GET /api/devices', () => {
  let db
  let app
  beforeEach(async () => {
    db = freshDb()
    app = createApp(db, await makeTempDir())
  })

  it('returns an empty array initially', async () => {
    const res = await request(app, 'GET', '/api/devices')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, [])
  })

  it('never exposes the lastPairedToken secret', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt, lastPairedToken) VALUES (?, ?, ?, ?, ?)')
      .run('device-secret', 'Tablet', now, now, 'a-secret-hash')
    const res = await request(app, 'GET', '/api/devices')
    assert.equal(res.status, 200)
    assert.equal('lastPairedToken' in res.body[0], false)
    assert.equal(res.body[0].isPaired, 1)
  })

  it('reports isPaired as 0 when no token is set', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)')
      .run('device-paired-no', 'Drone', now, now)
    const res = await request(app, 'GET', '/api/devices')
    assert.equal(res.body[0].isPaired, 0)
  })

  it('excludes the unknown sentinel row', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)')
      .run('unknown', 'Unknown Device', now, now)
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)')
      .run('device-real', 'Real', now, now)
    const res = await request(app, 'GET', '/api/devices')
    assert.equal(res.body.length, 1)
    assert.equal(res.body[0].deviceId, 'device-real')
  })

  it('orders devices by lastSeenAt descending', async () => {
    const old = '2020-01-01T00:00:00.000Z'
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-old', 'Old', old, old)
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-new', 'New', now, now)
    const res = await request(app, 'GET', '/api/devices')
    assert.deepEqual(res.body.map((d) => d.deviceId), ['device-new', 'device-old'])
  })
})

describe('POST /api/devices', () => {
  let db
  let app
  beforeEach(async () => {
    db = freshDb()
    app = createApp(db, await makeTempDir())
  })

  it('registers a new device and returns 200', async () => {
    const res = await request(app, 'POST', '/api/devices', { deviceId: 'device-1', deviceName: 'Field Tablet' })
    assert.equal(res.status, 200)
    assert.equal(res.body.deviceId, 'device-1')
    assert.equal(res.body.deviceName, 'Field Tablet')
    assert.ok(res.body.registeredAt)
    assert.ok(res.body.lastSeenAt)

    const row = db.prepare('SELECT deviceId, deviceName FROM devices WHERE deviceId = ?').get('device-1')
    assert.deepEqual(row, { deviceId: 'device-1', deviceName: 'Field Tablet' })
  })

  it('defaults the device name to the deviceId', async () => {
    const res = await request(app, 'POST', '/api/devices', { deviceId: 'device-2' })
    assert.equal(res.status, 200)
    assert.equal(res.body.deviceName, 'device-2')
  })

  it('updates the name and lastSeenAt of an existing device and returns 200', async () => {
    await request(app, 'POST', '/api/devices', { deviceId: 'device-3', deviceName: 'Old Name' })
    const res = await request(app, 'POST', '/api/devices', { deviceId: 'device-3', deviceName: 'New Name' })
    assert.equal(res.status, 200)
    assert.equal(res.body.deviceName, 'New Name')
    const count = db.prepare('SELECT COUNT(*) AS total FROM devices WHERE deviceId = ?').get('device-3')
    assert.equal(count.total, 1)
  })

  it('accepts snake_case aliases', async () => {
    const res = await request(app, 'POST', '/api/devices', { device_id: 'device-4', device_name: 'Kiosk' })
    assert.equal(res.status, 200)
    assert.equal(res.body.deviceId, 'device-4')
    assert.equal(res.body.deviceName, 'Kiosk')
  })

  it('rejects a missing deviceId with 400', async () => {
    const res = await request(app, 'POST', '/api/devices', {})
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects a blank deviceId with 400', async () => {
    const res = await request(app, 'POST', '/api/devices', { deviceId: '   ' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects a non-string deviceId with 400', async () => {
    const res = await request(app, 'POST', '/api/devices', { deviceId: 42 })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an oversized deviceId with 400', async () => {
    const res = await request(app, 'POST', '/api/devices', { deviceId: 'd'.repeat(129) })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an oversized deviceName with 400', async () => {
    const res = await request(app, 'POST', '/api/devices', { deviceId: 'device-5', deviceName: 'n'.repeat(257) })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})
