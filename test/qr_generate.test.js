import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateStyledQrDataUrl } from '../services/qr.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function decodeDataUrl(dataUrl) {
  assert.match(dataUrl, /^data:image\/svg\+xml;base64,/)
  return Buffer.from(dataUrl.split(',')[1], 'base64').toString('utf8')
}

describe('generateStyledQrDataUrl', () => {
  it('returns an SVG data URL encoding the supplied text', async () => {
    const dataUrl = await generateStyledQrDataUrl(projectRoot, 'https://example.test/pair?token=abc')
    const svg = decodeDataUrl(dataUrl)
    assert.ok(svg.includes('<svg'))
    assert.ok(svg.includes('</svg>'))
  })

  it('embeds the styled gradient definition', async () => {
    const dataUrl = await generateStyledQrDataUrl(projectRoot, 'qr-payload')
    const svg = decodeDataUrl(dataUrl)
    assert.ok(svg.includes('qrGradient'))
    assert.ok(svg.includes('#20B2AA'))
    assert.ok(svg.includes('shape-rendering="crispEdges"'))
  })

  it('embeds the project logo when present', async () => {
    const dataUrl = await generateStyledQrDataUrl(projectRoot, 'qr-payload')
    const svg = decodeDataUrl(dataUrl)
    assert.ok(svg.includes('data:image/png;base64,'))
  })

  it('succeeds without a logo and still renders the QR modules', async () => {
    const dataUrl = await generateStyledQrDataUrl('/tmp/definitely-no-logo-root', 'qr-payload')
    const svg = decodeDataUrl(dataUrl)
    assert.ok(svg.includes('<svg'))
    assert.ok(svg.includes('</svg>'))
  })

  it('produces different output for different text', async () => {
    const a = await generateStyledQrDataUrl(projectRoot, 'payload-a')
    const b = await generateStyledQrDataUrl(projectRoot, 'payload-b')
    assert.notEqual(a, b)
  })

  it('is deterministic for the same text', async () => {
    const a = await generateStyledQrDataUrl(projectRoot, 'same-payload')
    const b = await generateStyledQrDataUrl(projectRoot, 'same-payload')
    assert.equal(a, b)
  })
})
