import Database from 'better-sqlite3'
import { saveScanImage } from '../services/scans.js'
import { createLogger } from '../services/logger.js'

const logger = createLogger('db')

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
