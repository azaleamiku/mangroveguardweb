import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { saveScanImage } from '../services/scans.js'
import { createLogger } from '../services/logger.js'

const logger = createLogger('db')

// Schema version for FK migration. v1 = legacy (no FKs), v2 = FKs enforced.
const SCHEMA_VERSION = 2

function tableSql(db, table) {
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
    return row ? row.sql || '' : ''
  } catch (_) {
    return ''
  }
}

function ensureForeignKeys(db) {
  const currentVersion = db.pragma('user_version', { simple: true }) || 0
  if (currentVersion >= SCHEMA_VERSION) {
    db.pragma('foreign_keys = ON')
    return
  }

  const scansSql = tableSql(db, 'scans')
  const sessionsSql = tableSql(db, 'sessions')
  const needsMigration = currentVersion < 2
    && (scansSql && !scansSql.includes('FOREIGN KEY')
      || sessionsSql && !sessionsSql.includes('FOREIGN KEY')
      || !scansSql || !sessionsSql)

  if (!needsMigration) {
    db.pragma('user_version = ' + SCHEMA_VERSION)
    db.pragma('foreign_keys = ON')
    return
  }

  logger.info('Migrating database to schema v2 (foreign keys)')
  db.pragma('foreign_keys = OFF')
  const migrateTxn = db.transaction(() => {
    // Placeholder rows preserve scan history when parent rows are missing.
    db.prepare("INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES ('unknown', 'Unknown Device', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run()
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions_new (
        sessionId TEXT PRIMARY KEY,
        deviceId TEXT NOT NULL DEFAULT 'unknown' REFERENCES devices(deviceId) ON DELETE SET DEFAULT ON UPDATE CASCADE,
        startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        endedAt TEXT
      );
      INSERT OR IGNORE INTO sessions_new (sessionId, deviceId, startedAt, endedAt)
        SELECT sessionId, COALESCE(NULLIF(deviceId, ''), 'unknown'), startedAt, endedAt FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      CREATE TABLE IF NOT EXISTS scans_new (
        id TEXT PRIMARY KEY,
        treeId TEXT NOT NULL,
        scannedAt TEXT NOT NULL,
        assessment TEXT NOT NULL CHECK(assessment IN ('high', 'moderate', 'low')),
        imagePath TEXT,
        sessionId TEXT REFERENCES sessions(sessionId) ON DELETE SET NULL ON UPDATE CASCADE,
        deviceId TEXT REFERENCES devices(deviceId) ON DELETE SET NULL ON UPDATE CASCADE,
        serverReceived TEXT DEFAULT CURRENT_TIMESTAMP,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO scans_new (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived, createdAt)
        SELECT id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived, createdAt FROM scans;
      DROP TABLE scans;
      ALTER TABLE scans_new RENAME TO scans_new_tmp;
    `)
    // Null out orphan references (can't FK-point at rows that don't exist).
    db.prepare("UPDATE scans_new_tmp SET sessionId = NULL WHERE sessionId IS NOT NULL AND sessionId NOT IN (SELECT sessionId FROM sessions)").run()
    db.prepare("UPDATE scans_new_tmp SET deviceId = NULL WHERE deviceId IS NOT NULL AND deviceId NOT IN (SELECT deviceId FROM devices)").run()
    db.prepare("UPDATE sessions SET deviceId = 'unknown' WHERE deviceId IS NULL OR deviceId = '' OR deviceId NOT IN (SELECT deviceId FROM devices)").run()
    db.exec(`
      ALTER TABLE scans_new_tmp RENAME TO scans;
      CREATE INDEX IF NOT EXISTS idx_scannedAt ON scans(scannedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_sessionId ON scans(sessionId);
      CREATE INDEX IF NOT EXISTS idx_deviceId ON scans(deviceId);
    `)
    db.pragma('user_version = ' + SCHEMA_VERSION)
  })
  try {
    migrateTxn()
  } catch (error) {
    logger.error('FK migration failed', { error: error.message })
  }
  db.pragma('foreign_keys = ON')
  try {
    const violations = db.prepare('PRAGMA foreign_key_check').all()
    if (violations.length > 0) logger.error('Foreign key violations after migration', { count: violations.length })
    else logger.info('Foreign key check passed')
  } catch (_) {}
}

function hashLegacyToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

function hashLegacyPairTokens(db) {
  // One-time backfill: replace plaintext pair_tokens + devices.lastPairedToken
  // with SHA-256 hashes. Plaintext UUIDs are 36 chars; hashes are 64 hex chars.
  try {
    const plaintextRows = db.prepare("SELECT token FROM pair_tokens WHERE length(token) != 64").all()
    if (plaintextRows.length === 0) return
    const updateToken = db.prepare('UPDATE pair_tokens SET token = ? WHERE token = ?')
    const updateDevice = db.prepare('UPDATE devices SET lastPairedToken = ? WHERE lastPairedToken = ?')
    const backfill = db.transaction((rows) => {
      for (const row of rows) {
        const hashed = hashLegacyToken(row.token)
        try {
          updateDevice.run(hashed, row.token)
        } catch (_) {}
        try {
          updateToken.run(hashed, row.token)
        } catch (_) {
          // Hash collision with existing row: drop the plaintext duplicate.
          try { db.prepare('DELETE FROM pair_tokens WHERE token = ?').run(row.token) } catch (_) {}
        }
      }
    })
    backfill(plaintextRows)
    logger.info('Hashed legacy pair tokens', { count: plaintextRows.length })
  } catch (_) {}
}

export function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      treeId TEXT NOT NULL,
      scannedAt TEXT NOT NULL,
      assessment TEXT NOT NULL CHECK(assessment IN ('high', 'moderate', 'low')),
      imagePath TEXT,
      sessionId TEXT,
      deviceId TEXT,
      serverReceived TEXT DEFAULT CURRENT_TIMESTAMP,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS devices (
      deviceId TEXT PRIMARY KEY,
      deviceName TEXT NOT NULL,
      registeredAt TEXT DEFAULT CURRENT_TIMESTAMP,
      lastSeenAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sessionId TEXT PRIMARY KEY,
      deviceId TEXT NOT NULL,
      startedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      endedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS deletion_history (
      historyId TEXT PRIMARY KEY,
      scanId TEXT NOT NULL,
      deletedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      deletedBy TEXT DEFAULT 'unknown'
    );
    CREATE INDEX IF NOT EXISTS idx_scannedAt ON scans(scannedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_sessionId ON scans(sessionId);
    CREATE INDEX IF NOT EXISTS idx_deviceId ON scans(deviceId);
    CREATE TABLE IF NOT EXISTS pair_tokens (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used INTEGER NOT NULL DEFAULT 0,
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pair_tokens_created ON pair_tokens(created_at);
  `)

  const scanColumns = db.pragma('table_info(scans)').map(column => column.name)
  const deviceColumns = db.pragma('table_info(devices)').map(column => column.name)
  const missingColumns = []
  const missingDeviceColumns = []
  if (!scanColumns.includes('sessionId')) missingColumns.push('ALTER TABLE scans ADD COLUMN sessionId TEXT')
  if (!scanColumns.includes('deviceId')) missingColumns.push('ALTER TABLE scans ADD COLUMN deviceId TEXT')
  if (!scanColumns.includes('serverReceived')) missingColumns.push("ALTER TABLE scans ADD COLUMN serverReceived TEXT DEFAULT CURRENT_TIMESTAMP")
  if (!scanColumns.includes('createdAt')) missingColumns.push("ALTER TABLE scans ADD COLUMN createdAt TEXT DEFAULT CURRENT_TIMESTAMP")
  if (!deviceColumns.includes('lastPairedToken')) missingDeviceColumns.push("ALTER TABLE devices ADD COLUMN lastPairedToken TEXT")

  for (const statement of [...missingColumns, ...missingDeviceColumns]) {
    try {
      db.exec(statement)
    } catch (_) {
      // ignore if already applied
    }
  }

  db.pragma('journal_mode = WAL')
  db.exec('CREATE INDEX IF NOT EXISTS idx_devices_lastSeenAt ON devices(lastSeenAt DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_startedAt ON sessions(startedAt DESC)')

  try {
    const backfill = db.prepare('UPDATE scans SET deviceId = (SELECT sessions.deviceId FROM sessions WHERE sessions.sessionId = scans.sessionId) WHERE scans.deviceId IS NULL OR scans.deviceId = ""')
    const updated = backfill.run().changes
    if (updated > 0) logger.info('Backfilled deviceId for scans', { updated })
  } catch (_) {}

  hashLegacyPairTokens(db)
  ensureForeignKeys(db)
}

export function seedDatabase(db) {
  const count = db.prepare('SELECT COUNT(*) as total FROM scans').get().total
  if (count > 0) return

  const assessments = [
    { value: 'high', weight: 0.1 },
    { value: 'moderate', weight: 0.2 },
    { value: 'low', weight: 0.7 },
  ]
  const now = new Date()
  const treeIdChars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  function randomTreeId() {
    const suffix = Array.from({ length: 4 }, () => treeIdChars[Math.floor(Math.random() * treeIdChars.length)]).join('')
    const timePart = now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0')
    return `MG-${suffix}-${timePart}`
  }
  const treeIds = Array.from({ length: 40 }, () => randomTreeId())
  const recordsPerMonth = 84
  const records = []

  const deviceIds = ['device-001', 'device-002', 'device-003']
  const devices = deviceIds.map((deviceId, index) => {
    const isPaired = index < 2
    const isOnline = index === 0
    return {
      deviceId,
      deviceName: `Field Tablet ${index + 1}`,
      registeredAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      lastSeenAt: isOnline ? now.toISOString() : new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
      lastPairedToken: isPaired ? `token-${deviceId}` : null,
    }
  })
  const insertDevice = db.prepare('INSERT OR REPLACE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt, lastPairedToken) VALUES (?, ?, ?, ?, ?)')
  const deviceTransaction = db.transaction(() => {
    for (const device of devices) {
      insertDevice.run(device.deviceId, device.deviceName, device.registeredAt, device.lastSeenAt, device.lastPairedToken)
    }
  })
  deviceTransaction()

  const nowISO = now.toISOString()
  const insertPairToken = db.prepare("INSERT OR REPLACE INTO pair_tokens (token, created_at, used, device_id) VALUES (?, ?, 1, ?)")
  const pairTokenTransaction = db.transaction(() => {
    for (const device of devices) {
      if (device.lastPairedToken) {
        insertPairToken.run(device.lastPairedToken, nowISO, device.deviceId)
      }
    }
  })
  pairTokenTransaction()

  const sessionStarts = deviceIds.map((deviceId, index) => new Date(now.getTime() - 1000 * 60 * 60 * 24 * (index + 2)).toISOString())
  const sessions = sessionStarts.map((startedAt, index) => ({
    sessionId: `session-${index + 1}`,
    deviceId: deviceIds[index],
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 1000 * 60 * 60 * 3).toISOString(),
  }))
  const insertSession = db.prepare('INSERT OR REPLACE INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)')
  const sessionTransaction = db.transaction(() => {
    for (const session of sessions) {
      insertSession.run(session.sessionId, session.deviceId, session.startedAt, session.endedAt)
    }
  })
  sessionTransaction()

  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0, 23, 59, 59, 999)
    const monthStartMs = monthStart.getTime()
    const monthEndMs = monthEnd.getTime()

    for (let i = 0; i < recordsPerMonth; i++) {
      const randomTime = monthStartMs + Math.random() * (monthEndMs - monthStartMs)
      const scannedAt = new Date(randomTime).toISOString()

      const rand = Math.random()
      const assessment = rand < assessments[0].weight
        ? assessments[0].value
        : rand < assessments[0].weight + assessments[1].weight
          ? assessments[1].value
          : assessments[2].value

      const treeId = treeIds[Math.floor(Math.random() * treeIds.length)]
      const sessionIndex = Math.floor(Math.random() * sessions.length)
      const session = sessions[sessionIndex]

      records.push({
        id: crypto.randomUUID(),
        treeId,
        scannedAt,
        assessment,
        imagePath: null,
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        serverReceived: new Date(randomTime + 1000 * 60 * 5).toISOString(),
      })
    }
  }

  records.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())

  const insert = db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const transaction = db.transaction(() => {
    for (const scan of records) {
      insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imagePath, scan.sessionId, scan.deviceId, scan.serverReceived)
    }
  })
  transaction()

  logger.info('Seeded database', { scans: records.length })
}

