export const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December']
export const fallbackLogs = [
  { treeId: 'MG-0241', scannedAt: '2026-09-01T08:00:00.000Z', assessment: 'high', sessionId: 's1', deviceId: 'd1', serverReceived: '2026-09-01T08:00:05.000Z' },
  { treeId: 'MG-0187', scannedAt: '2026-08-31T08:00:00.000Z', assessment: 'moderate', sessionId: 's1', deviceId: 'd1', serverReceived: '2026-08-31T08:00:05.000Z' },
  { treeId: 'MG-0326', scannedAt: '2026-08-30T08:00:00.000Z', assessment: 'low', sessionId: 's2', deviceId: 'd2', serverReceived: '2026-08-30T08:00:05.000Z' },
]

export function formatLogDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Unknown date'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

export function formatLogTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Unknown time'
    : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

export function getDayKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000
}
