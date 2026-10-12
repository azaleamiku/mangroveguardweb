import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import path from 'node:path'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import Database from 'better-sqlite3'
import { initDb, migrateFromJson } from '../db/migrate.js'

describe('migrateFromJson', () => {
  let db
  let tempDir
  beforeEach(async () => {
    db = new Database(':memory:')
    initDb(db)
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'mangrove-json-'))
  })

  it('imports valid scans and skips invalid entries', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-1', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'high' },
      { id: 'json-2', treeId: 'MG-01-654321', scannedAt: '2026-01-03T03:04:05.000Z', assessment: 'low' },
      { id: 'json-bad', treeId: 'MG-01-654321', scannedAt: '2026-01-03T03:04:05.000Z', assessment: 'critical' },
      null,
    ]))

    await migrateFromJson(db, tempDir, scansFile)

    const rows = db.prepare('SELECT id, treeId, assessment FROM scans ORDER BY id').all()
    assert.deepEqual(rows, [
      { id: 'json-1', treeId: 'MG-01-123456', assessment: 'high' },
      { id: 'json-2', treeId: 'MG-01-654321', assessment: 'low' },
    ])
    const exists = await readFile(scansFile, 'utf8').then(() => true, () => false)
    assert.equal(exists, false)
  })

  it('keeps session and device references that resolve to existing rows', async () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run('device-1', 'Tablet', now, now)
    db.prepare('INSERT INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run('session-1', 'device-1', now, null)

    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-linked', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'high', sessionId: 'session-1', deviceId: 'device-1' },
    ]))

    await migrateFromJson(db, tempDir, scansFile)

    const row = db.prepare('SELECT sessionId, deviceId FROM scans WHERE id = ?').get('json-linked')
    assert.equal(row.sessionId, 'session-1')
    assert.equal(row.deviceId, 'device-1')
  })

  it('nulls out references to missing parent rows instead of failing', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-orphan', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'high', sessionId: 'ghost-session', deviceId: 'ghost-device' },
    ]))

    await migrateFromJson(db, tempDir, scansFile)

    const row = db.prepare('SELECT sessionId, deviceId FROM scans WHERE id = ?').get('json-orphan')
    assert.equal(row.sessionId, null)
    assert.equal(row.deviceId, null)
  })

  it('embeds an image for base64 payloads and stores the image path', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    const imageBase64 = Buffer.from('jpeg-bytes', 'utf8').toString('base64')
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-img', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'moderate', imageBase64 },
    ]))

    await migrateFromJson(db, tempDir, scansFile)

    const row = db.prepare('SELECT imagePath FROM scans WHERE id = ?').get('json-img')
    assert.equal(row.imagePath, '/scan-images/json-img.jpg')
    const saved = await readFile(path.join(tempDir, 'data', 'scan-images', 'json-img.jpg'), 'utf8')
    assert.equal(saved, 'jpeg-bytes')
  })

  it('keeps an explicit imagePath when one is supplied', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-path', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low', imagePath: '/scan-images/legacy.jpg' },
    ]))

    await migrateFromJson(db, tempDir, scansFile)

    const row = db.prepare('SELECT imagePath FROM scans WHERE id = ?').get('json-path')
    assert.equal(row.imagePath, '/scan-images/legacy.jpg')
  })

  it('generates ids for entries without one', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify([
      { treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low' },
    ]))

    await migrateFromJson(db, tempDir, scansFile)

    const row = db.prepare('SELECT id FROM scans').get()
    assert.match(row.id, /^[0-9a-f-]{36}$/)
  })

  it('ignores non-array JSON without importing anything', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify({ not: 'an array' }))

    await migrateFromJson(db, tempDir, scansFile)

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 0)
  })

  it('ignores an empty array without importing anything', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, '[]')

    await migrateFromJson(db, tempDir, scansFile)

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 0)
  })

  it('resolves without throwing when the file is missing', async () => {
    await migrateFromJson(db, tempDir, path.join(tempDir, 'missing.json'))
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 0)
  })

  it('resolves without throwing on malformed JSON', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, '{not json')

    await migrateFromJson(db, tempDir, scansFile)

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 0)
  })

  it('is idempotent: re-running the migration keeps a single copy', async () => {
    const scansFile = path.join(tempDir, 'scans.json')
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-dup', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'low' },
    ]))

    await migrateFromJson(db, tempDir, scansFile)
    await writeFile(scansFile, JSON.stringify([
      { id: 'json-dup', treeId: 'MG-01-123456', scannedAt: '2026-01-02T03:04:05.000Z', assessment: 'high' },
    ]))
    await migrateFromJson(db, tempDir, scansFile)

    const rows = db.prepare('SELECT id, assessment FROM scans').all()
    assert.deepEqual(rows, [{ id: 'json-dup', assessment: 'low' }])
  })

  it('cleans up its temporary directory', async () => {
    await rm(tempDir, { recursive: true, force: true })
  })
})