export async function migrateFromJson(db, root, scansFile) {
  try {
    const { readFile, unlink } = await import('node:fs/promises')
    const content = await readFile(scansFile, 'utf8')
    const scans = JSON.parse(content)
    if (!Array.isArray(scans) || scans.length === 0) return

    const insert = db.prepare('INSERT OR IGNORE INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const transaction = db.transaction(async () => {
      for (const scan of scans) {
        if (!scan || typeof scan !== 'object') continue
        const id = typeof scan.id === 'string' && scan.id ? scan.id : crypto.randomUUID()
        const treeId = typeof scan.treeId === 'string' ? scan.treeId.trim() : ''
        const scannedAt = typeof scan.scannedAt === 'string' ? scan.scannedAt : ''
        const assessment = typeof scan.assessment === 'string' ? scan.assessment.toLowerCase() : ''

        if (!treeId || !['high', 'moderate', 'low'].includes(assessment)) continue

        let imagePath = scan.imageUrl || scan.imagePath || ''
        if (!imagePath && scan.imageBase64) {
          const saved = await saveScanImage(path.join(root, 'data'), id, scan.imageBase64)
          if (saved) imagePath = saved
        }

        insert.run(id, treeId, scannedAt, assessment, imagePath, scan.sessionId || null, scan.deviceId || null, scan.serverReceived || new Date().toISOString())
      }
    })
    await transaction()

    await unlink(scansFile)
  } catch (error) {
    logger.error('Migration error', { error: error.message, code: error.code })
  }
}
