import { deviceSubscribers, notifyDeviceSubscribers, sessionSubscribers, notifySessionSubscribers } from '../services/subscribers.js'
import { createPairToken, getPairToken, markPairTokenUsed, cleanupStalePairTokens } from '../services/qr.js'
import { createLogger } from '../services/logger.js'

const logger = createLogger('pair')

export function registerPairRoutes(app, db, root, generateStyledQrDataUrl) {
  app.get('/api/pair/qr', async (req, res) => {
    try {
      const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim()
      const baseUrl = publicBaseUrl || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`
      const token = crypto.randomUUID()
      const pairUrl = `${baseUrl}/pair?token=${token}`

      createPairToken(db, token)
      cleanupStalePairTokens(db)

      const qrDataUrl = await generateStyledQrDataUrl(root, pairUrl)
      res.json({ token, url: pairUrl, qrDataUrl })
    } catch (error) {
      logger.error('QR generation error', { error: error.message })
      res.status(500).json({ error: 'Unable to generate QR', code: 'QR_GENERATION_FAILED' })
    }
  })

  app.get('/pair', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : ''
    if (!token) return res.status(400).send('Missing token')

    const record = getPairToken(db, token)
    if (!record || record.used) return res.status(400).send('Invalid or expired token')

    res.send(`<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Pair Device</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}form{display:flex;flex-direction:column;gap:12px;width:min(360px,90vw);padding:24px;border-radius:24px;background:#1e293b;box-shadow:0 20px 50px rgba(15,23,42,0.5)}input{padding:14px 16px;border-radius:14px;border:1px solid #334155;background:#0f172a;color:#f8fafc;font:inherit;font-size:14px}button{padding:14px;border:0;border-radius:14px;background:#10b981;color:#fff;font-weight:700;cursor:pointer}label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}</style></head><body><form method="POST" action="/api/pair/confirm"><input type="hidden" name="token" value="${token}"/><div><label>Device ID</label><input name="deviceId" required placeholder="Device ID"/></div><div><label>Device Name</label><input name="deviceName" placeholder="Optional"/></div><button type="submit">Confirm Pairing</button></form></body></html>`)
  })

  app.post('/api/pair/unpair', (req, res) => {
    const body = req.body || {}
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required', code: 'VALIDATION_ERROR' })

    const now = new Date().toISOString()
    const existing = db.prepare('SELECT lastPairedToken FROM devices WHERE deviceId = ?').get(deviceId)
    db.prepare('UPDATE devices SET lastPairedToken = NULL, lastSeenAt = ? WHERE deviceId = ?').run(now, deviceId)

    if (existing && existing.lastPairedToken) {
      db.prepare('UPDATE pair_tokens SET used = 1 WHERE token = ?').run(existing.lastPairedToken)
    }

    notifyDeviceSubscribers()
    res.json({ deviceId, unpairedAt: now })
  })

  app.post('/api/pair/confirm', (req, res) => {
    const body = req.body || {}
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : typeof body.device_id === 'string' ? body.device_id.trim() : ''
    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : typeof body.device_name === 'string' ? body.device_name.trim() : ''
    const record = getPairToken(db, token)
    if (!record || record.used) return res.status(400).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' })
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required', code: 'VALIDATION_ERROR' })

    markPairTokenUsed(db, token, deviceId)
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO devices (deviceId, deviceName, registeredAt, lastSeenAt) VALUES (?, ?, ?, ?)').run(deviceId, deviceName || deviceId, now, now)
    db.prepare('UPDATE devices SET deviceName = COALESCE(?, deviceName), lastSeenAt = ?, lastPairedToken = ? WHERE deviceId = ?').run(deviceName || null, now, token, deviceId)

    notifyDeviceSubscribers()
    res.status(201).json({ deviceId, pairedAt: now })
  })
}
