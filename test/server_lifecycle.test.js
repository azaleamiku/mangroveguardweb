import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import { delay } from './helpers.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function startServer(port, dataDirectory) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIRECTORY: dataDirectory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  return { child, stdout: () => stdout, stderr: () => stderr }
}

function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/api/health', headers: { Connection: 'close' } },
      (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          let body
          try { body = JSON.parse(raw) } catch (_) {}
          resolve({ status: res.statusCode, body })
        })
      }
    )
    req.on('error', () => resolve(null))
  })
}

async function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const check = await healthCheck(port)
    if (check && check.status === 200) return check
    await delay(150)
  }
  throw new Error(`server on port ${port} never became healthy`)
}

function waitForExit(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not exit in time')), timeoutMs)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

describe('server lifecycle', () => {
  it('boots, serves health, and shuts down gracefully on SIGTERM', async () => {
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'mangrove-server-'))
    const { child, stdout } = startServer(18123, dataDirectory)
    try {
      const health = await waitForHealth(18123)
      assert.deepEqual(health.body, { status: 'ok', db: true })

      const dbFile = path.join(dataDirectory, 'mangrove.db')
      const info = await stat(dbFile)
      assert.ok(info.size > 0)

      child.kill('SIGTERM')
      const exit = await waitForExit(child)
      assert.equal(exit.code, 0)

      const output = stdout()
      assert.ok(output.includes('Listening'))
      assert.ok(output.includes('Received signal, starting graceful shutdown'))
      assert.ok(output.includes('HTTP server closed'))
      assert.ok(output.includes('Database closed'))
    } finally {
      child.kill('SIGKILL')
      await rm(dataDirectory, { recursive: true, force: true })
    }
  })

  it('shuts down gracefully on SIGINT', async () => {
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'mangrove-server-'))
    const { child } = startServer(18124, dataDirectory)
    try {
      await waitForHealth(18124)
      child.kill('SIGINT')
      const exit = await waitForExit(child)
      assert.equal(exit.code, 0)
    } finally {
      child.kill('SIGKILL')
      await rm(dataDirectory, { recursive: true, force: true })
    }
  })

  it('seeds the database on first boot', async () => {
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'mangrove-server-'))
    const { child } = startServer(18125, dataDirectory)
    try {
      await waitForHealth(18125)
      const check = await healthCheck(18125)
      assert.equal(check.status, 200)
      const dbFile = path.join(dataDirectory, 'mangrove.db')
      const info = await stat(dbFile)
      assert.ok(info.size > 0)
    } finally {
      child.kill('SIGTERM')
      await waitForExit(child).catch(() => {})
      await rm(dataDirectory, { recursive: true, force: true })
    }
  })
})
