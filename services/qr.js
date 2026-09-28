import QRCode from 'qrcode'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from './logger.js'

const logger = createLogger('qr')

export async function generateStyledQrDataUrl(root, text) {
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
    logger.error('Logo embed error', { error: error.message })
  }
  svg += `</svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

export function createPairToken(db, token) {
  db.prepare("INSERT OR REPLACE INTO pair_tokens (token, created_at, used, device_id) VALUES (?, datetime('now'), 0, NULL)").run(token)
}

export function getPairToken(db, token) {
  return db.prepare('SELECT token, created_at, used, device_id FROM pair_tokens WHERE token = ?').get(token)
}

export function markPairTokenUsed(db, token, deviceId) {
  db.prepare('UPDATE pair_tokens SET used = 1, device_id = ? WHERE token = ?').run(deviceId, token)
}

export function cleanupStalePairTokens(db) {
  db.prepare("DELETE FROM pair_tokens WHERE used = 1 OR created_at < datetime('now', '-5 minutes')").run()
}
