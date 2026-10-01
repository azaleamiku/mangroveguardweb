import { useMemo, useEffect, useState } from 'react'
import { formatLogDate, formatLogTime, formatDateTime } from '../utils.js'
import Icon from '../components/Icon.jsx'

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
  const [sortColumn, setSortColumn] = useState('scannedAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [statusFilter, setStatusFilter] = useState(null)
  const [modalScanId, setModalScanId] = useState(null)
  const [isZoomed, setIsZoomed] = useState(false)

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

  const modalScan = useMemo(() => {
    if (modalScanId === null) return null
    return processedLogs.find((scan, index) => (scan.id || `${scan.treeId}-${scan.scannedAt}-${index}`) === modalScanId) || null
  }, [processedLogs, modalScanId])

  const modalIndex = useMemo(() => {
    if (modalScan === null) return -1
    return processedLogs.findIndex((scan, index) => (scan.id || `${scan.treeId}-${scan.scannedAt}-${index}`) === modalScanId)
  }, [processedLogs, modalScan, modalScanId])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (modalScan === null) return
      if (e.key === 'Escape') {
        setModalScanId(null)
        setIsZoomed(false)
      } else if (e.key === 'ArrowLeft' && modalIndex > 0) {
        const prev = processedLogs[modalIndex - 1]
        setModalScanId(prev.id || `${prev.treeId}-${prev.scannedAt}-${modalIndex - 1}`)
        setIsZoomed(false)
      } else if (e.key === 'ArrowRight' && modalIndex < processedLogs.length - 1) {
        const next = processedLogs[modalIndex + 1]
        setModalScanId(next.id || `${next.treeId}-${next.scannedAt}-${modalIndex + 1}`)
        setIsZoomed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modalScan, modalIndex, processedLogs])

  useEffect(() => {
    if (modalScan !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [modalScan])

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

  const selectedLabel = modalScan
    ? `${modalScan.assessment[0].toUpperCase()}${modalScan.assessment.slice(1)}`
    : ''
  const imageSource = modalScan?.imageUrl || (modalScan?.imageBase64
    ? `data:image/jpeg;base64,${modalScan.imageBase64}`
    : '')
  const scanGuidance = modalScan ? {
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
  }[modalScan.assessment] : null

  return <section className="logs-page">
    <div className="calendar-page-header">
      <div>
        <p className="label">FIELD DATA</p>
        <h2>Observation Logs</h2>
        <p>Every mangrove assessment recorded in the field.</p>
      </div>
      <span className="sync-status">{logsConnected ? 'LIVE' : 'LOCAL DATA'}</span>
    </div>
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
          {processedLogs.map((scan, index) => {
            const { id, treeId, scannedAt, assessment, sessionId } = scan
            const label = `${assessment[0].toUpperCase()}${assessment.slice(1)}`
            const rowId = id || `${treeId}-${scannedAt}-${index}`
            const isSelected = rowId === modalScanId
            return (
              <tr
                key={rowId}
                onClick={() => {
                  const scan = processedLogs[index]
                  const rowId = scan.id || `${scan.treeId}-${scan.scannedAt}-${index}`
                  setModalScanId(rowId)
                  setIsZoomed(false)
                }}
                role="button"
                tabIndex={0}
                className={isSelected ? 'selected-row' : ''}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    const scan = processedLogs[index]
                    const rowId = scan.id || `${scan.treeId}-${scan.scannedAt}-${index}`
                    setModalScanId(rowId)
                    setIsZoomed(false)
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
              <td colSpan="4" className="empty-state">
                <div className="empty-state-inner">
                  <Icon name="logs" />
                  <span>No scans yet. Pair a device to start collecting data.</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
      {modalScan && (
        <div className="scan-modal-overlay" onClick={() => { setModalScanId(null); setIsZoomed(false) }}>
          <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-counter">{modalIndex + 1} / {processedLogs.length}</div>
              <button type="button" className="modal-close" onClick={() => { setModalScanId(null); setIsZoomed(false) }} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div className={`modal-image-container ${isZoomed ? 'zoomed' : ''}`} onClick={() => setIsZoomed(!isZoomed)}>
                {imageSource ? (
                  <img src={imageSource} alt={`${modalScan.treeId} scan`} className="modal-scan-image" />
                ) : (
                  <div className="scan-photo-empty">No image received</div>
                )}
              </div>
              <div className="modal-details">
                <div className="modal-details-inner">
                  <div className="scan-detail-heading">
                    <div>
                      <p className="label">SELECTED SCAN</p>
                      <h3>{modalScan.treeId}</h3>
                    </div>
                    <span className={`assessment ${modalScan.assessment === 'low' ? 'assessment-low' : modalScan.assessment}`}>{selectedLabel}</span>
                  </div>
                  <dl>
                    <div><dt>Date</dt><dd>{formatLogDate(modalScan.scannedAt)}</dd></div>
                    <div><dt>Time</dt><dd>{formatLogTime(modalScan.scannedAt)}</dd></div>
                    <div><dt>Session ID</dt><dd>{modalScan.sessionId || '—'}</dd></div>
                    <div><dt>Server Received</dt><dd>{formatDateTime(modalScan.serverReceived)}</dd></div>
                  </dl>
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
              </div>
            </div>
            <div className="modal-footer">
              {modalIndex > 0 && (
                <button type="button" className="modal-nav modal-prev" onClick={() => {
                  const prev = processedLogs[modalIndex - 1]
                  setModalScanId(prev.id || `${prev.treeId}-${prev.scannedAt}-${modalIndex - 1}`)
                  setIsZoomed(false)
                }} aria-label="Previous">← Previous</button>
              )}
              {modalIndex < processedLogs.length - 1 && (
                <button type="button" className="modal-nav modal-next" onClick={() => {
                  const next = processedLogs[modalIndex + 1]
                  setModalScanId(next.id || `${next.treeId}-${next.scannedAt}-${modalIndex + 1}`)
                  setIsZoomed(false)
                }} aria-label="Next">Next →</button>
              )}
            </div>
          </div>
        </div>
      )}
  </section>
}
