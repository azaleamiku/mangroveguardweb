import { useEffect, useState } from 'react'
import { formatDateTime } from '../utils.js'

export default function DeletionLogPage({ history: initialHistory }) {
  const [history, setHistory] = useState(initialHistory)

  useEffect(() => {
    setHistory(initialHistory)
  }, [initialHistory])

  return (
    <section className="deletion-log-page">
      <div className="calendar-page-header">
        <div>
          <p className="label">DELETION LOG</p>
          <h2>Deleted Scans</h2>
          <p>Record of removed scan data with timestamps and actor.</p>
        </div>
      </div>
      <div className="deletion-table-wrapper">
        <table className="data-table deletion-table">
          <thead>
            <tr>
              <th>History ID</th>
              <th>Scan ID</th>
              <th>Deleted At</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan="4" className="empty-state">No deletions recorded yet.</td></tr>
            ) : (
              history.map((item) => (
                <tr key={item.historyId}>
                  <td><b>{item.historyId}</b></td>
                  <td>{item.scanId}</td>
                  <td>{formatDateTime(item.deletedAt)}</td>
                  <td>{item.deletedBy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
