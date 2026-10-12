import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { freshDb, createApp, request, makeTempDir } from './helpers.js'
import { hashPairToken } from '../services/qr.js'

describe('GET /api/pair/qr', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })
  afterEach(() => { delete process.env.PUBLIC_BASE_URL })

  it('returns a fresh token, pairing URL and QR data URL', async () => {
    const res = await request(app, 'GET', '/api/pair/qr')
    assert.equal(res.status, 200)
    assert.match(res.body.token, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.equal(res.body.url, `${res.body.url.split('?')[0]}?token=${res.body.token}`)
    assert.ok(res.body.url.includes('/pair?token='))
    assert.match(res.body.qrDataUrl, /^data:image\/svg\+xml;base64,/)
  })

  it('stores only the SHA-256 hash of the token', async () => {
    const res = await request(app, 'GET', '/api/pair/qr')
    const row = db.prepare('SELECT token, used FROM pair_tokens WHERE token = ?').get(hashPairToken(res.body.token))
    assert.ok(row)
    assert.equal(row.used, 0)
    const plaintext = db.prepare('SELECT COUNT(*) AS total FROM pair_tokens WHERE token = ?').get(res.body.token)
    assert.equal(plaintext.total, 0)
  })

  it('honors PUBLIC_BASE_URL over the request host', async () => {
    process.env.PUBLIC_BASE_URL = 'https://field.example.test'
    const res = await request(app, 'GET', '/api/pair/qr')
    assert.ok(res.body.url.startsWith('https://field.example.test/pair?token='))
  })

  it('purges unused tokens older than 5 minutes on each issuance', async () => {
    const staleToken = 'stale-token-value'
    createPairTokenDirect(db, staleToken)
    db.prepare("UPDATE pair_tokens SET created_at = datetime('now', '-10 minutes') WHERE token = ?").run(hashPairToken(staleToken))

    const res = await request(app, 'GET', '/api/pair/qr')
    assert.equal(res.status, 200)

    const remaining = db.prepare('SELECT token FROM pair_tokens').all().map((row) => row.token)
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0], hashPairToken(res.body.token))
  })
})

function createPairTokenDirect(db, token) {
  db.prepare("INSERT OR REPLACE INTO pair_tokens (token, created_at, used, device_id) VALUES (?, datetime('now'), 0, NULL)").run(hashPairToken(token))
}

describe('GET /pair', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('serves the pairing form for a fresh token', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const res = await request(app, 'GET', `/pair?token=${qr.body.token}`)
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('text/html'))
    assert.ok(res.raw.includes('action="/api/pair/confirm"'))
    assert.ok(res.raw.includes(`value="${qr.body.token}"`))
  })

  it('rejects a missing token with 400', async () => {
    const res = await request(app, 'GET', '/pair')
    assert.equal(res.status, 400)
    assert.equal(res.raw, 'Missing token')
  })

  it('rejects an unknown token with 400', async () => {
    const res = await request(app, 'GET', '/pair?token=not-a-real-token')
    assert.equal(res.status, 400)
    assert.equal(res.raw, 'Invalid or expired token')
  })

  it('rejects an already used token with 400', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token, deviceId: 'device-1' })
    const res = await request(app, 'GET', `/pair?token=${qr.body.token}`)
    assert.equal(res.status, 400)
    assert.equal(res.raw, 'Invalid or expired token')
  })
})

