import { useMemo, useState } from 'react'
import { getDayKey, months, fullMonths, formatLogTime, formatLogDate } from '../utils.js'

export default function CalendarPage({ logs }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState(null)

  const activity = useMemo(() => {
    const byDay = new Map()
    logs.forEach((scan) => {
      const date = new Date(scan.scannedAt)
      if (Number.isNaN(date.valueOf())) return
      const key = getDayKey(date)
      const entries = byDay.get(key) || []
      entries.push(scan)
      byDay.set(key, entries)
    })
    return byDay
  }, [logs])

  const daysInMonth = new Date(2026, selectedMonth + 1, 0).getDate()
  const leadingDays = (new Date(2026, selectedMonth, 1).getDay() + 6) % 7
  const trailingDays = 42 - leadingDays - daysInMonth

  const goToPreviousMonth = () => setSelectedMonth((month) => (month - 1 + 12) % 12)
  const goToNextMonth = () => setSelectedMonth((month) => (month + 1) % 12)

  const handleDayClick = (day) => {
    const clickedDate = new Date(2026, selectedMonth, day)
    setSelectedDate(clickedDate)
  }

  const handleBackToCalendar = () => {
    setSelectedDate(null)
  }

  const handlePrevDay = () => {
    if (!selectedDate) return
    const prev = new Date(selectedDate)
    prev.setDate(prev.getDate() - 1)
    setSelectedDate(prev)
  }

  const handleNextDay = () => {
    if (!selectedDate) return
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + 1)
    setSelectedDate(next)
  }

  const handleDateChange = (event) => {
    const value = event.target.value
    if (!value) return
    const [year, month, day] = value.split('-').map(Number)
    setSelectedDate(new Date(year, month - 1, day))
  }

  const dateInputValue = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : ''

  const dayScans = selectedDate ? (activity.get(getDayKey(selectedDate)) || []) : []
  const totalScans = dayScans.length
  const activeDeviceEntries = useMemo(() => {
    const entries = new Map()
    dayScans.forEach((scan) => {
      if (scan.deviceId) {
        entries.set(scan.deviceId, { id: scan.deviceId, name: scan.deviceName || scan.deviceId })
      }
    })
    return Array.from(entries.values())
  }, [dayScans])

  const statusCounts = useMemo(() => {
    const counts = { high: 0, moderate: 0, low: 0 }
    dayScans.forEach((scan) => {
      const key = scan.assessment === 'high' ? 'high' : scan.assessment === 'moderate' ? 'moderate' : 'low'
      counts[key] += 1
    })
    return counts
  }, [dayScans])

  if (selectedDate) {
    const selectedDayKey = getDayKey(selectedDate)
    return <section className="calendar-page">
      <div className="calendar-page-header">
        <div>
          <p className="label">FIELD CALENDAR</p>
          <h2>Scan Activity — {formatLogDate(selectedDate.toISOString())}</h2>
          <p>{totalScans} scan{totalScans === 1 ? '' : 's'} recorded on this date.</p>
        </div>
        <div className="day-nav">
          <button className="month-nav-button" type="button" onClick={handlePrevDay} aria-label="Previous day">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <input
            type="date"
            className="day-picker"
            value={dateInputValue}
            onChange={handleDateChange}
            aria-label="Select date"
          />
          <button className="month-nav-button" type="button" onClick={handleNextDay} aria-label="Next day">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button className="month-nav-button" type="button" onClick={handleBackToCalendar} aria-label="Back to calendar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 12h12" />
              <path d="m12 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="day-summary-metrics">
        <div className="day-metric-card">
          <p className="metric-value">{totalScans}</p>
          <p className="metric-label">Total Scans</p>
        </div>
        <div className="day-distribution">
          <div className="day-distribution-bar" style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
            {totalScans > 0 && (
              <>
                <div style={{ flex: statusCounts.high, background: 'var(--color-accent)', minWidth: statusCounts.high > 0 ? 8 : 0 }} title={`High: ${statusCounts.high}`} />
                <div style={{ flex: statusCounts.moderate, background: 'var(--color-warning)', minWidth: statusCounts.moderate > 0 ? 8 : 0 }} title={`Moderate: ${statusCounts.moderate}`} />
                <div style={{ flex: statusCounts.low, background: 'var(--color-danger)', minWidth: statusCounts.low > 0 ? 8 : 0 }} title={`Low: ${statusCounts.low}`} />
              </>
            )}
          </div>
          <div className="day-distribution-legend">
            <span className="day-legend-item"><span className="day-legend-swatch" style={{ background: 'var(--color-accent)' }} />High {statusCounts.high}</span>
            <span className="day-legend-item"><span className="day-legend-swatch" style={{ background: 'var(--color-warning)' }} />Moderate {statusCounts.moderate}</span>
            <span className="day-legend-item"><span className="day-legend-swatch" style={{ background: 'var(--color-danger)' }} />Low {statusCounts.low}</span>
          </div>
        </div>
      </div>

      {activeDeviceEntries.length > 0 && (
        <div className="day-active-devices">
          <p className="label">Active Devices</p>
          <div className="device-badges">
            {activeDeviceEntries.map((entry) => (
              <span key={entry.id} className="device-badge">{entry.name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="day-table">
        <div className="day-heading day-row">
          <span>Tree ID</span>
          <span>Scan Time</span>
          <span>Status</span>
          <span>Device</span>
        </div>
        {dayScans.length === 0 && (
          <div className="empty-logs">No scans recorded on this date.</div>
        )}
        {dayScans.map((scan, index) => (
          <div className="day-row" key={`${selectedDayKey}-${scan.scannedAt}-${index}`}>
            <b>{scan.treeId}</b>
            <time>{formatLogTime(scan.scannedAt)}</time>
            <span className={`day-assessment ${scan.assessment || 'low'}`}>{scan.assessment || 'low'}</span>
            <span>{scan.deviceName || scan.deviceId || '—'}</span>
          </div>
        ))}
      </div>
    </section>
  }

  return <section className="calendar-page">
    <div className="calendar-page-header">
      <div>
        <p className="label">FIELD CALENDAR</p>
        <h2>Scan Activity</h2>
        <p>Every logged observation, organized by day.</p>
      </div>
      <div className="month-nav">
        <button className="month-nav-button" type="button" onClick={goToPreviousMonth} aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="month-nav-title">{months[selectedMonth]} 2026</span>
        <button className="month-nav-button" type="button" onClick={goToNextMonth} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
    <div className="calendar-grid large-calendar">
      <div className="calendar-weekdays">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
      </div>
      {Array.from({ length: leadingDays }, (_, index) => <i className="calendar-empty" key={`leading-${index}`} />)}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(2026, selectedMonth, index + 1)
        const scans = activity.get(getDayKey(date)) || []
        const level = Math.min(4, scans.length + (scans.some((scan) => scan.assessment === 'high') ? 1 : 0))
        return (
          <button
            className={`calendar-day level-${level}`}
            key={date.toISOString()}
            title={`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${scans.length} scan${scans.length === 1 ? '' : 's'}`}
            onClick={() => handleDayClick(index + 1)}
            type="button"
          >
            <strong>{date.getDate()}</strong>
            {scans.length > 0 && <small>{scans.length}</small>}
          </button>
        )
      })}
      {Array.from({ length: trailingDays }, (_, index) => <i className="calendar-empty" key={`trailing-${index}`} />)}
    </div>
  </section>
}
