import express from 'express'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import QRCode from 'qrcode'

const app = express()
const port = Number(process.env.PORT || 8080)
const root = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.DATA_DIRECTORY || path.join(root, 'data')
const scansFile = path.join(dataDirectory, 'scans.json')
const imagesDirectory = path.join(dataDirectory, 'scan-images')
const logSubscribers = new Set()
const pairTokens = new Map()

async function generateStyledQrDataUrl(text) {
  const qr = await QRCode.create(text, { errorCorrectionLevel: 'H' })
  const size = qr.modules.size
  const margin = 2
  const scale = 2
  const svgSize = (size + margin * 2) * scale
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges">`
  svg += `<defs><linearGradient id="qrGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${svgSize}" y2="${svgSize}"><stop offset="0%" stop-color="#20B2AA"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>`
  svg += `<rect width="${svgSize}" height="${svgSize}" fill="#ffffff"/>`
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.data[`${row * size + col}`]) {
        const x = (col + margin) * scale
        const y = (row + margin) * scale
        svg += `<rect x="${x}" y="${y}" width="${scale}" height="${scale}" fill="url(#qrGradient)"/>`
      }
    }
  }
  const logoModules = 11
  const logoSize = logoModules * scale
  const logoX = (margin + Math.floor((size - logoModules) / 2)) * scale
  const logoY = (margin + Math.floor((size - logoModules) / 2)) * scale
  svg += `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" fill="#ffffff"/>`
  try {
    const logoPath = path.join(root, 'public', 'mangroveguard-logo.png')
    const logoBuffer = await readFile(logoPath)
    const logoBase64 = logoBuffer.toString('base64')
    svg += `<image href="data:image/png;base64,${logoBase64}" xlink:href="data:image/png;base64,${logoBase64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`
  } catch (error) {
    console.error('Logo embed error:', error)
  }
  svg += `</svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

app.use(express.json({ limit: '10mb' }))

const dbPath = path.join(dataDirectory, 'mangrove.db')
await mkdir(dataDirectory, { recursive: true })
const db = new Database(dbPath)

const initDb = () => {
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
  `)

  const columns = db.pragma('table_info(scans)').map(column => column.name)
  const missingColumns = []
  if (!columns.includes('sessionId')) missingColumns.push('ALTER TABLE scans ADD COLUMN sessionId TEXT')
  if (!columns.includes('deviceId')) missingColumns.push('ALTER TABLE scans ADD COLUMN deviceId TEXT')
  if (!columns.includes('serverReceived')) missingColumns.push("ALTER TABLE scans ADD COLUMN serverReceived TEXT DEFAULT CURRENT_TIMESTAMP")
  if (!columns.includes('createdAt')) missingColumns.push("ALTER TABLE scans ADD COLUMN createdAt TEXT DEFAULT CURRENT_TIMESTAMP")

  for (const statement of missingColumns) {
    try {
      db.exec(statement)
    } catch (_) {
      // ignore if already applied
    }
  }
}

initDb()

function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) as total FROM scans').get().total
  if (count > 0) return

  const assessments = [
    { value: 'high', weight: 0.5 },
    { value: 'moderate', weight: 0.3 },
    { value: 'low', weight: 0.2 },
  ]
  const now = new Date()
  const treeIds = Array.from({ length: 40 }, (_, i) => `MNG-${String(i + 1).padStart(3, '0')}`)
  const recordsPerMonth = 84
  const records = []

  const deviceIds = ['device-001', 'device-002', 'device-003']
  const devices = deviceIds.map((deviceId, index) => ({
    deviceId,
    deviceName: `Field Tablet ${index + 1}`,
    registeredAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    lastSeenAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * (index + 1)).toISOString(),
  }))
  const insertDevice = db.prepare('INSERT OR REPLACE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)')
  const deviceTransaction = db.transaction(() => {
    for (const device of devices) {
      insertDevice.run(device.deviceId, device.deviceName, device.registeredAt, device.lastSeenAt)
    }
  })
  deviceTransaction()

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

  console.log(`[Database] Seeded ${records.length} scan records with devices and sessions.`)
}

//seedDatabase()

async function migrateFromJson() {
  try {
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
          const saved = await saveScanImage(id, scan.imageBase64)
          if (saved) imagePath = saved
        }

        insert.run(id, treeId, scannedAt, assessment, imagePath, scan.sessionId || null, scan.deviceId || null, scan.serverReceived || new Date().toISOString())
      }
    })
    await transaction()

    await unlink(scansFile)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Migration error:', error)
    }
  }
}

