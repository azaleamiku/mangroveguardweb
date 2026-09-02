import { useEffect, useMemo, useRef, useState } from 'react'

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December']
const fallbackLogs = [
  { treeId: 'MG-0241', scannedAt: '2026-09-01T08:00:00.000Z', assessment: 'high' },
  { treeId: 'MG-0187', scannedAt: '2026-08-31T08:00:00.000Z', assessment: 'moderate' },
  { treeId: 'MG-0326', scannedAt: '2026-08-30T08:00:00.000Z', assessment: 'low' },
]

function formatLogDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Unknown date'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

function formatLogTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? 'Unknown time'
    : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function getDayKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function Icon({ name }) {
  const shapes = {
    home: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Zm6 11v-6h6v6"/>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/></>,
    flag: <><path d="M5 21V4"/><path d="M5 5c4-2 7 2 12 0v9c-5 2-8-2-12 0"/></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>
}

function SortIcon({ column, sortColumn, sortDirection }) {
  if (sortColumn !== column) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, opacity: 0.6 }}>
        <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
      </svg>
    )
  }
  return sortDirection === 'asc' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
      <path d="m18 15-6-6-6 6"/>
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  )
}

function YearActivity({ selectedMonth, setSelectedMonth, logs }) {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false)
  const pickerRef = useRef(null)
  const activityByDay = useMemo(() => {
    const activity = new Map()
    logs.forEach(({ scannedAt, assessment }) => {
      const date = new Date(scannedAt)
      if (Number.isNaN(date.valueOf())) return
      const key = getDayKey(date)
      const entries = activity.get(key) || []
      entries.push(assessment)
      activity.set(key, entries)
    })
    return activity
  }, [logs])

  const days = useMemo(() => Array.from(
    { length: new Date(Date.UTC(2026, selectedMonth + 1, 0)).getUTCDate() },
    (_, index) => {
      const date = new Date(2026, selectedMonth, index + 1)
      const entries = activityByDay.get(getDayKey(date)) || []
      const level = entries.length === 0
        ? 0
        : Math.min(4, entries.length + (entries.includes('high') ? 1 : 0))
      return { date, level, scans: entries.length }
    },
  ), [activityByDay, selectedMonth])
  const openMenu = () => setMonthMenuOpen(true)
  const closeMenu = () => setMonthMenuOpen(false)
  return <div className="activity-section">
    <div className="activity-toolbar"><label id="activity-month-label">View month</label><div className="month-picker relative"><button ref={pickerRef} className="month-picker-button" type="button" aria-labelledby="activity-month-label month-picker-value" aria-expanded={monthMenuOpen} aria-haspopup="listbox" onClick={openMenu}><span id="month-picker-value">{months[selectedMonth]} 2026</span><span className="month-picker-chevron" aria-hidden="true">⌄</span></button>{monthMenuOpen && <div className="month-picker-menu" role="listbox" aria-label="Select month">{months.map((month, index) => (
      <button
        type="button"
        role="option"
        aria-selected={index === selectedMonth}
        className={index === selectedMonth ? 'selected' : ''}
        key={month}
        onClick={() => { setSelectedMonth(index); closeMenu() }}
      >
        {month} 2026
      </button>
    ))}</div>}</div></div>
    <div className="month-activity"><div className="weekday-headings"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div className="daily-grid month-days">{Array.from({ length: (new Date(2026, selectedMonth, 1).getDay() + 6) % 7 }, (_, index) => <i key={index}/>)}{days.map(({date, level, scans}) => <button className={`activity-day level-${level}`} key={date.toISOString()} title={`${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}: ${scans} scan${scans === 1 ? '' : 's'}`} aria-label={`${date.toDateString()}: ${scans} scan${scans === 1 ? '' : 's'}`}><span>{date.getDate()}</span></button>)}</div></div>
    <div className="activity-footer"><span>Hover a day to view scans</span><span className="activity-legend" aria-label="Scan activity legend"><span>Less</span><i className="level-0"/><i className="level-1"/><i className="level-2"/><i className="level-3"/><i className="level-4"/><span>More</span></span></div>
  </div>
}

function MonitoringStats({ logs }) {
  const stats = useMemo(() => {
    const now = new Date()
    const currentMonthScans = logs.filter(({ scannedAt }) => {
      const date = new Date(scannedAt)
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    })
    const activeDays = new Set(currentMonthScans.map(({ scannedAt }) => getDayKey(scannedAt))).size
    return {
      totalScans: currentMonthScans.length,
      activeDays,
    }
  }, [logs])

  return <div className="quick-stats"><div><small>Total Scanned</small><b>{stats.totalScans} scans</b></div><div><small>Active Days</small><b>{stats.activeDays} day{stats.activeDays === 1 ? '' : 's'}</b></div></div>
}

