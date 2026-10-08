// Minimal in-memory sliding-window rate limiter (no new dependencies).
// Not for multi-process deploys, but stops QR/token abuse on demo installs.
export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map()
  const middleware = (req, res, next) => {
    try {
      const now = Date.now()
      const key = req.ip || req.socket?.remoteAddress || 'unknown'
      const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs)
      timestamps.push(now)
      hits.set(key, timestamps)
      // Opportunistic cleanup to bound memory.
      if (hits.size > 1000) {
        for (const [k, v] of hits) {
          if (v.length === 0 || now - v[v.length - 1] >= windowMs) hits.delete(k)
          if (hits.size <= 500) break
        }
      }
      if (timestamps.length > max) {
        const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000)
        res.setHeader('Retry-After', String(Math.max(retryAfter, 1)))
        return res.status(429).json({ error: 'Too many requests. Please retry later.', code: 'RATE_LIMITED' })
      }
      return next()
    } catch (_) {
      return next()
    }
  }
  middleware.clear = () => hits.clear()
  return middleware
}