describe('POST /api/pair/confirm', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('pairs a device, marks the token used and returns 201', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const res = await request(app, 'POST', '/api/pair/confirm', {
      token: qr.body.token,
      deviceId: 'device-1',
      deviceName: 'Field Tablet',
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.deviceId, 'device-1')
    assert.ok(res.body.pairedAt)

    const device = db.prepare('SELECT deviceName, lastPairedToken FROM devices WHERE deviceId = ?').get('device-1')
    assert.equal(device.deviceName, 'Field Tablet')
    assert.equal(device.lastPairedToken, hashPairToken(qr.body.token))

    const token = db.prepare('SELECT used, device_id FROM pair_tokens WHERE token = ?').get(hashPairToken(qr.body.token))
    assert.equal(token.used, 1)
    assert.equal(token.device_id, 'device-1')
  })

  it('defaults the device name to the deviceId', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const res = await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token, deviceId: 'device-2' })
    assert.equal(res.status, 201)
    const device = db.prepare('SELECT deviceName FROM devices WHERE deviceId = ?').get('device-2')
    assert.equal(device.deviceName, 'device-2')
  })

  it('rejects an unknown token with 400 INVALID_TOKEN', async () => {
    const res = await request(app, 'POST', '/api/pair/confirm', { token: 'unknown-token', deviceId: 'device-1' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'INVALID_TOKEN')
  })

  it('rejects a reused token with 400 INVALID_TOKEN', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token, deviceId: 'device-1' })
    const second = await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token, deviceId: 'device-1' })
    assert.equal(second.status, 400)
    assert.equal(second.body.code, 'INVALID_TOKEN')
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM devices WHERE deviceId = ?').get('device-1').total, 1)
  })

  it('rejects a missing deviceId with 400 VALIDATION_ERROR', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const res = await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
    const token = db.prepare('SELECT used FROM pair_tokens WHERE token = ?').get(hashPairToken(qr.body.token))
    assert.equal(token.used, 0)
  })

  it('accepts snake_case aliases', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const res = await request(app, 'POST', '/api/pair/confirm', {
      token: qr.body.token,
      device_id: 'device-3',
      device_name: 'Drone',
    })
    assert.equal(res.status, 201)
    const device = db.prepare('SELECT deviceName FROM devices WHERE deviceId = ?').get('device-3')
    assert.equal(device.deviceName, 'Drone')
  })

  it('rejects an oversized token with 400', async () => {
    const res = await request(app, 'POST', '/api/pair/confirm', { token: 't'.repeat(257), deviceId: 'device-1' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})

describe('GET /api/pair/status', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('reports paired=true with the device after a successful pairing', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token, deviceId: 'device-1', deviceName: 'Field Tablet' })

    const res = await request(app, 'GET', `/api/pair/status?token=${qr.body.token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.paired, true)
    assert.equal(res.body.device.deviceId, 'device-1')
    assert.equal(res.body.device.deviceName, 'Field Tablet')
    assert.equal('lastPairedToken' in res.body.device, false)
  })

  it('reports paired=false for an unknown token', async () => {
    const res = await request(app, 'GET', '/api/pair/status?token=never-issued')
    assert.equal(res.status, 200)
    assert.equal(res.body.paired, false)
    assert.equal(res.body.device, null)
  })

  it('reports paired=false after the device is unpaired', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    await request(app, 'POST', '/api/pair/confirm', { token: qr.body.token, deviceId: 'device-1' })
    await request(app, 'POST', '/api/pair/unpair', { deviceId: 'device-1' })

    const res = await request(app, 'GET', `/api/pair/status?token=${qr.body.token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.paired, false)
  })

  it('rejects a missing token with 400', async () => {
    const res = await request(app, 'GET', '/api/pair/status')
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})

describe('pairing round trip (QR to scan link)', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('supports the full pairing lifecycle end to end', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const form = await request(app, 'GET', `/pair?token=${qr.body.token}`)
    assert.equal(form.status, 200)

    const confirmed = await request(app, 'POST', '/api/pair/confirm', {
      token: qr.body.token,
      deviceId: 'device-field-1',
      deviceName: 'Field Tablet 1',
    })
    assert.equal(confirmed.status, 201)

    const session = await request(app, 'POST', '/api/sessions', {
      sessionId: 'session-field-1',
      deviceId: 'device-field-1',
    })
    assert.equal(session.status, 200)

    const scan = await request(app, 'POST', '/api/scans', {
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'high',
      sessionId: 'session-field-1',
    })
    assert.equal(scan.status, 201)
    assert.equal(scan.body.deviceId, 'device-field-1')
    assert.equal(scan.body.deviceName, 'Field Tablet 1')

    const devices = await request(app, 'GET', '/api/devices')
    assert.equal(devices.body[0].deviceId, 'device-field-1')
    assert.equal(devices.body[0].isPaired, 1)

    const status = await request(app, 'GET', `/api/pair/status?token=${qr.body.token}`)
    assert.equal(status.body.paired, true)
  })
})
