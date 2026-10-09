import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  MAX_BATCH_PAYLOAD_BYTES,
  MAX_DEVICE_ID_LENGTH,
  MAX_DEVICE_NAME_LENGTH,
  MAX_SCAN_PAYLOAD_BYTES,
  MAX_SESSION_ID_LENGTH,
  MAX_TOKEN_LENGTH,
  validateBatchRequest,
  validateDeviceRequest,
  validatePairConfirmRequest,
  validateSessionEndRequest,
  validateSessionRequest,
  validateScanRequest,
} from '../services/validation.js'
import { createRateLimiter } from '../services/rate-limit.js'

function invoke(middleware, { body, params, ip, socket } = {}) {
  const result = {
    nextCalled: false,
    headers: {},
    status: null,
    jsonBody: null,
  }
  const req = { body, params, ip, socket }
  const res = {
    setHeader(name, value) {
      result.headers[name] = value
      return this
    },
    status(code) {
      result.status = code
      return this
    },
    json(payload) {
      result.jsonBody = payload
      return this
    },
  }
  const next = () => {
    result.nextCalled = true
  }
  middleware(req, res, next)
  return result
}

describe('white-box validation branch coverage', () => {
  it('validateScanRequest rejects payloads above the byte limit before field validation', () => {
    const outcome = invoke(validateScanRequest, {
      body: {
        treeId: 'MG-01-123456',
        scannedAt: '2026-01-02T03:04:05.000Z',
        assessment: 'low',
        imageBase64: 'x'.repeat(MAX_SCAN_PAYLOAD_BYTES),
      },
    })

    assert.equal(outcome.nextCalled, false)
    assert.equal(outcome.status, 413)
    assert.equal(outcome.jsonBody.code, 'PAYLOAD_TOO_LARGE')
  })

  it('validateBatchRequest rejects oversized JSON before walking scans', () => {
    const outcome = invoke(validateBatchRequest, {
      body: {
        scans: [
          {
            treeId: 'MG-01-123456',
            scannedAt: '2026-01-02T03:04:05.000Z',
            assessment: 'low',
            imageBase64: 'x'.repeat(MAX_BATCH_PAYLOAD_BYTES),
          },
        ],
      },
    })

    assert.equal(outcome.nextCalled, false)
    assert.equal(outcome.status, 413)
    assert.equal(outcome.jsonBody.code, 'PAYLOAD_TOO_LARGE')
  })

  it('device/session/pair validators accept snake_case aliases used by the app', () => {
    assert.equal(
      invoke(validateDeviceRequest, {
        body: { device_id: 'device-1', device_name: 'Field Tablet' },
      }).nextCalled,
      true
    )
    assert.equal(
      invoke(validateSessionRequest, {
        body: { session_id: 'session-1', device_id: 'device-1' },
      }).nextCalled,
      true
    )
    assert.equal(
      invoke(validatePairConfirmRequest, {
        body: {
          token: 'pair-token',
          device_id: 'device-1',
          device_name: 'Field Tablet',
        },
      }).nextCalled,
      true
    )
  })

  it('device/session/pair validators enforce internal length caps', () => {
    const tooLongDeviceId = 'd'.repeat(MAX_DEVICE_ID_LENGTH + 1)
    const tooLongDeviceName = 'n'.repeat(MAX_DEVICE_NAME_LENGTH + 1)
    const tooLongSessionId = 's'.repeat(MAX_SESSION_ID_LENGTH + 1)
    const tooLongToken = 't'.repeat(MAX_TOKEN_LENGTH + 1)

    assert.equal(
      invoke(validateDeviceRequest, {
        body: { deviceId: tooLongDeviceId, deviceName: 'ok' },
      }).status,
      400
    )
    assert.equal(
      invoke(validateDeviceRequest, {
        body: { deviceId: 'device-1', deviceName: tooLongDeviceName },
      }).status,
      400
    )
    assert.equal(
      invoke(validateSessionRequest, {
        body: { sessionId: tooLongSessionId, deviceId: 'device-1' },
      }).status,
      400
    )
    assert.equal(
      invoke(validatePairConfirmRequest, {
        body: { token: tooLongToken, deviceId: 'device-1' },
      }).status,
      400
    )
  })

  it('validateSessionEndRequest reads the route param rather than the body', () => {
    assert.equal(
      invoke(validateSessionEndRequest, {
        params: { sessionId: 'session-1' },
        body: { sessionId: '' },
      }).nextCalled,
      true
    )

    const rejected = invoke(validateSessionEndRequest, {
      params: { sessionId: ' '.repeat(MAX_SESSION_ID_LENGTH + 1) },
    })
    assert.equal(rejected.status, 400)
    assert.equal(rejected.nextCalled, false)
  })
})

describe('white-box rate limiter branch coverage', () => {
  it('keys hits by ip and emits Retry-After after max hits', () => {
    mock.method(Date, 'now', () => 1_000)
    const limiter = createRateLimiter({ windowMs: 1_000, max: 2 })

    assert.equal(invoke(limiter, { ip: '10.0.0.1' }).nextCalled, true)
    assert.equal(invoke(limiter, { ip: '10.0.0.1' }).nextCalled, true)

    const limited = invoke(limiter, { ip: '10.0.0.1' })
    assert.equal(limited.status, 429)
    assert.equal(limited.headers['Retry-After'], '1')
    assert.equal(limited.jsonBody.code, 'RATE_LIMITED')

    assert.equal(invoke(limiter, { ip: '10.0.0.2' }).nextCalled, true)
  })

  it('falls back to socket remoteAddress and allows requests after the window', () => {
    let now = 1_000
    mock.method(Date, 'now', () => now)
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 })
    const req = { socket: { remoteAddress: '192.0.2.10' } }

    assert.equal(invoke(limiter, req).nextCalled, true)
    assert.equal(invoke(limiter, req).status, 429)

    now = 2_001
    assert.equal(invoke(limiter, req).nextCalled, true)
  })

  it('clear resets limiter state for the same key', () => {
    mock.method(Date, 'now', () => 1_000)
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 })

    assert.equal(invoke(limiter, { ip: '10.0.0.1' }).nextCalled, true)
    assert.equal(invoke(limiter, { ip: '10.0.0.1' }).status, 429)

    limiter.clear()
    assert.equal(invoke(limiter, { ip: '10.0.0.1' }).nextCalled, true)
  })
})
