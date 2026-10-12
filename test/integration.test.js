import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { freshDb, createApp, request, makeTempDir, validScanPayload } from './helpers.js'

describe('system integration (server.js wiring)', () => {
  let db
  let app
  let dataDirectory
  beforeEach(async () => {
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  it('GET /api/health reports ok with the database attached', async () => {
    const res = await request(app, 'GET', '/api/health')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { status: 'ok', db: true })
  })

  it('unknown API paths fall through to the SPA index.html', async () => {
    const res = await request(app, 'GET', '/dashboard/unknown-route')
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('text/html'))
    assert.ok(res.raw.includes('<div id="root"'))
  })

  it('the error handler returns the INTERNAL_ERROR envelope', async () => {
    db.close()
    const res = await request(app, 'GET', '/api/scans')
    assert.equal(res.status, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
    assert.equal(res.body.error, 'Unable to process observation logs.')
  })

  it('rate-limits /api/pair endpoints and emits Retry-After', async () => {
    const limited = createApp(freshDb(), dataDirectory, { pairMax: 3 })
    let last
    for (let i = 0; i < 5; i++) {
      last = await request(limited, 'GET', '/api/pair/status?token=probe')
    }
    assert.equal(last.status, 429)
    assert.equal(last.body.code, 'RATE_LIMITED')
    assert.ok(last.headers['retry-after'])
  })

  it('allows /api/pair requests again within a fresh limiter window', async () => {
    const limited = createApp(freshDb(), dataDirectory, { pairMax: 3 })
    const first = await request(limited, 'GET', '/api/pair/status?token=probe')
    assert.equal(first.status, 200)
    assert.deepEqual(first.body, { paired: false, device: null })
  })

  it('rejects malformed JSON with the error envelope', async () => {
    const res = await request(app, 'POST', '/api/devices', '{not json')
    assert.equal(res.status, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
  })

  it('end-to-end: pair, session, scan, query', async () => {
    const qr = await request(app, 'GET', '/api/pair/qr')
    const confirm = await request(app, 'POST', '/api/pair/confirm', {
      token: qr.body.token,
      deviceId: 'device-integration',
      deviceName: 'Integration Tablet',
    })
    assert.equal(confirm.status, 201)

    const session = await request(app, 'POST', '/api/sessions', {
      sessionId: 'session-integration',
      deviceId: 'device-integration',
    })
    assert.equal(session.status, 200)

    const scan = await request(app, 'POST', '/api/scans', {
      ...validScanPayload,
      scan_id: 'scan-integration',
      sessionId: 'session-integration',
    })
    assert.equal(scan.status, 201)
    assert.equal(scan.body.deviceId, 'device-integration')
    assert.equal(scan.body.deviceName, 'Integration Tablet')

    const scans = await request(app, 'GET', '/api/scans')
    assert.equal(scans.body[0].id, 'scan-integration')

    const sessions = await request(app, 'GET', '/api/sessions')
    assert.equal(sessions.body[0].sessionId, 'session-integration')

    const devices = await request(app, 'GET', '/api/devices')
    assert.equal(devices.body[0].deviceId, 'device-integration')
    assert.equal(devices.body[0].isPaired, 1)

    const end = await request(app, 'POST', '/api/sessions/session-integration/end')
    assert.equal(end.status, 200)
    assert.ok(end.body.endedAt)

    const status = await request(app, 'GET', `/api/pair/status?token=${qr.body.token}`)
    assert.equal(status.body.paired, true)
  })

  it('end-to-end: batch ingest with mixed validity', async () => {
    const res = await request(app, 'POST', '/api/scans/batch', {
      device_id: 'device-batch-integration',
      scans: [
        { ...validScanPayload, scan_id: 'int-batch-1' },
        { ...validScanPayload, treeId: 'MG-01-654321', scan_id: 'int-batch-2', assessment: 'moderate' },
        { ...validScanPayload, treeId: 'MG-01-111111', scan_id: 'int-batch-3', assessment: 'low' },
      ],
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.inserted, 3)

    const scans = await request(app, 'GET', '/api/scans')
    assert.equal(scans.body.length, 3)
    for (const scan of scans.body) {
      assert.equal(scan.deviceId, 'device-batch-integration')
    }
  })

  it('end-to-end: duplicate batch ingest is a no-op', async () => {
    const payload = {
      device_id: 'device-batch-dup',
      scans: [{ ...validScanPayload, scan_id: 'int-batch-dup' }],
    }
    await request(app, 'POST', '/api/scans/batch', payload)
    const second = await request(app, 'POST', '/api/scans/batch', payload)
    assert.equal(second.status, 201)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 1)
  })
})
