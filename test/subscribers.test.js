import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  logSubscribers,
  deviceSubscribers,
  sessionSubscribers,
  notifyLogSubscribers,
  notifyDeviceSubscribers,
  notifySessionSubscribers,
} from '../services/subscribers.js'

function fakeResponse() {
  return {
    written: [],
    ended: false,
    write(data) { this.written.push(data) },
    end() { this.ended = true },
  }
}

function failingResponse() {
  const response = fakeResponse()
  response.write = () => { throw new Error('socket closed') }
  return response
}

describe('SSE subscriber registry', () => {
  beforeEach(() => {
    logSubscribers.clear()
    deviceSubscribers.clear()
    sessionSubscribers.clear()
  })

  it('notifyLogSubscribers broadcasts the scans-updated event', () => {
    const a = fakeResponse()
    const b = fakeResponse()
    logSubscribers.add(a)
    logSubscribers.add(b)
    notifyLogSubscribers()
    assert.deepEqual(a.written, ['event: scans-updated\ndata: updated\n\n'])
    assert.deepEqual(b.written, ['event: scans-updated\ndata: updated\n\n'])
  })

  it('notifyDeviceSubscribers broadcasts the devices-updated event', () => {
    const response = fakeResponse()
    deviceSubscribers.add(response)
    notifyDeviceSubscribers()
    assert.deepEqual(response.written, ['event: devices-updated\ndata: updated\n\n'])
  })

  it('notifySessionSubscribers broadcasts the sessions-updated event', () => {
    const response = fakeResponse()
    sessionSubscribers.add(response)
    notifySessionSubscribers()
    assert.deepEqual(response.written, ['event: sessions-updated\ndata: updated\n\n'])
  })

  it('evicts a subscriber whose write throws and closes it', () => {
    const healthy = fakeResponse()
    const broken = failingResponse()
    logSubscribers.add(healthy)
    logSubscribers.add(broken)

    notifyLogSubscribers()

    assert.equal(logSubscribers.has(broken), false)
    assert.equal(broken.ended, true)
    assert.equal(logSubscribers.has(healthy), true)
    assert.equal(healthy.written.length, 1)
  })

  it('evicts failing device and session subscribers too', () => {
    const brokenDevice = failingResponse()
    deviceSubscribers.add(brokenDevice)
    notifyDeviceSubscribers()
    assert.equal(deviceSubscribers.has(brokenDevice), false)
    assert.equal(brokenDevice.ended, true)

    const brokenSession = failingResponse()
    sessionSubscribers.add(brokenSession)
    notifySessionSubscribers()
    assert.equal(sessionSubscribers.has(brokenSession), false)
    assert.equal(brokenSession.ended, true)
  })

  it('notifies zero subscribers without throwing', () => {
    assert.doesNotThrow(() => {
      notifyLogSubscribers()
      notifyDeviceSubscribers()
      notifySessionSubscribers()
    })
  })
})