function TreesChecked({ logs }) {
  const scanCount = useMemo(() => {
    const now = new Date()
    return logs.filter(({ scannedAt }) => {
      const date = new Date(scannedAt)
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    }).length
  }, [logs])
  return <p>{scanCount} scan{scanCount === 1 ? '' : 's'} recorded this month</p>
}

function CalendarPage({ logs }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const activity = useMemo(() => {
    const byDay = new Map()
    logs.forEach(scan => {
      const date = new Date(scan.scannedAt)
      if (Number.isNaN(date.valueOf())) return
      const entries = byDay.get(getDayKey(date)) || []
      entries.push(scan)
      byDay.set(getDayKey(date), entries)
    })
    return byDay
  }, [logs])
  const daysInMonth = new Date(2026, selectedMonth + 1, 0).getDate()
  const leadingDays = (new Date(2026, selectedMonth, 1).getDay() + 6) % 7
  const trailingDays = 42 - leadingDays - daysInMonth
  const monthScans = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(2026, selectedMonth, index + 1)
    return { date, scans: activity.get(getDayKey(date)) || [] }
  })
  const goToPreviousMonth = () => setSelectedMonth(month => (month - 1 + 12) % 12)
  const goToNextMonth = () => setSelectedMonth(month => (month + 1) % 12)
  return <section className="calendar-page">
    <div className="calendar-page-header"><div><p className="label">FIELD CALENDAR</p><h2>Scan Activity</h2><p>Every logged observation, organized by day.</p></div><div className="month-nav"><button className="month-nav-button" type="button" onClick={goToPreviousMonth} aria-label="Previous month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><span className="month-nav-title">{months[selectedMonth]} 2026</span><button className="month-nav-button" type="button" onClick={goToNextMonth} aria-label="Next month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></button></div></div>
    <div className="calendar-grid large-calendar"><div className="calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day}>{day}</span>)}</div>{Array.from({ length: leadingDays }, (_, index) => <i className="calendar-empty" key={`leading-${index}`}/>)}{monthScans.map(({ date, scans }) => <button className={`calendar-day level-${Math.min(4, scans.length + (scans.some(scan => scan.assessment === 'high') ? 1 : 0))}`} key={date.toISOString()} title={`${scans.length} scan${scans.length === 1 ? '' : 's'}`}><strong>{date.getDate()}</strong>{scans.length > 0 && <small>{scans.length}</small>}</button>)}{Array.from({ length: trailingDays }, (_, index) => <i className="calendar-empty" key={`trailing-${index}`}/>)}</div>

  </section>
}

