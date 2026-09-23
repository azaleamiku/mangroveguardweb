import { useMemo, useEffect, useState } from 'react'
import { formatDateTime } from '../utils.js'

export default function SessionsPage({ sessions: initialSessions, logs }) {
  const [sessions, setSessions] = useState(initialSessions)

  useEffect(() => {
    setSessions(initialSessions)
  }, [initialSessions])

  const sessionsWithCounts = useMemo(() => {
    const counts = new Map()
    logs.forEach((scan) => {
      if (scan.sessionId) {
        counts.set(scan.sessionId, (counts.get(scan.sessionId) || 0) + 1)
      }
    })
    return sessions.map((session) => ({
      ...session,
      scanCount: counts.get(session.sessionId) || 0,
    }))
  }, [sessions, logs])

  return (
    <section className="sessions-page">
      <div className="calendar-page-header">
        <div>
          <p className="label">SESSION LOG</p>
          <h2>Sessions</h2>
          <p>Field session groupings with scan counts and device association.</p>
        </div>
      </div>
      <div className="sessions-table-wrapper">
        <table className="data-table sessions-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Device</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Scans</th>
            </tr>
          </thead>
          <tbody>
            {sessionsWithCounts.length === 0 ? (
              <tr><td colSpan="5" className="empty-state">No sessions recorded yet.</td></tr>
            ) : (
              sessionsWithCounts.map((session) => (
                <tr key={session.sessionId}>
                  <td><b>{session.sessionId}</b></td>
                  <td>{session.deviceId}</td>
                  <td>{formatDateTime(session.startedAt)}</td>
                  <td>{session.endedAt ? formatDateTime(session.endedAt) : '—'}</td>
                  <td>{session.scanCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
