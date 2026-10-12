import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { freshDb, createApp, request, makeTempDir, openEventStream, delay, validScanPayload } from './helpers.js'
import {
  logSubscribers,
  deviceSubscribers,
  sessionSubscribers,
} from '../services/subscribers.js'

describe('SSE event streams', () => {
  let db
  let app
  let dataDirectory

  beforeEach(async () => {
    logSubscribers.clear()
    deviceSubscribers.clear()
    sessionSubscribers.clear()
    db = freshDb()
    dataDirectory = await makeTempDir()
    app = createApp(db, dataDirectory)
  })

  afterEach(() => {
    logSubscribers.clear()
    deviceSubscribers.clear()
    sessionSubscribers.clear()
    delete process.env.SSE_HEARTBEAT_INTERVAL_MS
  })

  it('/api/scans/events opens a stream with the retry hint', async () => {
    const stream = await openEventStream(app, '/api/scans/events', { waitMs: 150 })
    assert.equal(stream.status, 200)
    assert.equal(stream.headers['content-type'], 'text/event-stream')
    assert.ok(stream.headers['cache-control'].includes('no-cache'))
    assert.ok(stream.text.startsWith('retry: 3000\n\n'))
  })

  it('/api/devices/events opens a stream with the retry hint', async () => {
    const stream = await openEventStream(app, '/api/devices/events', { waitMs: 150 })
    assert.equal(stream.status, 200)
    assert.equal(stream.headers['content-type'], 'text/event-stream')
    assert.ok(stream.text.startsWith('retry: 3000\n\n'))
  })

  it('/api/sessions/events opens a stream with the retry hint', async () => {
    const stream = await openEventStream(app, '/api/sessions/events', { waitMs: 150 })
    assert.equal(stream.status, 200)
    assert.equal(stream.headers['content-type'], 'text/event-stream')
    assert.ok(stream.text.startsWith('retry: 3000\n\n'))
  })

  it('broadcasts scans-updated when a scan is inserted', async () => {
    const stream = await openEventStream(app, '/api/scans/events', {
      waitMs: 400,
      onOpen: async () => {
        await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-sse' })
      },
    })
    assert.ok(stream.text.includes('event: scans-updated'))
    assert.ok(stream.text.includes('data: updated'))
  })

  it('broadcasts devices-updated when a device is registered', async () => {
    const stream = await openEventStream(app, '/api/devices/events', {
      waitMs: 400,
      onOpen: async () => {
        await request(app, 'POST', '/api/devices', { deviceId: 'device-sse', deviceName: 'Tablet' })
      },
    })
    assert.ok(stream.text.includes('event: devices-updated'))
  })

  it('broadcasts sessions-updated when a session starts', async () => {
    const stream = await openEventStream(app, '/api/sessions/events', {
      waitMs: 400,
      onOpen: async () => {
        await request(app, 'POST', '/api/devices', { deviceId: 'device-sse', deviceName: 'Tablet' })
        await request(app, 'POST', '/api/sessions', { sessionId: 'session-sse', deviceId: 'device-sse' })
      },
    })
    assert.ok(stream.text.includes('event: sessions-updated'))
  })

  it('broadcasts sessions-updated when a scan carries a new sessionId', async () => {
    const stream = await openEventStream(app, '/api/sessions/events', {
      waitMs: 400,
      onOpen: async () => {
        await request(app, 'POST', '/api/scans', {
          ...validScanPayload,
          scan_id: 'scan-sse-session',
          sessionId: 'session-from-scan',
        })
      },
    })
    assert.ok(stream.text.includes('event: sessions-updated'))
  })

  it('removes the subscriber when the client disconnects', async () => {
    const stream = await openEventStream(app, '/api/scans/events', { waitMs: 150 })
    assert.equal(stream.status, 200)
    await delay(100)
    assert.equal(logSubscribers.size, 0)
  })

  it('removes device and session subscribers on disconnect', async () => {
    await openEventStream(app, '/api/devices/events', { waitMs: 100 })
    await openEventStream(app, '/api/sessions/events', { waitMs: 100 })
    await delay(100)
    assert.equal(deviceSubscribers.size, 0)
    assert.equal(sessionSubscribers.size, 0)
  })

  it('emits heartbeats at SSE_HEARTBEAT_INTERVAL_MS', async () => {
    process.env.SSE_HEARTBEAT_INTERVAL_MS = '60'
    const stream = await openEventStream(app, '/api/scans/events', { waitMs: 400 })
    assert.ok(stream.text.includes(': heartbeat'))
  })

  it('supports multiple concurrent subscribers', async () => {
    const first = openEventStream(app, '/api/scans/events', {
      waitMs: 400,
      onOpen: async () => {
        await delay(50)
      },
    })
    const second = openEventStream(app, '/api/scans/events', {
      waitMs: 400,
      onOpen: async () => {
        await request(app, 'POST', '/api/scans', { ...validScanPayload, scan_id: 'scan-sse-multi' })
      },
    })
    const [a, b] = await Promise.all([first, second])
    assert.ok(a.text.includes('event: scans-updated') || b.text.includes('event: scans-updated'))
    assert.ok(b.text.includes('event: scans-updated'))
    await delay(100)
    assert.equal(logSubscribers.size, 0)
  })
})
