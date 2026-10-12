import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { freshDb, createApp, request, makeTempDir, validScanPayload } from './helpers.js'

describe('GET /api/scans', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('returns an empty array initially', async () => {
    const res = await request(app, 'GET', '/api/scans')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, [])
  })

  it('joins the device name and orders by scannedAt descending', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-1', 'Tablet A', now, now)
    db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('scan-old', 'MG-01-111111', '2026-01-01T00:00:00.000Z', 'low', null, null, 'device-1', now)
    db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('scan-new', 'MG-01-222222', '2026-02-01T00:00:00.000Z', 'high', null, null, 'device-1', now)

    const res = await request(app, 'GET', '/api/scans')
    assert.equal(res.status, 200)
    assert.equal(res.body.length, 2)
    assert.equal(res.body[0].id, 'scan-new')
    assert.equal(res.body[0].deviceName, 'Tablet A')
    assert.equal(res.body[0].imageUrl, null)
    assert.equal(res.body[1].id, 'scan-old')
  })

  it('emits the contracted scan fields', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('scan-1', 'MG-01-123456', '2026-01-01T00:00:00.000Z', 'low', null, null, null, now)
    const res = await request(app, 'GET', '/api/scans')
    assert.deepEqual(Object.keys(res.body[0]).sort(), [
      'assessment', 'deviceId', 'deviceName', 'id', 'imageUrl', 'scannedAt', 'serverReceived', 'sessionId', 'treeId',
    ])
  })
})

describe('POST /api/scans', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('stores a valid scan and returns 201 with the emitted shape', async () => {
    const res = await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-1' })
    assert.equal(res.status, 201)
    assert.equal(res.body.id, 'scan-1')
    assert.equal(res.body.treeId, 'MG-01-123456')
    assert.equal(res.body.scannedAt, '2026-01-02T03:04:05.000Z')
    assert.equal(res.body.assessment, 'high')
    assert.equal(res.body.sessionId, null)
    assert.equal(res.body.deviceId, null)
    assert.ok(res.body.serverReceived)

    const row = db.prepare('SELECT id, treeId, assessment FROM scans WHERE id = ?').get('scan-1')
    assert.deepEqual(row, { id: 'scan-1', treeId: 'MG-01-123456', assessment: 'high' })
  })

  it('accepts snake_case wire format and case-insensitive assessment', async () => {
    const res = await request(app, 'POST', '/api/scans', {
      scan_id: 'scan-2',
      tree_id: 'MG-01-654321',
      scanned_at: '2026-01-03T03:04:05.000Z',
      predicted_assessment: 'MODERATE',
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.assessment, 'moderate')
  })

  it('is idempotent: re-POSTing the same scan_id keeps a single row', async () => {
    await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-dup' })
    const second = await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-dup', assessment: 'low' })
    assert.equal(second.status, 201)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans WHERE id = ?').get('scan-dup').total, 1)
    const assessment = db.prepare('SELECT assessment FROM scans WHERE id = ?').get('scan-dup').assessment
    assert.equal(assessment, 'high')
  })

  it('rejects a payload missing required fields with 400', async () => {
    const res = await request(app, 'POST', '/api/scans', { treeId: 'MG-01-123456' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an invalid assessment with 400', async () => {
    const res = await request(app, 'POST', '/api/scans', { ...validScanPayload, assessment: 'extreme' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an unparseable scannedAt with 400', async () => {
    const res = await request(app, 'POST', '/api/scans', { ...validScanPayload, scannedAt: 'nope' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an empty body with 400', async () => {
    const res = await request(app, 'POST', '/api/scans', {})
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects a scan payload above the byte limit with 413', async () => {
    const res = await request(app, 'POST', '/api/scans', {
      ...validScanPayload,
      imageBase64: 'x'.repeat(5 * 1024 * 1024 + 1),
    })
    assert.equal(res.status, 413)
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE')
  })

  it('stores an uploaded image and serves it under /scan-images', async () => {
    const imageBase64 = Buffer.from('jpeg-data', 'utf8').toString('base64')
    const res = await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-img', imageBase64 })
    assert.equal(res.status, 201)
    assert.equal(res.body.imageUrl, '/scan-images/scan-img.jpg')

    const image = await request(app, 'GET', '/scan-images/scan-img.jpg')
    assert.equal(image.status, 200)
    assert.equal(image.raw, 'jpeg-data')
  })

  it('links a scan to a session and inherits its device', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-9', 'Tablet 9', now, now)
    db.prepare('INSERT INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run('session-9', 'device-9', now, null)

    const res = await request(app, 'POST', '/api/scans', {
      ...validScanPayload,
      scan_id: 'scan-session',
      sessionId: 'session-9',
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.sessionId, 'session-9')
    assert.equal(res.body.deviceId, 'device-9')
    assert.equal(res.body.deviceName, 'Tablet 9')
  })

  it('notifies SSE subscribers after a successful insert', async () => {
    const { logSubscribers } = await import('../services/subscribers.js')
    logSubscribers.clear()
    let chunks = []
    const streamPromise = import('./helpers.js').then(({ openEventStream }) =>
      openEventStream(app, '/api/scans/events', {
        waitMs: 400,
        onOpen: async () => {
          await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-sse' })
        },
      })
    )
    const stream = await streamPromise
    chunks = stream.text
    assert.ok(chunks.includes('event: scans-updated'))
    logSubscribers.clear()
  })
})

describe('POST /api/scans/batch', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('inserts a valid batch and returns 201 with the inserted count', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', {
      scans: [
        { ...validScanPayload, scan_id: 'batch-1' },
        { ...validScanPayload, treeId: 'MG-01-654321', scan_id: 'batch-2', assessment: 'low' },
      ],
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.inserted, 2)
    assert.equal(res.body.scans.length, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 2)
  })

  it('applies the batch-level device_id to scans without one', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', {
      device_id: 'device-batch',
      scans: [{ ...validScanPayload, scan_id: 'batch-3' }],
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.scans[0].deviceId, 'device-batch')
  })

  it('keeps a per-scan deviceId when both are present', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', {
      device_id: 'device-batch',
      scans: [{ ...validScanPayload, scan_id: 'batch-4', deviceId: 'device-explicit' }],
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.scans[0].deviceId, 'device-explicit')
  })

  it('is idempotent across repeated submissions', async () => {
    const payload = { scans: [{ ...validScanPayload, scan_id: 'batch-5' }] }
    await request(app, 'POST', '/api/scans/batch', payload)
    const second = await request(app, 'POST', '/api/scans/batch', payload)
    assert.equal(second.status, 201)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 1)
  })

  it('rejects an empty scans array with 400', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', { scans: [] })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('rejects a batch with an invalid entry with 400', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', {
      scans: [{ ...validScanPayload }, { ...validScanPayload, assessment: 'bogus' }],
    })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
    assert.ok(res.body.error.includes('scans[1]'))
  })

  it('rejects a batch above the 50-scan cap with 400', async () => {
    const scans = Array.from({ length: 51 }, () => ({ ...validScanPayload }))
    const res = await request(app, 'POST', '/api/scans/batch', { scans })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
    assert.ok(res.body.error.includes('50'))
  })

  it('rejects a non-object body with 400', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', { scans: 'nope' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})
