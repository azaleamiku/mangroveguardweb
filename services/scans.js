import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { notifyLogSubscribers, notifySessionSubscribers } from './subscribers.js'
import { createLogger } from './logger.js'

const logger = createLogger('scans')

export async function saveScanImage(dataDirectory, scanId, imageBase64) {
  if (!imageBase64) return ''
  const normalized = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '')
  const imageBuffer = Buffer.from(normalized, 'base64')
  if (imageBuffer.length === 0 || imageBuffer.length > 8 * 1024 * 1024) return ''
  const imagesDirectory = path.join(dataDirectory, 'scan-images')
  await mkdir(imagesDirectory, { recursive: true })
  const fileName = `${scanId}.jpg`
  await writeFile(path.join(imagesDirectory, fileName), imageBuffer)
  return `/scan-images/${fileName}`
}

export async function toScan(db, dataDirectory, payload) {
  const source = payload || {}
  const treeId = typeof source.treeId === 'string' ? source.treeId.trim() : typeof source.tree_id === 'string' ? source.tree_id.trim() : ''
  const validTreeId = /^MG-[a-z0-9]+-\d{6}(-\d+)?$/.test(treeId)
  if (!validTreeId) {
    logger.debug('Warning: non-standard treeId format received: ' + treeId)
  }
  const scannedAt = new Date(source.scannedAt || source.scanned_at || '')
  const assessment = typeof source.assessment === 'string'
    ? source.assessment.toLowerCase()
    : typeof source.predicted_assessment === 'string'
      ? source.predicted_assessment.toLowerCase()
      : ''
  const imageBase64 = typeof source.imageBase64 === 'string' ? source.imageBase64.trim() : ''
  let deviceId = typeof source.deviceId === 'string' ? source.deviceId.trim() : typeof source.device_id === 'string' ? source.device_id.trim() : null
  const sessionId = typeof source.sessionId === 'string' ? source.sessionId.trim() : typeof source.session_id === 'string' ? source.session_id.trim() : null
  if (deviceId === '') deviceId = null
  if (sessionId === '') sessionId = null

  if (!deviceId && sessionId) {
    const sessionRow = db.prepare('SELECT deviceId FROM sessions WHERE sessionId = ?').get(sessionId)
    if (sessionRow && sessionRow.deviceId && sessionRow.deviceId !== 'unknown') {
      deviceId = sessionRow.deviceId
    }
  }

  let deviceName = null
  if (deviceId) {
    const deviceRow = db.prepare('SELECT deviceName FROM devices WHERE deviceId = ?').get(deviceId)
    deviceName = deviceRow ? deviceRow.deviceName : null
  }

  if (!treeId || Number.isNaN(scannedAt.valueOf()) || !['high', 'moderate', 'low'].includes(assessment)) {
    return null
  }
  const clientId = typeof source.scan_id === 'string' && source.scan_id
    ? source.scan_id
    : typeof source.id === 'string' && source.id
      ? source.id
      : null
  const id = clientId ?? crypto.randomUUID()
  const imageUrl = await saveScanImage(dataDirectory, id, imageBase64)
  const serverReceived = new Date().toISOString()

  if (deviceId) {
    db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, deviceId, new Date().toISOString(), new Date().toISOString())
    db.prepare('UPDATE devices SET lastSeenAt = ? WHERE deviceId = ?').run(new Date().toISOString(), deviceId)
  }

  if (sessionId) {
    db.prepare('INSERT OR IGNORE INTO sessions (sessionId, deviceId, startedAt, endedAt) VALUES (?, ?, ?, ?)').run(sessionId, deviceId || 'unknown', new Date().toISOString(), null)
    notifySessionSubscribers()
  }

  return {
    id,
    treeId: treeId.slice(0, 100),
    scannedAt: scannedAt.toISOString(),
    assessment,
    ...(imageUrl ? { imageUrl } : {}),
    sessionId: sessionId,
    deviceId,
    deviceName,
    serverReceived,
  }
}
