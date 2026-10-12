import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import Database from 'better-sqlite3'
import { initDb, seedDatabase } from '../db/migrate.js'
import { toScan } from '../services/scans.js'

describe('toScan normalization', () => {
  let db
  let dataDirectory
  beforeEach(async () => {
    db = new Database(':memory:')
    initDb(db)
    const { makeTempDir } = await import('./helpers.js')
    dataDirectory = await makeTempDir()
  })

  it('normalizes a minimal valid payload', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'high',
    })
    assert.ok(scan.id)
    assert.equal(scan.treeId, 'MG-01-123456')
    assert.equal(scan.scannedAt, '2026-01-02T03:04:05.000Z')
    assert.equal(scan.assessment, 'high')
    assert.equal(scan.sessionId, null)
    assert.equal(scan.deviceId, null)
    assert.equal(scan.deviceName, null)
    assert.ok(scan.serverReceived)
    assert.equal(scan.imageUrl, undefined)
  })

  it('accepts snake_case wire fields', async () => {
    const scan = await toScan(db, dataDirectory, {
      tree_id: 'MG-01-123456',
      scanned_at: '2026-01-02T03:04:05.000Z',
      predicted_assessment: 'moderate',
    })
    assert.equal(scan.treeId, 'MG-01-123456')
    assert.equal(scan.assessment, 'moderate')
  })

  it('lowercases the assessment', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'HIGH',
    })
    assert.equal(scan.assessment, 'high')
  })

  it('trims treeId and slices it to 100 characters', async () => {
    const longId = '  ' + 'MG-01-' + 'a'.repeat(150)
    const scan = await toScan(db, dataDirectory, {
      treeId: longId,
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'low',
    })
    assert.equal(scan.treeId, ('MG-01-' + 'a'.repeat(150)).slice(0, 100))
  })

  it('returns null for a missing treeId', async () => {
    const scan = await toScan(db, dataDirectory, {
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'low',
    })
    assert.equal(scan, null)
  })

  it('returns null for an unparseable scannedAt', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456',
      scannedAt: 'not-a-date',
      assessment: 'low',
    })
    assert.equal(scan, null)
  })

  it('returns null for an assessment outside the allowed set', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'critical',
    })
    assert.equal(scan, null)
  })

  it('prefers scan_id, then id, then a generated uuid', async () => {
    const byScanId = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      scan_id: 'client-scan-1', id: 'client-id-1',
    })
    assert.equal(byScanId.id, 'client-scan-1')
    const byId = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      id: 'client-id-2',
    })
    assert.equal(byId.id, 'client-id-2')
    const generated = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
    })
    assert.match(generated.id, /^[0-9a-f-]{36}$/)
  })

  it('normalizes empty-string deviceId and sessionId to null', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      deviceId: '   ', sessionId: '',
    })
    assert.equal(scan.deviceId, null)
    assert.equal(scan.sessionId, null)
  })

  it('resolves deviceId from the session when absent', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-s', 'Field Tablet', now, now)
    db.prepare('INSERT INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run('session-s', 'device-s', now, null)

    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      sessionId: 'session-s',
    })
    assert.equal(scan.deviceId, 'device-s')
    assert.equal(scan.deviceName, 'Field Tablet')
  })

  it('ignores sessions bound to the unknown sentinel', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('unknown', 'Unknown Device', now, now)
    db.prepare('INSERT INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run('session-u', 'unknown', now, null)

    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      sessionId: 'session-u',
    })
    assert.equal(scan.deviceId, null)
  })

  it('looks up deviceName for a known device', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-k', 'Kiosk', now, now)

    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      deviceId: 'device-k',
    })
    assert.equal(scan.deviceName, 'Kiosk')
  })

  it('upserts a new device row with the deviceId as its name', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      deviceId: 'device-new',
    })
    assert.equal(scan.deviceName, null)
    const device = db.prepare('SELECT deviceId, deviceName FROM devices WHERE deviceId = ?').get('device-new')
    assert.deepEqual(device, { deviceId: 'device-new', deviceName: 'device-new' })
  })

  it('refreshes lastSeenAt for a known device', async () => {
    const then = '2020-01-01T00:00:00.000Z'
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-seen', 'Old', then, then)

    await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      deviceId: 'device-seen',
    })

    const device = db.prepare('SELECT lastSeenAt FROM devices WHERE deviceId = ?').get('device-seen')
    assert.notEqual(device.lastSeenAt, then)
  })

  it('creates a session row when a sessionId is supplied', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      sessionId: 'session-new', deviceId: 'device-s2',
    })
    const session = db.prepare('SELECT sessionId, deviceId, endedAt FROM sessions WHERE sessionId = ?').get('session-new')
    assert.equal(session.sessionId, 'session-new')
    assert.equal(session.deviceId, 'device-s2')
    assert.equal(session.endedAt, null)
    assert.equal(scan.sessionId, 'session-new')
  })

  it('binds a device-less session to the unknown sentinel', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      sessionId: 'session-sentinel',
    })
    assert.equal(scan.deviceId, null)
    assert.equal(scan.sessionId, 'session-sentinel')

    const session = db.prepare('SELECT deviceId FROM sessions WHERE sessionId = ?').get('session-sentinel')
    assert.equal(session.deviceId, 'unknown')
    const sentinel = db.prepare("SELECT deviceId, deviceName FROM devices WHERE deviceId = 'unknown'").get()
    assert.deepEqual(sentinel, { deviceId: 'unknown', deviceName: 'Unknown Device' })
  })

  it('saves a provided image and emits imageUrl', async () => {
    const imageBase64 = Buffer.from('fake-jpeg-data', 'utf8').toString('base64')
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      scan_id: 'scan-img', imageBase64,
    })
    assert.equal(scan.imageUrl, '/scan-images/scan-img.jpg')
  })

  it('omits imageUrl when no image is supplied', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low',
      scan_id: 'scan-noimg',
    })
    assert.equal('imageUrl' in scan, false)
  })

  it('logs but accepts non-standard treeId formats', async () => {
    const scan = await toScan(db, dataDirectory, {
      treeId: 'ARBITRARY-TREE-42',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'low',
    })
    assert.equal(scan.treeId, 'ARBITRARY-TREE-42')
  })

  it('works against the seeded production schema', async () => {
    seedDatabase(db)
    const scan = await toScan(db, dataDirectory, {
      treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'high',
      deviceId: 'device-001', sessionId: 'session-1',
    })
    assert.equal(scan.deviceName, 'Field Tablet 1')
    assert.equal(scan.deviceId, 'device-001')
  })
})
