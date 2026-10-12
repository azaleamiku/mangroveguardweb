import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import Database from 'better-sqlite3'
import { initDb, seedDatabase } from '../db/migrate.js'

describe('initDb schema', () => {
  let db
  beforeEach(() => { db = new Database(':memory:'); initDb(db) })

  it('creates the core tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    assert.ok(tables.includes('scans'))
    assert.ok(tables.includes('devices'))
    assert.ok(tables.includes('sessions'))
    assert.ok(tables.includes('deletion_history'))
    assert.ok(tables.includes('pair_tokens'))
  })

  it('creates the expected indexes', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => row.name)
    assert.ok(indexes.includes('idx_scannedAt'))
    assert.ok(indexes.includes('idx_sessionId'))
    assert.ok(indexes.includes('idx_deviceId'))
    assert.ok(indexes.includes('idx_devices_lastSeenAt'))
    assert.ok(indexes.includes('idx_sessions_startedAt'))
    assert.ok(indexes.includes('idx_pair_tokens_created'))
  })

  it('enables foreign keys and bumps the schema version to 2', () => {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
    assert.equal(db.pragma('user_version', { simple: true }), 2)
  })

  it('adds lastPairedToken to devices', () => {
    const columns = db.pragma('table_info(devices)').map((column) => column.name)
    assert.ok(columns.includes('lastPairedToken'))
  })

  it('does not seed the unknown sentinel on an empty database', () => {
    const count = db.prepare("SELECT COUNT(*) AS total FROM devices WHERE deviceId = 'unknown'").get()
    assert.equal(count.total, 0)
  })

  it('enforces the assessment check constraint', () => {
    assert.throws(() => {
      db.prepare("INSERT INTO scans (id, treeId, scannedAt, assessment) VALUES ('s', 'MG-01-123456', '2026-01-01T00:00:00.000Z', 'bogus')").run()
    })
  })
})

describe('initDb v1 to v2 foreign key migration', () => {
  function legacyDb() {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE devices (
        deviceId TEXT PRIMARY KEY,
        deviceName TEXT NOT NULL,
        registeredAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastSeenAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE sessions (
        sessionId TEXT PRIMARY KEY,
        deviceId TEXT NOT NULL,
        startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        endedAt TEXT
      );
      CREATE TABLE scans (
        id TEXT PRIMARY KEY,
        treeId TEXT NOT NULL,
        scannedAt TEXT NOT NULL,
        assessment TEXT NOT NULL,
        imagePath TEXT,
        sessionId TEXT,
        deviceId TEXT,
        serverReceived TEXT DEFAULT CURRENT_TIMESTAMP,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE pair_tokens (
        token TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used INTEGER NOT NULL DEFAULT 0,
        device_id TEXT
      );
    `)
    return db
  }

  it('migrates existing tables and enforces foreign keys', () => {
    const db = legacyDb()
    db.prepare("INSERT INTO devices (deviceId, deviceName) VALUES ('device-1', 'Tablet')").run()
    db.prepare("INSERT INTO sessions (sessionId, deviceId) VALUES ('session-1', 'device-1')").run()
    db.prepare("INSERT INTO scans (id, treeId, scannedAt, assessment, sessionId, deviceId) VALUES ('scan-1', 'MG-01-123456', '2026-01-01T00:00:00.000Z', 'low', 'session-1', 'device-1')").run()

    initDb(db)

    assert.equal(db.pragma('user_version', { simple: true }), 2)
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
    const violations = db.prepare('PRAGMA foreign_key_check').all()
    assert.deepEqual(violations, [])
    const scan = db.prepare('SELECT sessionId, deviceId FROM scans WHERE id = ?').get('scan-1')
    assert.equal(scan.sessionId, 'session-1')
    assert.equal(scan.deviceId, 'device-1')
    const migratedIndexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => row.name)
    assert.ok(migratedIndexes.includes('idx_sessions_startedAt'))
    assert.ok(migratedIndexes.includes('idx_scannedAt'))
  })

  it('seeds the unknown sentinel and rewrites orphan rows', () => {
    const db = legacyDb()
    db.prepare("INSERT INTO sessions (sessionId, deviceId) VALUES ('session-ghost', 'ghost-device')").run()
    db.prepare("INSERT INTO scans (id, treeId, scannedAt, assessment, sessionId, deviceId) VALUES ('scan-ghost', 'MG-01-123456', '2026-01-01T00:00:00.000Z', 'low', 'session-ghost', 'ghost-device')").run()

    initDb(db)

    const sentinel = db.prepare("SELECT deviceId FROM devices WHERE deviceId = 'unknown'").get()
    assert.ok(sentinel)
    const session = db.prepare('SELECT deviceId FROM sessions WHERE sessionId = ?').get('session-ghost')
    assert.equal(session.deviceId, 'unknown')
    const scan = db.prepare('SELECT sessionId, deviceId FROM scans WHERE id = ?').get('scan-ghost')
    assert.equal(scan.deviceId, null)
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  })
})

describe('seedDatabase', () => {
  let db
  beforeEach(() => {
    db = new Database(':memory:')
    initDb(db)
  })

  it('seeds devices, sessions, pair tokens and 12 months of scans', () => {
    seedDatabase(db)

    const devices = db.prepare('SELECT deviceId, deviceName, lastPairedToken FROM devices ORDER BY deviceId').all()
    assert.equal(devices.length, 3)
    assert.deepEqual(devices.map((d) => d.deviceId), ['device-001', 'device-002', 'device-003'])
    assert.equal(devices[0].lastPairedToken, 'token-device-001')
    assert.equal(devices[1].lastPairedToken, 'token-device-002')
    assert.equal(devices[2].lastPairedToken, null)

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM pair_tokens').get().total, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 84 * 12)
  })

  it('seeds only valid assessments and well-formed tree ids', () => {
    seedDatabase(db)
    const rows = db.prepare('SELECT treeId, assessment FROM scans').all()
    for (const row of rows) {
      assert.ok(['high', 'moderate', 'low'].includes(row.assessment))
      assert.match(row.treeId, /^MG-[a-z0-9]{4}-\d{6}$/)
    }
  })

  it('is a no-op when scans already exist', () => {
    seedDatabase(db)
    seedDatabase(db)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM scans').get().total, 84 * 12)
  })

  it('links scans to seeded sessions and devices', () => {
    seedDatabase(db)
    const orphaned = db.prepare(
      `SELECT COUNT(*) AS total FROM scans
       WHERE sessionId IS NOT NULL AND sessionId NOT IN (SELECT sessionId FROM sessions)`
    ).get().total
    assert.equal(orphaned, 0)
  })
})
