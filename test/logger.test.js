import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { mock } from 'node:test'
import { createLogger } from '../services/logger.js'

describe('createLogger', () => {
  let logs
  let errors
  let warnings
  let debugs
  let logMock
  let errorMock
  let warnMock
  let debugMock

  beforeEach(() => {
    logs = []
    errors = []
    warnings = []
    debugs = []
    logMock = mock.method(console, 'log', (...args) => { logs.push(args) })
    errorMock = mock.method(console, 'error', (...args) => { errors.push(args) })
    warnMock = mock.method(console, 'warn', (...args) => { warnings.push(args) })
    debugMock = mock.method(console, 'debug', (...args) => { debugs.push(args) })
  })

  afterEach(() => {
    logMock.mock.restore()
    errorMock.mock.restore()
    warnMock.mock.restore()
    debugMock.mock.restore()
    delete process.env.DEBUG
  })

  it('prefixes the service name and JSON-encodes metadata', () => {
    const logger = createLogger('tests')
    logger.info('hello', { a: 1 })
    assert.deepEqual(logs[0], ['[tests] hello', '{"a":1}'])
  })

  it('routes error and warn to their console methods', () => {
    const logger = createLogger('svc')
    logger.error('boom', { code: 500 })
    logger.warn('careful')
    assert.deepEqual(errors[0], ['[svc] boom', '{"code":500}'])
    assert.deepEqual(warnings[0], ['[svc] careful', '{}'])
  })

  it('omits the prefix when no service name is given', () => {
    const logger = createLogger(null)
    logger.info('no-prefix')
    assert.deepEqual(logs[0], [' no-prefix', '{}'])
  })

  it('silences debug output unless DEBUG is set', () => {
    delete process.env.DEBUG
    const logger = createLogger('svc')
    logger.debug('hidden')
    assert.equal(debugs.length, 0)

    process.env.DEBUG = '1'
    logger.debug('visible', { k: 'v' })
    assert.deepEqual(debugs[0], ['[svc] visible', '{"k":"v"}'])
  })
})
