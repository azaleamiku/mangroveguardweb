export const logSubscribers = new Set()
export const deviceSubscribers = new Set()
export const sessionSubscribers = new Set()

export function notifyLogSubscribers() {
  for (const response of logSubscribers) {
    response.write('event: scans-updated\ndata: updated\n\n')
  }
}

export function notifyDeviceSubscribers() {
  for (const response of deviceSubscribers) {
    response.write('event: devices-updated\ndata: updated\n\n')
  }
}

export function notifySessionSubscribers() {
  for (const response of sessionSubscribers) {
    response.write('event: sessions-updated\ndata: updated\n\n')
  }
}
