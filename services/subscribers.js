export const logSubscribers = new Set()
export const deviceSubscribers = new Set()
export const sessionSubscribers = new Set()

function writeWithCleanup(response, data, subscribers) {
  try {
    response.write(data)
  } catch (error) {
    subscribers.delete(response)
    try { response.end() } catch (_) {}
  }
}

export function notifyLogSubscribers() {
  for (const response of logSubscribers) {
    writeWithCleanup(response, 'event: scans-updated\ndata: updated\n\n', logSubscribers)
  }
}

export function notifyDeviceSubscribers() {
  for (const response of deviceSubscribers) {
    writeWithCleanup(response, 'event: devices-updated\ndata: updated\n\n', deviceSubscribers)
  }
}

export function notifySessionSubscribers() {
  for (const response of sessionSubscribers) {
    writeWithCleanup(response, 'event: sessions-updated\ndata: updated\n\n', sessionSubscribers)
  }
}
