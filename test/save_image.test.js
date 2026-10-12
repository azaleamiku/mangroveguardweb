import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { initDb } from '../db/migrate.js'
import { saveScanImage } from '../services/scans.js'
import { makeTempDir } from './helpers.js'
import { MAX_IMAGE_BASE64_BYTES } from '../services/validation.js'

describe('saveScanImage', () => {
  let dataDirectory
  beforeEach(async () => {
    const db = new Database(':memory:')
    initDb(db)
    dataDirectory = await makeTempDir()
  })

  it('returns an empty string when no image is supplied', async () => {
    assert.equal(await saveScanImage(dataDirectory, 'scan-1', ''), '')
    assert.equal(await saveScanImage(dataDirectory, 'scan-1', null), '')
    assert.equal(await saveScanImage(dataDirectory, 'scan-1', undefined), '')
  })

  it('writes the decoded bytes and returns the public image path', async () => {
    const raw = Buffer.from('jpeg-bytes-here', 'utf8')
    const result = await saveScanImage(dataDirectory, 'scan-1', raw.toString('base64'))
    assert.equal(result, '/scan-images/scan-1.jpg')
    const saved = await readFile(path.join(dataDirectory, 'scan-images', 'scan-1.jpg'))
    assert.deepEqual(saved, raw)
  })

  it('strips a data URL prefix before decoding', async () => {
    const raw = Buffer.from('png-bytes', 'utf8')
    const dataUrl = 'data:image/png;base64,' + raw.toString('base64')
    const result = await saveScanImage(dataDirectory, 'scan-2', dataUrl)
    assert.equal(result, '/scan-images/scan-2.jpg')
    const saved = await readFile(path.join(dataDirectory, 'scan-images', 'scan-2.jpg'))
    assert.deepEqual(saved, raw)
  })

  it('returns an empty string for payloads that decode to zero bytes', async () => {
    assert.equal(await saveScanImage(dataDirectory, 'scan-3', '~~~~'), '')
  })

  it('returns an empty string for images above the decoded byte cap', async () => {
    const oversized = Buffer.alloc(MAX_IMAGE_BASE64_BYTES + 1).toString('base64')
    assert.equal(await saveScanImage(dataDirectory, 'scan-4', oversized), '')
    const listed = await readFile(path.join(dataDirectory, 'scan-images', 'scan-4.jpg'), 'utf8').then(() => true, () => false)
    assert.equal(listed, false)
  })

  it('writes the image even when the scan-images directory does not exist yet', async () => {
    const result = await saveScanImage(dataDirectory, 'scan-5', Buffer.from('x').toString('base64'))
    assert.equal(result, '/scan-images/scan-5.jpg')
  })
})
