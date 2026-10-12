import { useMemo, useRef, useState, useEffect } from 'react'
import StabilityChart from '../components/StabilityChart.jsx'
import HealthScore from '../components/HealthScore.jsx'
import { formatLogDate, formatLogTime, getDayKey, months } from '../utils.js'

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

  return <div className="quick-stats">
    <div><small>Total Scanned</small><b>{stats.totalScans}</b></div>
    <div><small>Active Days</small><b>{stats.activeDays} days</b></div>
  </div>
}

function YearActivity({ selectedMonth, setSelectedMonth, logs }) {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false)
  const pickerRef = useRef(null)
  const year = new Date().getFullYear()
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
    { length: new Date(Date.UTC(year, selectedMonth + 1, 0)).getUTCDate() },
    (_, index) => {
      const date = new Date(year, selectedMonth, index + 1)
      const entries = activityByDay.get(getDayKey(date)) || []
      const level = entries.length === 0
        ? 0
        : Math.min(4, entries.length + (entries.includes('high') ? 1 : 0))
      return { date, level, scans: entries.length }
    },
  ), [activityByDay, selectedMonth])

  const closeMenu = () => setMonthMenuOpen(false)

  useEffect(() => {
    if (!monthMenuOpen) return
    const handleClick = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [monthMenuOpen])

  return <div className="activity-section">
    <div className="activity-toolbar">
      <span className="activity-hint">Hover a day to view scans</span>
      <span className="activity-toolbar-divider" aria-hidden="true" />
      <span className="activity-legend" aria-label="Scan activity legend">
        <span>Less</span>
        <i className="level-0" />
        <i className="level-1" />
        <i className="level-2" />
        <i className="level-3" />
        <i className="level-4" />
        <span>More</span>
      </span>
      <span className="activity-toolbar-divider" aria-hidden="true" />
      <label id="activity-month-label">View month</label>
      <div className="month-picker relative" ref={pickerRef}>
        <button className="month-picker-button" type="button" aria-labelledby="activity-month-label month-picker-value" aria-expanded={monthMenuOpen} aria-haspopup="listbox" onClick={() => setMonthMenuOpen((open) => !open)}>
          <span id="month-picker-value">{months[selectedMonth]} {year}</span>
          <span className="month-picker-chevron" aria-hidden="true">⌄</span>
        </button>
        {monthMenuOpen && (
          <div className="month-picker-menu" role="listbox" aria-label="Select month">
            {months.map((month, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === selectedMonth}
                className={index === selectedMonth ? 'selected' : ''}
                key={month}
                onClick={() => { setSelectedMonth(index); closeMenu() }}
              >
                {month} {year}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
    <div className="month-activity">
      <div className="weekday-headings">
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
      </div>
      <div className="daily-grid month-days">
        {Array.from({ length: (new Date(year, selectedMonth, 1).getDay() + 6) % 7 }, (_, index) => <i key={index} />)}
        {days.map(({ date, level, scans }) => (
          <button
            className={`activity-day level-${level}`}
            key={date.toISOString()}
            title={`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${scans} scan${scans === 1 ? '' : 's'}`}
            aria-label={`${date.toDateString()}: ${scans} scan${scans === 1 ? '' : 's'}`}
          >
            <span>{date.getDate()}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
}

function InterventionProtocol({ logs }) {
  if (logs.length === 0) {
    return (
      <article className="protocol-card protocol-empty">
        <p className="label">INTERVENTION PROTOCOL</p>
        <h2>No scanned data yet</h2>
        <p>Complete a mangrove scan to generate the appropriate intervention protocol.</p>
      </article>
    )
  }
  const counts = logs.reduce((result, { assessment }) => ({ ...result, [assessment]: (result[assessment] || 0) + 1 }), { low: 0, moderate: 0, high: 0 })
  const status = counts.low >= counts.moderate && counts.low >= counts.high ? 'low' : counts.moderate >= counts.high ? 'moderate' : 'high'
  const protocols = {
    low: {
      title: 'Low Stability Protocol',
      summary: 'Prioritize protection and hazard reduction for vulnerable mangroves.',
      narrative: [
        'The Low Stability Protocol prioritizes ',
        { strong: 'site-wide protection and threat reduction' },
        ' across vulnerable mangrove zones. ',
        { strong: 'Restrict public access' },
        ' to prevent foot traffic, soil compaction, and illegal harvesting within fragile root systems. ',
        { strong: 'Address watershed-level stressors' },
        ' by controlling local pollution, agricultural runoff, and untreated sewage discharge. ',
        { strong: 'Install wave-attenuation barriers' },
        ' along exposed shorelines to stabilize ',
        { strong: 'erosion-prone plots' },
        ' and protect vulnerable sapling populations.',
      ],
    },
    moderate: {
      title: 'Moderate Stability Protocol',
      summary: 'Strengthen surrounding support and reduce environmental stress.',
      narrative: [
        'The Moderate Stability Protocol focuses on ',
        { strong: 'assisted natural recovery' },
        ' and ',
        { strong: 'habitat enhancement' },
        ' across semi-established forest stands. ',
        { strong: 'Restore natural tidal flow' },
        ' by clearing blocked channels to maintain balanced salinity and nutrient exchange. ',
        { strong: 'Stabilize vulnerable mudflats' },
        ' using permeable wave barriers or eco-friendly erosion mats to preserve shoreline sediments. ',
        { strong: 'Conduct regular monitoring' },
        ' across the sector and perform ',
        { strong: 'targeted enrichment planting' },
        ' using wild-harvested propagules in sparse patches.',
      ],
    },
    high: {
      title: 'High Stability Protocol',
      summary: 'Protect resilient areas as conservation and monitoring zones.',
      narrative: [
        'The High Stability Protocol emphasizes ',
        { strong: 'ecosystem preservation' },
        ', ',
        { strong: 'community co-management' },
        ', and ',
        { strong: 'resource stewardship' },
        '. ',
        { strong: 'Establish formal conservation boundaries' },
        ' and involve local communities in sustainable coastal management. ',
        { strong: 'Maintain long-term monitoring' },
        ' through periodic satellite or drone mapping to track canopy coverage and shoreline expansion. ',
        { strong: 'Utilize stable forest sectors' },
        ' as seed and propagule ',
        { strong: 'donor reserves' },
        ' for regional mangrove restoration projects.',
      ],
    },
  }
  const protocol = protocols[status]
  return (
    <article className={`protocol-card protocol-${status}`}>
      <p className="label">INTERVENTION PROTOCOL</p>
      <div>
        <h2>{protocol.title}</h2>
        <p>{protocol.summary}</p>
      </div>
      <p className="protocol-narrative">
        {protocol.narrative.map((part, index) => (
          typeof part === 'string'
            ? part
            : <strong key={index} className="protocol-highlight">{part.strong}</strong>
        ))}
      </p>
    </article>
  )
}

export default function DashboardPage({ logs }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const [hoverReadout, setHoverReadout] = useState(null)
  const [hiddenAssessments, setHiddenAssessments] = useState([])

  const toggleAssessment = (assessment) => {
    setHiddenAssessments((prev) => prev.includes(assessment) ? prev.filter((a) => a !== assessment) : [...prev, assessment])
  }

  return (
    <section className="dashboard-page">
      <section className="top-grid">
        <article className="stability-card">
          <div className="stability-card-header">
            <div>
              <p className="label">FIELD ASSESSMENT</p>
              <h2>Mangrove Stability Index</h2>
            </div>
            <div className="legend chart-legend">
              <button type="button" className={`chart-legend-item ${hiddenAssessments.includes('low') ? 'hidden' : ''}`} onClick={() => toggleAssessment('low')}>
                <i className="low-stability-dot" /><span>Low</span>
              </button>
              <button type="button" className={`chart-legend-item ${hiddenAssessments.includes('moderate') ? 'hidden' : ''}`} onClick={() => toggleAssessment('moderate')}>
                <i className="moderate-stability-dot" /><span>Moderate</span>
              </button>
              <button type="button" className={`chart-legend-item ${hiddenAssessments.includes('high') ? 'hidden' : ''}`} onClick={() => toggleAssessment('high')}>
                <i className="high-stability-dot" /><span>High</span>
              </button>
            </div>
          </div>
          <p className="stability-readout" aria-live="polite">
            {hoverReadout ? (
              <>
                <span className="stability-readout-month">{hoverReadout.month}</span>
                <span className={`stability-readout-badge ${hoverReadout.assessment}`}>{hoverReadout.assessment}</span>
                <span className="stability-readout-value">{hoverReadout.value}</span>
              </>
            ) : (
              <span className="stability-readout-placeholder">Hover a data point for details</span>
            )}
          </p>
          <div className="stability-chart">
            <StabilityChart logs={logs} onHover={setHoverReadout} hiddenAssessments={hiddenAssessments} />
          </div>
        </article>
        <article className="monitoring-card">
          <div>
            <h2>Field Monitoring</h2>
          </div>
          <MonitoringStats logs={logs} />
          <YearActivity selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} logs={logs} />
        </article>
      </section>
      <section className="bottom-grid">
        <HealthScore logs={logs} />
        <InterventionProtocol logs={logs} />
      </section>
    </section>
  )
}
