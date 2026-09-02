import express from 'express'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT || 8080)
const root = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.DATA_DIRECTORY || path.join(root, 'data')
const scansFile = path.join(dataDirectory, 'scans.json')
const imagesDirectory = path.join(dataDirectory, 'scan-images')
const logSubscribers = new Set()

app.use(express.json({ limit: '10mb' }))

async function readScans() {
  try {
    const scans = JSON.parse(await readFile(scansFile, 'utf8'))
    if (!Array.isArray(scans)) return []

    let migrated = false
    const normalizedScans = await Promise.all(scans.map(async scan => {
      if (!scan || typeof scan !== 'object' || !scan.imageBase64) return scan
      const id = typeof scan.id === 'string' && scan.id ? scan.id : crypto.randomUUID()
      const imageUrl = scan.imageUrl || await saveScanImage(id, scan.imageBase64)
      const { imageBase64, ...rest } = scan
      migrated = true
      return { ...rest, id, ...(imageUrl ? { imageUrl } : {}) }
    }))

    if (migrated) await saveScans(normalizedScans)
    return normalizedScans
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function saveScans(scans) {
  await mkdir(dataDirectory, { recursive: true })
  const temporaryFile = `${scansFile}.tmp`
  await writeFile(temporaryFile, JSON.stringify(scans, null, 2), 'utf8')
  await rename(temporaryFile, scansFile)
}

function notifyLogSubscribers() {
  for (const response of logSubscribers) {
    response.write('event: scans-updated\\ndata: updated\\n\\n')
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
    ...(typeof payload.predictionConfidence === 'number' && Number.isFinite(payload.predictionConfidence)
      ? { predictionConfidence: payload.predictionConfidence }
      : {}),
  }
}

app.get('/api/scans', async (_request, response, next) => {
  try {
    const scans = await readScans()
    response.json(scans.sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt)))
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
    const scans = await readScans()
    scans.unshift(scan)
    await saveScans(scans.slice(0, 500))
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
