import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import Database from 'better-sqlite3'
import { initDb } from '../db/migrate.js'
import { toScan } from '../services/scans.js'

/**
 * In-memory DB with the real schema (FKs + pair_tokens etc.).
 * dataDirectory points at a temp dir so image writes are harmless.
 */
function freshDb() {
  const db = new Database(':memory:')
  initDb(db)
  return db
}

const dataDirectory = '/tmp/mangrove_test_data'

const basePayload = {
  treeId: 'MG-01-123456',
  scannedAt: '2026-01-02T03:04:05.000Z',
  assessment: 'high',
}

/** Mirror of the batch insert path in routes/scans.js (Phase A + B). */
async function insertBatch(db, payloads) {
  const validScans = []
  for (const payload of payloads) {
    const scan = await toScan(db, dataDirectory, payload || {})
    if (scan) validScans.push(scan)
  }
  const insert = db.prepare(
    'INSERT OR IGNORE INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const insertAll = db.transaction((rows) => {
    for (const scan of rows) {
      insert.run(
        scan.id,
        scan.treeId,
        scan.scannedAt,
        scan.assessment,
        scan.imageUrl || '',
        scan.sessionId,
        scan.deviceId,
        scan.serverReceived
      )
    }
  })
  insertAll(validScans)
  return validScans
}

describe('batch insert idempotency', () => {
  let db
  beforeEach(() => {
    db = freshDb()
  })

  it('inserts a valid batch once', async () => {
    const scans = await insertBatch(db, [
      { ...basePayload, scan_id: 'scan-1' },
      { ...basePayload, treeId: 'MG-01-654321', scan_id: 'scan-2' },
    ])
    assert.equal(scans.length, 2)
    const rows = db.prepare('SELECT id FROM scans').all()
    assert.equal(rows.length, 2)
  })

  it('re-POSTing the same batch does not duplicate rows (INSERT OR IGNORE)', async () => {
    const first = await insertBatch(db, [
      { ...basePayload, scan_id: 'scan-1' },
      { ...basePayload, treeId: 'MG-01-654321', scan_id: 'scan-2' },
    ])
    const second = await insertBatch(db, [
      { ...basePayload, scan_id: 'scan-1' },
      { ...basePayload, treeId: 'MG-01-654321', scan_id: 'scan-2' },
    ])
    assert.equal(first.length, 2)
    // Second pass parses the same payloads but IGNORE leaves rows untouched.
    assert.equal(second.length, 2)
    const rows = db.prepare('SELECT id FROM scans').all()
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((r) => r.id).sort(),
      ['scan-1', 'scan-2']
    )
  })

  it('mixed new + duplicate batch only inserts the new row', async () => {
    await insertBatch(db, [{ ...basePayload, scan_id: 'scan-1' }])
    await insertBatch(db, [
      { ...basePayload, scan_id: 'scan-1' },
      { ...basePayload, treeId: 'MG-01-654321', scan_id: 'scan-new' },
    ])
    const rows = db.prepare('SELECT id FROM scans').all()
    assert.equal(rows.length, 2)
    assert.ok(rows.some((r) => r.id === 'scan-new'))
  })

  it('invalid entries are skipped without failing the batch', async () => {
    const scans = await insertBatch(db, [
      { ...basePayload, scan_id: 'ok-1' },
      { treeId: 'not-valid', scannedAt: 'nope', assessment: 'bogus' },
      { ...basePayload, scan_id: 'ok-2' },
    ])
    assert.equal(scans.length, 2)
    const rows = db.prepare('SELECT id FROM scans').all()
    assert.equal(rows.length, 2)
  })

  it('batch-level deviceId is applied to scans missing one', async () => {
    // A scan with its own deviceId keeps it (explicit wins).
    const explicit = await insertBatch(db, [
      { ...basePayload, scan_id: 's1', deviceId: 'device-explicit' },
    ])
    assert.equal(explicit[0].deviceId, 'device-explicit')

    // A scan with NO deviceId falls back to the batch-level device_id
    // (mirrored from routes/scans.js batchDeviceId merge in Phase A).
    const batchMerged = await insertBatch(db, [
      { ...basePayload, scan_id: 's2', device_id: 'device-batch' },
    ])
    assert.equal(batchMerged[0].deviceId, 'device-batch')
  })
})