async function saveScanImage(scanId, imageBase64) {
  if (!imageBase64) return ''
  const normalized = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '')
  const imageBuffer = Buffer.from(normalized, 'base64')
  if (imageBuffer.length === 0 || imageBuffer.length > 8 * 1024 * 1024) return ''

  await mkdir(imagesDirectory, { recursive: true })
  const fileName = `${scanId}.jpg`
  await writeFile(path.join(imagesDirectory, fileName), imageBuffer)
  return `/scan-images/${fileName}`
}

function notifyLogSubscribers() {
  for (const response of logSubscribers) {
    response.write('event: scans-updated\\ndata: updated\\n\\n')
  }
}

async function toScan(payload) {
  const source = payload || {}
  const treeId = typeof source.treeId === 'string' ? source.treeId.trim() : typeof source.tree_id === 'string' ? source.tree_id.trim() : ''
  const scannedAt = new Date(source.scannedAt || source.scanned_at || '')
  const assessment = typeof source.assessment === 'string'
    ? source.assessment.toLowerCase()
    : typeof source.predicted_assessment === 'string'
      ? source.predicted_assessment.toLowerCase()
      : ''
  const imageBase64 = typeof source.imageBase64 === 'string' ? source.imageBase64.trim() : ''
  const deviceId = typeof source.deviceId === 'string' ? source.deviceId.trim() : typeof source.device_id === 'string' ? source.device_id.trim() : null
  const sessionId = typeof source.sessionId === 'string' ? source.sessionId.trim() : typeof source.session_id === 'string' ? source.session_id.trim() : null
  if (!treeId || Number.isNaN(scannedAt.valueOf()) || !['high', 'moderate', 'low'].includes(assessment)) {
    return null
  }
  const id = crypto.randomUUID()
  const imageUrl = await saveScanImage(id, imageBase64)
  const serverReceived = new Date().toISOString()

  if (deviceId) {
    db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, deviceId, new Date().toISOString(), new Date().toISOString())
    db.prepare('UPDATE devices SET lastSeenAt = ? WHERE deviceId = ?').run(new Date().toISOString(), deviceId)
  }

  if (sessionId) {
    db.prepare('INSERT OR IGNORE INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run(sessionId, deviceId || 'unknown', new Date().toISOString(), null)
  }

  return {
    id,
    treeId: treeId.slice(0, 100),
    scannedAt: scannedAt.toISOString(),
    assessment,
    ...(imageUrl ? { imageUrl } : {}),
    sessionId: sessionId,
    deviceId,
    serverReceived,
  }
}

app.get('/api/scans', (_request, response, next) => {
  try {
    const scans = db.prepare('SELECT id, treeId, scannedAt, assessment, imagePath as imageUrl, sessionId, deviceId, serverReceived FROM scans ORDER BY scannedAt DESC').all()
    response.json(scans)
  } catch (error) { next(error) }
})

app.get('/api/scans/events', (request, response) => {
  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
  })
  response.write('retry: 3000\\n\\n')
  logSubscribers.add(response)
  request.on('close', () => logSubscribers.delete(response))
})

app.post('/api/scans/batch', async (request, response, next) => {
  try {
    const body = request.body || {}
    const scans = Array.isArray(body.scans) ? body.scans : []
    const results = []
    for (const payload of scans) {
      const scan = await toScan(payload || {})
      if (!scan) continue
      const insert = db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imageUrl || '', scan.sessionId, scan.deviceId, scan.serverReceived)
      results.push(scan)
    }
    notifyLogSubscribers()
    response.status(201).json({ inserted: results.length, scans: results })
  } catch (error) { next(error) }
})

app.post('/api/scans', async (request, response, next) => {
  try {
    const scan = await toScan(request.body || {})
    if (!scan) return response.status(400).json({ error: 'treeId, scannedAt, and a valid assessment are required.' })

    const insert = db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath, sessionId, deviceId, serverReceived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imageUrl || '', scan.sessionId, scan.deviceId, scan.serverReceived)

    notifyLogSubscribers()
    response.status(201).json(scan)
  } catch (error) { next(error) }
})

app.get('/api/devices', (_request, response, next) => {
  try {
    const devices = db.prepare('SELECT deviceId, deviceName, registeredAt, lastSeenAt FROM devices ORDER BY lastSeenAt DESC').all()
    response.json(devices)
  } catch (error) { next(error) }
})

