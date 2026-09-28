export function createLogger(service) {
  const prefix = service ? `[${service}]` : ''
  return {
    info(message, meta = {}) {
      console.log(`${prefix} ${message}`, JSON.stringify(meta))
    },
    error(message, meta = {}) {
      console.error(`${prefix} ${message}`, JSON.stringify(meta))
    },
    warn(message, meta = {}) {
      console.warn(`${prefix} ${message}`, JSON.stringify(meta))
    },
    debug(message, meta = {}) {
      if (process.env.DEBUG) {
        console.debug(`${prefix} ${message}`, JSON.stringify(meta))
      }
    },
  }
}
