import express from 'express'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const app = express()
const port = Number(process.env.PORT || 8080)
const root = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.DATA_DIRECTORY || path.join(root, 'data')
const scansFile = path.join(dataDirectory, 'scans.json')
const imagesDirectory = path.join(dataDirectory, 'scan-images')
const logSubscribers = new Set()

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
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scannedAt ON scans(scannedAt DESC);
  `)
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

      records.push({
        id: crypto.randomUUID(),
        treeId,
        scannedAt,
        assessment,
        imagePath: null,
      })
    }
  }

  records.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())

  const insert = db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath) VALUES (?, ?, ?, ?, ?)')
  const transaction = db.transaction(() => {
    for (const scan of records) {
      insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imagePath)
    }
  })
  transaction()

  console.log(`[Database] Seeded 1,000+ scan records (80+ per month) across the past 12 months.`)
}

// seedDatabase()

async function migrateFromJson() {
  try {
    const content = await readFile(scansFile, 'utf8')
    const scans = JSON.parse(content)
    if (!Array.isArray(scans) || scans.length === 0) return

    const insert = db.prepare('INSERT OR IGNORE INTO scans (id, treeId, scannedAt, assessment, imagePath) VALUES (?, ?, ?, ?, ?)')
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

        insert.run(id, treeId, scannedAt, assessment, imagePath)
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
  const treeId = typeof payload.treeId === 'string' ? payload.treeId.trim() : ''
  const scannedAt = new Date(payload.scannedAt)
  const assessment = typeof payload.assessment === 'string'
    ? payload.assessment.toLowerCase()
    : ''
  const imageBase64 = typeof payload.imageBase64 === 'string' ? payload.imageBase64.trim() : ''
  if (!treeId || Number.isNaN(scannedAt.valueOf()) || !['high', 'moderate', 'low'].includes(assessment)) {
    return null
  }
  const id = crypto.randomUUID()
  const imageUrl = await saveScanImage(id, imageBase64)
  return {
    id,
    treeId: treeId.slice(0, 100),
    scannedAt: scannedAt.toISOString(),
    assessment,
    ...(imageUrl ? { imageUrl } : {}),
  }
}

app.get('/api/scans', (_request, response, next) => {
  try {
    const scans = db.prepare('SELECT id, treeId, scannedAt, assessment, imagePath as imageUrl FROM scans ORDER BY scannedAt DESC').all()
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

app.post('/api/scans', async (request, response, next) => {
  try {
    const scan = await toScan(request.body || {})
    if (!scan) return response.status(400).json({ error: 'treeId, scannedAt, and a valid assessment are required.' })

    const insert = db.prepare('INSERT INTO scans (id, treeId, scannedAt, assessment, imagePath) VALUES (?, ?, ?, ?, ?)')
    insert.run(scan.id, scan.treeId, scan.scannedAt, scan.assessment, scan.imageUrl || '')

    notifyLogSubscribers()
    response.status(201).json(scan)
  } catch (error) { next(error) }
})

app.use('/scan-images', express.static(imagesDirectory))
app.use(express.static(path.join(root, 'dist')))
app.get('*splat', (_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')))
app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Unable to process observation logs.' })
})

app.listen(port, '0.0.0.0', () => console.log(`MangroveGuard dashboard listening on port ${port}`))