app.post('/api/devices', (request, response, next) => {
  try {
    const body = request.body || {}
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : typeof body.device_name === 'string' ? body.device_name.trim() : deviceId
    if (!deviceId) return response.status(400).json({ error: 'deviceId is required.' })

    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, deviceName || deviceId, now, now)
    db.prepare('UPDATE devices SET deviceName = COALESCE(?, deviceName), lastSeenAt = ? WHERE deviceId = ?').run(deviceName || null, now, deviceId)

    const device = db.prepare('SELECT deviceId, deviceName, registeredAt, lastSeenAt FROM devices WHERE deviceId = ?').get(deviceId)
    response.status(device ? 200 : 201).json(device || { deviceId, deviceName: deviceName || deviceId, registeredAt: now, lastSeenAt: now })
  } catch (error) { next(error) }
})

app.get('/api/sessions', (_request, response, next) => {
  try {
    const sessions = db.prepare('SELECT sessionId, deviceId, startedAt, endedAt FROM sessions ORDER BY startedAt DESC').all()
    response.json(sessions)
  } catch (error) { next(error) }
})

app.post('/api/sessions', (request, response, next) => {
  try {
    const body = request.body || {}
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : typeof body.session_id === 'string' ? body.session_id.trim() : ''
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
    if (!sessionId || !deviceId) return response.status(400).json({ error: 'sessionId and deviceId are required.' })

    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run(sessionId, deviceId, now, null)
    db.prepare('UPDATE sessions SET deviceId = ?, startedAt = COALESCE(startedAt, ?) WHERE sessionId = ?').run(deviceId, now, sessionId)

    const session = db.prepare('SELECT sessionId, deviceId, startedAt, endedAt FROM sessions WHERE sessionId = ?').get(sessionId)
    response.status(session ? 200 : 201).json(session || { sessionId, deviceId, startedAt: now, endedAt: null })
  } catch (error) { next(error) }
})

app.get('/api/deletion-history', (_request, response, next) => {
  try {
    const history = db.prepare('SELECT historyId, scanId, deletedAt, deletedBy FROM deletion_history ORDER BY deletedAt DESC').all()
    response.json(history)
  } catch (error) { next(error) }
})

app.use('/scan-images', express.static(imagesDirectory))

app.get('/api/pair/qr', async (req, res) => {
  try {
    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim()
    const baseUrl = publicBaseUrl || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`
    const token = crypto.randomUUID()
    const pairUrl = `${baseUrl}/pair?token=${token}`
    pairTokens.set(token, { createdAt: Date.now(), used: false })

    const qrDataUrl = await generateStyledQrDataUrl(pairUrl)
    res.json({ token, url: pairUrl, qrDataUrl })
  } catch (error) {
    console.error('QR generation error:', error)
    res.status(500).json({ error: 'Unable to generate QR' })
  }
})

app.get('/pair', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : ''
  if (!token) return res.status(400).send('Missing token')

  const record = pairTokens.get(token)
  if (!record || record.used) return res.status(400).send('Invalid or expired token')

  res.send(`<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Pair Device</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}form{display:flex;flex-direction:column;gap:12px;width:min(360px,90vw);padding:24px;border-radius:24px;background:#1e293b;box-shadow:0 20px 50px rgba(15,23,42,0.5)}input{padding:14px 16px;border-radius:14px;border:1px solid #334155;background:#0f172a;color:#f8fafc;font:inherit;font-size:14px}button{padding:14px;border:0;border-radius:14px;background:#10b981;color:#fff;font-weight:700;cursor:pointer}label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}</style></head><body><form method="POST" action="/api/pair/confirm"><input type="hidden" name="token" value="${token}"/><div><label>Device ID</label><input name="deviceId" required placeholder="Device ID"/></div><div><label>Device Name</label><input name="deviceName" placeholder="Optional"/></div><button type="submit">Confirm Pairing</button></form></body></html>`)
})

app.post('/api/pair/confirm', (req, res) => {
  const body = req.body || {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : typeof body.device_name === 'string' ? body.device_name.trim() : ''
  const record = pairTokens.get(token)
  if (!record || record.used) return res.status(400).json({ error: 'Invalid or expired token' })
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' })

  record.used = true
  const now = new Date().toISOString()
  db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, deviceName || deviceId, now, now)
  db.prepare('UPDATE devices SET lastSeenAt = ?, deviceName = COALESCE(?, deviceName) WHERE deviceId = ?').run(now, deviceName || null, deviceId)

  res.status(201).json({ deviceId, pairedAt: now })
})
app.use(express.static(path.join(root, 'dist')))
app.get('*splat', (_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')))
app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Unable to process observation logs.' })
})

app.listen(port, '0.0.0.0', () => console.log(`MangroveGuard dashboard listening on port ${port}`))
