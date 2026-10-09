import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  validateScanPayload,
  validateBatchPayload,
  MAX_BATCH_SCANS,
  MAX_IMAGE_BASE64_BYTES,
} from '../services/validation.js'

/** Minimal req/res/next harness for middleware-style validators. */
function invoke(middleware, body) {
  const req = { body }
  const result = { nextCalled: false, status: null, jsonBody: null }
  const res = {
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

describe('validateScanPayload', () => {
  it('accepts a camelCase payload', () => {
    const result = validateScanPayload({
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'high',
    })
    assert.equal(result.valid, true)
    assert.deepEqual(result.errors, [])
  })

  it('accepts snake_case aliases (app wire format)', () => {
    const result = validateScanPayload({
      tree_id: 'MG-01-123456',
      scanned_at: '2026-01-02T03:04:05.000Z',
      predicted_assessment: 'moderate',
    })
    assert.equal(result.valid, true)
  })

  it('rejects missing/invalid treeId', () => {
    const result = validateScanPayload({
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'high',
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('treeId')))
  })

  it('rejects unparseable scannedAt', () => {
    const result = validateScanPayload({
      treeId: 'MG-01-123456',
      scannedAt: 'not-a-date',
      assessment: 'high',
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('scannedAt')))
  })

  it('rejects assessment outside the allowed set', () => {
    const result = validateScanPayload({
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'critical',
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('assessment')))
  })

  it('is case-insensitive on assessment', () => {
    const result = validateScanPayload({
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'HIGH',
    })
    assert.equal(result.valid, true)
  })

  it('rejects oversized imageBase64 (decoded byte cap)', () => {
    // A base64 string whose *decoded* bytes exceed the 8 MB cap must be rejected,
    // even though its string length is well under the old length-based limit.
    const oversized = Buffer.alloc(MAX_IMAGE_BASE64_BYTES + 1).toString('base64')
    const result = validateScanPayload({
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'low',
      imageBase64: oversized,
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('imageBase64')))
  })

  it('accepts an 8 MB base64 string (decodes to ~6 MB)', () => {
    // Base64 inflates data by ~33%; an 8 MB string decodes to ~6 MB and must pass.
    const result = validateScanPayload({
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'low',
      imageBase64: Buffer.alloc(MAX_IMAGE_BASE64_BYTES).toString('base64'),
    })
    assert.equal(result.valid, true)
  })
})

describe('validateBatchPayload', () => {
  const goodScan = {
    treeId: 'MG-01-123456',
    scannedAt: '2026-01-02T03:04:05.000Z',
    assessment: 'low',
  }

  it('rejects non-object payloads', () => {
    assert.equal(validateBatchPayload(null).valid, false)
    assert.equal(validateBatchPayload('str').valid, false)
  })

  it('rejects missing/empty scans array', () => {
    assert.equal(validateBatchPayload({}).valid, false)
    assert.equal(validateBatchPayload({ scans: [] }).valid, false)
  })

  it('accepts a well-formed batch', () => {
    const result = validateBatchPayload({ scans: [goodScan, goodScan] })
    assert.equal(result.valid, true)
  })

  it('rejects batches over the size cap', () => {
    const scans = Array.from({ length: MAX_BATCH_SCANS + 1 }, () => goodScan)
    const result = validateBatchPayload({ scans })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes(String(MAX_BATCH_SCANS))))
  })

  it('indexes the offending entry in the error message', () => {
    const result = validateBatchPayload({
      scans: [goodScan, { ...goodScan, assessment: 'bogus' }],
    })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.includes('scans[1]')))
  })
})

describe('middleware wrappers (status codes)', () => {
  it('validateScanRequest passes valid payloads to next()', async () => {
    const { validateScanRequest } = await import('../services/validation.js')
    const outcome = invoke(validateScanRequest, {
      treeId: 'MG-01-123456',
      scannedAt: '2026-01-02T03:04:05.000Z',
      assessment: 'high',
    })
    assert.equal(outcome.nextCalled, true)
    assert.equal(outcome.status, null)
  })

  it('validateScanRequest returns 400 on invalid payload', async () => {
    const { validateScanRequest } = await import('../services/validation.js')
    const outcome = invoke(validateScanRequest, { treeId: 'bad' })
    assert.equal(outcome.nextCalled, false)
    assert.equal(outcome.status, 400)
    assert.equal(outcome.jsonBody.code, 'VALIDATION_ERROR')
  })

  it('validateBatchRequest returns 400 when scans missing', async () => {
    const { validateBatchRequest } = await import('../services/validation.js')
    const outcome = invoke(validateBatchRequest, {})
    assert.equal(outcome.nextCalled, false)
    assert.equal(outcome.status, 400)
  })

  it('validateBatchRequest passes a valid batch', async () => {
    const { validateBatchRequest } = await import('../services/validation.js')
    const outcome = invoke(validateBatchRequest, {
      scans: [
        {
          treeId: 'MG-01-123456',
          scannedAt: '2026-01-02T03:04:05.000Z',
          assessment: 'low',
        },
      ],
    })
    assert.equal(outcome.nextCalled, true)
  })
})
