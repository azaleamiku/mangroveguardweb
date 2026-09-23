import { useMemo, useEffect, useState } from 'react'
import { formatLogDate, formatLogTime, formatDateTime } from '../utils.js'

function SortIcon({ column, sortColumn, sortDirection, statusFilter }) {
  const isActive = sortColumn === column || (column === 'assessment' && statusFilter)

  if (!isActive || sortDirection === null) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, opacity: isActive ? 1 : 0.6 }}>
        <path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" />
      </svg>
    )
  }

  return sortDirection === 'asc' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function LogsPage({ logs, logsConnected }) {
  const [selectedScanId, setSelectedScanId] = useState(null)
  const [sortColumn, setSortColumn] = useState('scannedAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [statusFilter, setStatusFilter] = useState(null)

  const selectedScan = useMemo(
    () => logs.find((scan, index) => (scan.id || `${scan.treeId}-${scan.scannedAt}-${index}`) === selectedScanId) || logs[0] || null,
    [logs, selectedScanId],
  )

  useEffect(() => {
    if (logs.length === 0) {
      setSelectedScanId(null)
      return
    }
    const hasSelectedScan = logs.some((scan, index) => (scan.id || `${scan.treeId}-${scan.scannedAt}-${index}`) === selectedScanId)
    if (!hasSelectedScan) setSelectedScanId(logs[0].id || `${logs[0].treeId}-${logs[0].scannedAt}-0`)
  }, [logs, selectedScanId])

  const processedLogs = useMemo(() => {
    let result = [...logs]

    if (statusFilter) {
      result = result.filter((log) => String(log.assessment || log.status).toLowerCase() === statusFilter)
      result.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      return result
    }

    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        let aValue = a[sortColumn]
        let bValue = b[sortColumn]
        if (sortColumn === 'scannedAt') {
          aValue = new Date(aValue).getTime()
          bValue = new Date(bValue).getTime()
        } else if (sortColumn === 'treeId') {
          aValue = aValue.toLowerCase()
          bValue = bValue.toLowerCase()
        }
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [logs, statusFilter, sortColumn, sortDirection])

  const handleSort = (column) => {
    if (column === 'assessment') {
      setStatusFilter((prev) => {
        if (prev === null) return 'high'
        if (prev === 'high') return 'moderate'
        if (prev === 'moderate') return 'low'
        return null
      })
      return
    }

    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else if (sortDirection === 'desc') setSortDirection(null)
      else setSortDirection('asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const selectedLabel = selectedScan
    ? `${selectedScan.assessment[0].toUpperCase()}${selectedScan.assessment.slice(1)}`
    : ''
  const imageSource = selectedScan?.imageUrl || (selectedScan?.imageBase64
    ? `data:image/jpeg;base64,${selectedScan.imageBase64}`
    : '')
  const scanGuidance = selectedScan ? {
    high: {
      summary: 'This mangrove shows High Stability. It can act as a strong coastal defense line, with a root structure that helps absorb wave energy and resist strong winds.',
      recommendations: ['Prioritize this area for conservation or core protection.', 'Use it as a baseline site for monitoring less stable areas.', 'Allow only carefully managed education or research access.'],
    },
    moderate: {
      summary: 'This mangrove shows Moderate Stability. It offers useful protection, but may need surrounding support to stay resilient during typhoons and strong storm conditions.',
      recommendations: ['Clear debris trapped in the roots to prevent abrasions and rot.', 'Plant saplings in nearby gaps to improve stand density.', 'Inspect after storms and address erosion with temporary wave barriers if needed.'],
    },
    low: {
      summary: 'This mangrove has Low Stability. It provides limited protection and may be vulnerable to uprooting, especially where roots are weak, exposed, or under environmental stress.',
      recommendations: ['Restrict entry to prevent trampling and illegal harvesting.', 'Address nearby runoff, sewage, plastic debris, or water quality issues.', 'Consider reinforcement or relocation if the tree is in a high-risk zone.'],
    },
  }[selectedScan.assessment] : null

  return <section className="logs-page">
    <div className="calendar-page-header">
      <div>
        <p className="label">FIELD DATA</p>
        <h2>Observation Logs</h2>
        <p>Every mangrove assessment recorded in the field.</p>
      </div>
      <span className="sync-status">{logsConnected ? 'LIVE' : 'LOCAL DATA'}</span>
    </div>
    <div className="logs-detail-layout">
      <div className="logs-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="sortable-header" onClick={() => handleSort('treeId')}>
                  <span>Tree ID</span>
                  <SortIcon column="treeId" sortColumn={sortColumn} sortDirection={sortDirection} />
                </button>
              </th>
              <th>
                <button type="button" className="sortable-header" onClick={() => handleSort('scannedAt')}>
                  <span>Date</span>
                  <SortIcon column="scannedAt" sortColumn={sortColumn} sortDirection={sortDirection} />
                </button>
              </th>
              <th>
                <button type="button" className="sortable-header" onClick={() => handleSort('assessment')}>
                  <span>Mangrove Status</span>
                  <SortIcon column="assessment" sortColumn={sortColumn} sortDirection={sortDirection} statusFilter={statusFilter} />
                </button>
              </th>
              <th>
                <span className="sortable-header">Session ID</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {processedLogs.map(({ id, treeId, scannedAt, assessment, sessionId }, index) => {
              const label = `${assessment[0].toUpperCase()}${assessment.slice(1)}`
              const rowId = id || `${treeId}-${scannedAt}-${index}`
              return (
                <tr
                  key={rowId}
                  onClick={() => setSelectedScanId(rowId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedScanId(rowId)
                    }
                  }}
                >
                  <td><b>{treeId}</b></td>
                  <td><time>{formatLogDate(scannedAt)}</time></td>
                  <td><span className={`assessment ${assessment === 'low' ? 'assessment-low' : assessment}`}>{label}</span></td>
                  <td><span className="session-id">{sessionId || '—'}</span></td>
                </tr>
              )
            })}
            {processedLogs.length === 0 && (
              <tr>
                <td colSpan="4" className="empty-state">No field observations received yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedScan && (
        <div className="scan-detail-column">
          <article className="scan-detail-card">
            <div className="scan-photo-frame">
              {imageSource ? <img src={imageSource} alt={`${selectedScan.treeId} scan`} /> : <div className="scan-photo-empty">No image received</div>}
            </div>
            <div className="scan-detail-content">
              <div className="scan-detail-heading">
                <div>
                  <p className="label">SELECTED SCAN</p>
                  <h3>{selectedScan.treeId}</h3>
                </div>
                <span className={`assessment ${selectedScan.assessment === 'low' ? 'assessment-low' : selectedScan.assessment}`}>{selectedLabel}</span>
              </div>
              <dl>
                <div><dt>Date</dt><dd>{formatLogDate(selectedScan.scannedAt)}</dd></div>
                <div><dt>Time</dt><dd>{formatLogTime(selectedScan.scannedAt)}</dd></div>
                <div><dt>Session ID</dt><dd>{selectedScan.sessionId || '—'}</dd></div>
                <div><dt>Server Received</dt><dd>{formatDateTime(selectedScan.serverReceived)}</dd></div>
              </dl>
            </div>
          </article>
          {scanGuidance && (
            <>
              <article className="scan-info-card">
                <p className="label">STATUS SUMMARY</p>
                <p>{scanGuidance.summary}</p>
              </article>
              <article className="scan-info-card">
                <p className="label">RECOMMENDATIONS</p>
                <ul>{scanGuidance.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul>
              </article>
            </>
          )}
        </div>
      )}
    </div>
  </section>
}