function LogsPage({ logs, logsConnected }) {
  const [selectedScanId, setSelectedScanId] = useState(null)
  const [sortColumn, setSortColumn] = useState('scannedAt')
  const [sortDirection, setSortDirection] = useState('desc')
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

  const sortedLogs = useMemo(() => {
    const sorted = [...logs]
    sorted.sort((a, b) => {
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
    return sorted
  }, [logs, sortColumn, sortDirection])

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
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
    <div className="calendar-page-header"><div><p className="label">FIELD DATA</p><h2>Observation Logs</h2><p>Every mangrove assessment recorded in the field.</p></div><span className="sync-status">{logsConnected ? 'LIVE' : 'LOCAL DATA'}</span></div>
    <div className="logs-detail-layout"><div className="full-log-table"><div className="full-log-row full-log-heading"><button type="button" className="sortable-header" onClick={() => handleSort('treeId')}><span>Tree ID</span><SortIcon column="treeId" sortColumn={sortColumn} sortDirection={sortDirection}/></button><button type="button" className="sortable-header" onClick={() => handleSort('scannedAt')}><span>Date</span><SortIcon column="scannedAt" sortColumn={sortColumn} sortDirection={sortDirection}/></button><button type="button" className="sortable-header" onClick={() => handleSort('assessment')}><span>Mangrove Status</span><SortIcon column="assessment" sortColumn={sortColumn} sortDirection={sortDirection}/></button></div><div className="log-table-body">{sortedLogs.map(({ id, treeId, scannedAt, assessment }, index) => { const label = `${assessment[0].toUpperCase()}${assessment.slice(1)}`; const rowId = id || `${treeId}-${scannedAt}-${index}`; return <button type="button" className={`full-log-row full-log-entry ${rowId === selectedScanId ? 'selected' : ''}`} key={rowId} onClick={() => setSelectedScanId(rowId)}><b>{treeId}</b><time>{formatLogDate(scannedAt)}</time><span className={`assessment ${assessment === 'low' ? 'assessment-low' : assessment}`}>{label}</span></button> })}{sortedLogs.length === 0 && <div className="full-log-empty">No field observations received yet.</div>}</div></div>
    {selectedScan && <div className="scan-detail-column"><article className="scan-detail-card"><div className="scan-photo-frame">{imageSource ? <img src={imageSource} alt={`${selectedScan.treeId} scan`} /> : <div className="scan-photo-empty">No image received</div>}</div><div className="scan-detail-content"><div className="scan-detail-heading"><div><p className="label">SELECTED SCAN</p><h3>{selectedScan.treeId}</h3></div><span className={`assessment ${selectedScan.assessment === 'low' ? 'assessment-low' : selectedScan.assessment}`}>{selectedLabel}</span></div><dl><div><dt>Date</dt><dd>{formatLogDate(selectedScan.scannedAt)}</dd></div><div><dt>Time</dt><dd>{formatLogTime(selectedScan.scannedAt)}</dd></div></dl></div></article>{scanGuidance && <><article className="scan-info-card"><p className="label">STATUS SUMMARY</p><p>{scanGuidance.summary}</p></article><article className="scan-info-card"><p className="label">RECOMMENDATIONS</p><ul>{scanGuidance.recommendations.map(recommendation => <li key={recommendation}>{recommendation}</li>)}</ul></article></>}</div>}</div>
  </section>
}

function InterventionProtocol({ logs }) {
  if (logs.length === 0) return <article className="protocol-card protocol-empty"><p className="label">INTERVENTION PROTOCOL</p><h2>No scanned data yet</h2><p>Complete a mangrove scan to generate the appropriate intervention protocol.</p></article>
  const counts = logs.reduce((result, { assessment }) => ({ ...result, [assessment]: (result[assessment] || 0) + 1 }), { low: 0, moderate: 0, high: 0 })
  const status = counts.low >= counts.moderate && counts.low >= counts.high ? 'low' : counts.moderate >= counts.high ? 'moderate' : 'high'
  const protocols = {
    low: { title: 'Low Stability Protocol', summary: 'Prioritize protection and hazard reduction for vulnerable mangroves.', steps: ['Restrict entry and prevent trampling or illegal harvesting.', 'Address nearby pollution, runoff, and sewage discharge.', 'Reinforce or relocate trees exposed to high surge risk.'] },
    moderate: { title: 'Moderate Stability Protocol', summary: 'Strengthen surrounding support and reduce environmental stress.', steps: ['Clear debris trapped around roots and inspect after storms.', 'Plant saplings in gaps to improve stand density.', 'Use temporary breakwaters where erosion is increasing.'] },
    high: { title: 'High Stability Protocol', summary: 'Protect resilient areas as conservation and monitoring zones.', steps: ['Prioritize conservation and designate no-touch areas.', 'Use the site as a baseline for nearby restoration work.', 'Allow only carefully managed education or research access.'] },
  }
  const protocol = protocols[status]
  return <article className="protocol-card"><p className="label">INTERVENTION PROTOCOL</p><div className="protocol-heading"><div><h2>{protocol.title}</h2><p>{protocol.summary}</p></div><span className={`protocol-status ${status}`}>{status.toUpperCase()}</span></div><ol>{protocol.steps.map(step => <li key={step}>{step}</li>)}</ol></article>
}

function HealthScore({ logs }) {
  const score = useMemo(() => {
    const validLogs = logs.filter(scan => ['high', 'moderate', 'low'].includes(scan.assessment))
    if (validLogs.length === 0) return { value: 0, color: '#b5c7bd', status: 'No scan data yet', description: 'Complete a field scan to calculate coastal resilience.' }
    const counts = validLogs.reduce((result, scan) => ({ ...result, [scan.assessment]: (result[scan.assessment] || 0) + 1 }), {})
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    const dominantCount = counts[dominant]
    const label = `${dominant[0].toUpperCase()}${dominant.slice(1)}`
    const color = { low: '#ef4444', moderate: '#f59e0b', high: '#00df81' }[dominant]
    return {
      value: Math.round((dominantCount / validLogs.length) * 100),
      color,
      status: `${label} stability overall`,
      description: `${dominantCount} of ${validLogs.length} total scan${validLogs.length === 1 ? '' : 's'} show ${label.toLowerCase()} stability.`,
    }
  }, [logs])
  const dashOffset = 283 - (score.value / 100) * 283
  return <article className="score-card"><div><p className="label">STABILITY CHART</p><h2 style={{ color: score.color }}>{score.status}</h2><p className="muted">{score.description}</p></div><div className="gauge"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="45"/><circle className="gauge-arc" cx="60" cy="60" r="45" style={{ strokeDashoffset: dashOffset, stroke: score.color }}/></svg><strong>{score.value}<span>%</span></strong></div></article>
}

function StabilityChart({ logs }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const monthly = months.map((monthName, monthIndex) => {
    const scans = logs.filter(({ scannedAt }) => {
      const date = new Date(scannedAt)
      return !Number.isNaN(date.valueOf()) && date.getMonth() === monthIndex
    })
    return {
      low: scans.filter(({ assessment }) => assessment === 'low').length,
      moderate: scans.filter(({ assessment }) => assessment === 'moderate').length,
      high: scans.filter(({ assessment }) => assessment === 'high').length,
      scans,
    }
  })
  const maxValue = Math.max(100, Math.ceil(Math.max(...monthly.map(({ low, moderate, high }) => Math.max(low, moderate, high)), 0) / 10) * 10)
  const points = monthly.map(({ low, moderate, high }, index) => ({
    x: 34 + index * 53.3,
    lowY: 175 - (low / maxValue) * 150,
    moderateY: 175 - (moderate / maxValue) * 150,
    highY: 175 - (high / maxValue) * 150,
  }))
  const linePath = key => points.reduce((path, point, index) => {
    const y = point[key] || 175
    if (index === 0) return `M${point.x} ${y}`
    const previous = points[index - 1]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C${midpoint} ${previous[key] || 175}, ${midpoint} ${y}, ${point.x} ${y}`
  }, '')
  const areaPath = key => `${linePath(key)} L620 175 L34 175Z`
  const hovered = hoveredIndex === null ? null : monthly[hoveredIndex]
  const point = hoveredIndex === null ? null : points[hoveredIndex]
  const tooltipY = point ? Math.max(2, Math.min(96, Math.min(point.lowY, point.moderateY, point.highY) - 92)) : 2
  const tooltipDate = hoveredIndex === null ? '' : fullMonths[hoveredIndex]
  return <svg className="reference-chart" onMouseLeave={() => setHoveredIndex(null)} viewBox="0 0 640 210" preserveAspectRatio="none" role="img" aria-label="Low, moderate, and high stability assessment trend"><defs><linearGradient id="lowFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ef4444" stopOpacity=".32"/><stop offset="1" stopColor="#ef4444" stopOpacity=".03"/></linearGradient></defs><g className="reference-grid"><path d="M34 25H620M34 55H620M34 85H620M34 115H620M34 145H620M34 175H620"/></g><g className="reference-axis"><text x="3" y="29">{maxValue}</text><text x="3" y="59">{Math.round(maxValue * .8)}</text><text x="3" y="89">{Math.round(maxValue * .6)}</text><text x="3" y="119">{Math.round(maxValue * .4)}</text><text x="3" y="149">{Math.round(maxValue * .2)}</text><text x="8" y="179">0</text>{months.map((monthName, index) => <text key={monthName} x={34 + index * 53.3} y="199" textAnchor={index === 0 ? 'start' : index === 11 ? 'end' : 'middle'}>{monthName}</text>)}</g><path className="reference-area low-area" d={areaPath('lowY')}/><path className="reference-line low-line" d={linePath('lowY')}/><path className="reference-line moderate-line" d={linePath('moderateY')}/><path className="reference-line high-line" d={linePath('highY')}/>{points.map((item, index) => <g className="chart-point" key={months[index]} onMouseEnter={() => setHoveredIndex(index)}><circle className="hover-target" cx={item.x} cy={item.lowY} r="10"/><circle className="hover-target" cx={item.x} cy={item.moderateY} r="10"/><circle className="hover-target" cx={item.x} cy={item.highY} r="10"/>{hoveredIndex === index && <><circle className="reference-marker-dot low-marker-dot" cx={item.x} cy={item.lowY} r="4"/><circle className="reference-marker-dot moderate-marker-dot" cx={item.x} cy={item.moderateY} r="4"/><circle className="reference-marker-dot high-marker-dot" cx={item.x} cy={item.highY} r="4"/></>}</g>)}{point && <><line className="reference-marker" x1={point.x} y1="18" x2={point.x} y2="175"/><g className="reference-tooltip"><rect x={Math.min(point.x + 16, 410)} y={tooltipY} width="196" height="88" rx="5"/><text x={Math.min(point.x + 28, 422)} y={tooltipY + 20} className="tooltip-date">{tooltipDate}</text><circle cx={Math.min(point.x + 30, 424)} cy={tooltipY + 38} r="5" className="low-dot"/><text x={Math.min(point.x + 43, 437)} y={tooltipY + 41}>Low Stability</text><text x={Math.min(point.x + 192, 586)} y={tooltipY + 41} textAnchor="end">{hovered.low}</text><circle cx={Math.min(point.x + 30, 424)} cy={tooltipY + 58} r="5" className="moderate-dot"/><text x={Math.min(point.x + 43, 437)} y={tooltipY + 61}>Moderate Stability</text><text x={Math.min(point.x + 192, 586)} y={tooltipY + 61} textAnchor="end">{hovered.moderate}</text><circle cx={Math.min(point.x + 30, 424)} cy={tooltipY + 78} r="5" className="high-dot"/><text x={Math.min(point.x + 43, 437)} y={tooltipY + 81}>High Stability</text><text x={Math.min(point.x + 192, 586)} y={tooltipY + 81} textAnchor="end">{hovered.high}</text></g></>}</svg>
}

export default function App() {
  const [month, setMonth] = useState(() => new Date().getMonth())
  const setSelectedMonth = setMonth
  const [activePage, setActivePage] = useState('dashboard')
  const [logs, setLogs] = useState(fallbackLogs)
  const [logsConnected, setLogsConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadLogs() {
      try {
        const response = await fetch('/api/scans')
        if (!response.ok) throw new Error('Could not load observation logs')
        const scans = await response.json()
        if (!cancelled) {
          setLogs(scans)
          setLogsConnected(true)
        }
      } catch (_) {
        if (!cancelled) setLogsConnected(false)
      }
    }
    loadLogs()
    const events = new EventSource('/api/scans/events')
    events.addEventListener('scans-updated', loadLogs)
    const refresh = window.setInterval(loadLogs, 30000)
    return () => {
      cancelled = true
      events.close()
      window.clearInterval(refresh)
    }
  }, [])
  return <div className="page-shell"><div className="app-shell">
    <aside className="sidebar"><div className="nav-group"><div className="brand"><span>•••</span><b>MG</b></div>{['home','chart','flag','calendar'].map((name,index) => <button className={`nav-button ${((index === 0 && activePage === 'dashboard') || (index === 3 && activePage === 'calendar') || (index === 1 && activePage === 'logs')) ? 'active' : ''}`} key={name} onClick={() => { if (name === 'calendar') setActivePage('calendar'); if (name === 'chart') setActivePage('logs'); if (name === 'home') setActivePage('dashboard') }} aria-label={name === 'calendar' ? 'Open calendar' : name === 'chart' ? 'Open observation logs' : name === 'home' ? 'Open dashboard' : name}><Icon name={name}/></button>)}</div><div className="nav-group secondary"><button className="nav-button"><Icon name="bell"/></button><button className="nav-button"><Icon name="settings"/></button></div></aside>
    <main className="main-content"><header className="header"><h1>MangroveGuard</h1><button className="date-button"><Icon name="calendar"/><b>All dates</b><span>⌄</span></button></header>{activePage === 'calendar' ? <CalendarPage logs={logs}/> : activePage === 'logs' ? <LogsPage logs={logs} logsConnected={logsConnected}/> : <section className="dashboard-page"><section className="top-grid"><article className="stability-card"><p className="label">FIELD ASSESSMENT</p><h2>Mangrove Stability Index</h2><div className="stability-chart"><StabilityChart logs={logs}/></div><div className="legend chart-legend"><span><i className="low-stability-dot"/>Low</span><span><i className="moderate-stability-dot"/>Moderate</span><span><i className="high-stability-dot"/>High</span></div></article><article className="monitoring-card"><div><h2>Field Monitoring</h2><TreesChecked logs={logs}/></div><MonitoringStats logs={logs}/><YearActivity selectedMonth={month} setSelectedMonth={setSelectedMonth} logs={logs}/></article></section>
      <section className="bottom-grid"><HealthScore logs={logs}/><InterventionProtocol logs={logs}/></section></section>}
    </main></div></div>
}
