import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import Database from 'better-sqlite3'
import { initDb } from '../db/migrate.js'
import {
  hashPairToken,
  createPairToken,
  getPairToken,
  markPairTokenUsed,
  cleanupStalePairTokens,
} from '../services/qr.js'

function freshDb() {
  const db = new Database(':memory:')
  initDb(db)
  return db
}

describe('pair token hashing', () => {
  it('hashPairToken is SHA-256 hex (64 chars) and deterministic', () => {
    const h1 = hashPairToken('abc')
    const h2 = hashPairToken('abc')
    assert.equal(h1, h2)
    assert.match(h1, /^[0-9a-f]{64}$/)
    assert.notEqual(h1, 'abc')
  })

  it('different tokens produce different hashes', () => {
    assert.notEqual(hashPairToken('abc'), hashPairToken('abd'))
  })
})

describe('pair token storage', () => {
  let db
  beforeEach(() => {
    db = freshDb()
  })

  it('createPairToken stores the HASH, not the raw token', () => {
    const raw = 'raw-secret-token'
    createPairToken(db, raw)
    const row = db.prepare('SELECT token FROM pair_tokens').get()
    assert.equal(row.token, hashPairToken(raw))
    assert.notEqual(row.token, raw)
  })

  it('getPairToken finds a row via the raw token (hash lookup)', () => {
    const raw = 'find-me'
    createPairToken(db, raw)
    const record = getPairToken(db, raw)
    assert.ok(record)
    assert.equal(record.used, 0)
  })

  it('unknown token returns undefined', () => {
    createPairToken(db, 'known')
    assert.equal(getPairToken(db, 'unknown'), undefined)
  })
})

describe('pair token lifecycle (expiry/reuse)', () => {
  let db
  beforeEach(() => {
    db = freshDb()
  })

  it('markPairTokenUsed flips used=1 and records the device', () => {
    const raw = 'use-once'
    createPairToken(db, raw)
    markPairTokenUsed(db, raw, 'device-1')
    const record = getPairToken(db, raw)
    assert.equal(record.used, 1)
    assert.equal(record.device_id, 'device-1')
  })

  it('reused token is rejected (record.used truthy)', () => {
    const raw = 'reuse'
    createPairToken(db, raw)
    markPairTokenUsed(db, raw, 'device-1')
    const record = getPairToken(db, raw)
    // Route layer rejects when record.used is set.
    assert.ok(record.used)
  })

  it('cleanupStalePairTokens removes used + older-than-5min rows', () => {
    const fresh = 'fresh-token'
    const stale = 'stale-token'
    createPairToken(db, fresh)
    createPairToken(db, stale)
    markPairTokenUsed(db, fresh, 'device-1')
    // Backdate the stale token beyond the 5-minute window.
    db.prepare(
      "UPDATE pair_tokens SET created_at = datetime('now', '-10 minutes') WHERE token = ?"
    ).run(hashPairToken(stale))

    cleanupStalePairTokens(db)

    const remaining = db.prepare('SELECT token FROM pair_tokens').all()
    // Both the used fresh token and the expired stale token are gone.
    assert.equal(remaining.length, 0)
  })

  it('cleanup keeps an unused, unexpired token', () => {
    const raw = 'keep-me'
    createPairToken(db, raw)
    cleanupStalePairTokens(db)
    assert.ok(getPairToken(db, raw))
  })
})

describe('legacy plaintext token backfill', () => {
  it('initDb hashes pre-existing plaintext pair tokens', () => {
    const db = new Database(':memory:')
    // Create schema without running the backfill first: build a v1-style
    // pair_tokens row manually, then re-run initDb to trigger hashing.
    db.exec(`
      CREATE TABLE pair_tokens (
        token TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used INTEGER NOT NULL DEFAULT 0,
        device_id TEXT
      );
      CREATE TABLE devices (
        deviceId TEXT PRIMARY KEY,
        deviceName TEXT NOT NULL,
        registeredAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastSeenAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastPairedToken TEXT
      );
    `)
    const plaintext = 'legacy-uuid-token'
    db.prepare('INSERT INTO pair_tokens (token) VALUES (?)').run(plaintext)
    db.prepare(
      'INSERT INTO devices (deviceId, deviceName, lastPairedToken) VALUES (?, ?, ?)'
    ).run('device-legacy', 'Legacy', plaintext)

    initDb(db)

    const row = db.prepare('SELECT token FROM pair_tokens').get()
    assert.equal(row.token, hashPairToken(plaintext))
    const device = db.prepare('SELECT lastPairedToken FROM devices').get()
    assert.equal(device.lastPairedToken, hashPairToken(plaintext))
  })
})
