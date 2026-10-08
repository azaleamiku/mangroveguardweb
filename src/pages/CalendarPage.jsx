import { useMemo, useState } from 'react'
import { getDayKey, months, fullMonths, formatLogTime, formatLogDate } from '../utils.js'

export default function CalendarPage({ logs }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)

  const today = useMemo(() => new Date(), [])
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()
  const isCurrentMonth = selectedMonth === currentMonth

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

  const daysInMonth = new Date(currentYear, selectedMonth + 1, 0).getDate()
  const leadingDays = (new Date(currentYear, selectedMonth, 1).getDay() + 6) % 7
  const trailingDays = 42 - leadingDays - daysInMonth

  const goToPreviousMonth = () => setSelectedMonth((month) => (month - 1 + 12) % 12)
  const goToNextMonth = () => setSelectedMonth((month) => (month + 1) % 12)
  const goToToday = () => setSelectedMonth(currentMonth)

  const handleDayClick = (day) => {
    const clickedDate = new Date(currentYear, selectedMonth, day)
    setSelectedDate(clickedDate)
    setStatusFilter(null)
  }

  const handleBackToCalendar = () => {
    setSelectedDate(null)
    setStatusFilter(null)
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
          <button className="back-link" type="button" onClick={handleBackToCalendar} aria-label="Back to calendar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Calendar</span>
          </button>
          <h2>Daily Activity Summary</h2>
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
        </div>
      </div>

      <div className="day-summary-banner">
        <div className="day-summary-count">
          <span className="day-summary-total">{totalScans}</span>
          <span className="day-summary-label">scans</span>
        </div>
        <div className="day-distribution-bar">
          {totalScans > 0 && statusCounts.high + statusCounts.moderate + statusCounts.low > 0 && (
            <>
              {statusCounts.high > 0 && (
                <button
                  type="button"
                  className={`status-segment high-segment${statusFilter === 'high' ? ' active' : ''}`}
                  style={{ flex: statusCounts.high }}
                  onClick={() => setStatusFilter((prev) => (prev === 'high' ? null : 'high'))}
                  aria-label={`High: ${statusCounts.high} scans`}
                >
                  <span className="status-tooltip">{statusCounts.high} High</span>
                </button>
              )}
              {statusCounts.moderate > 0 && (
                <button
                  type="button"
                  className={`status-segment moderate-segment${statusFilter === 'moderate' ? ' active' : ''}`}
                  style={{ flex: statusCounts.moderate }}
                  onClick={() => setStatusFilter((prev) => (prev === 'moderate' ? null : 'moderate'))}
                  aria-label={`Moderate: ${statusCounts.moderate} scans`}
                >
                  <span className="status-tooltip">{statusCounts.moderate} Moderate</span>
                </button>
              )}
              {statusCounts.low > 0 && (
                <button
                  type="button"
                  className={`status-segment low-segment${statusFilter === 'low' ? ' active' : ''}`}
                  style={{ flex: statusCounts.low }}
                  onClick={() => setStatusFilter((prev) => (prev === 'low' ? null : 'low'))}
                  aria-label={`Low: ${statusCounts.low} scans`}
                >
                  <span className="status-tooltip">{statusCounts.low} Low</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="day-table">
        <div className="day-heading day-row">
          <span>Tree ID</span>
          <span>Scan Time</span>
          <span>Status</span>
          <span>Device</span>
        </div>
        {(statusFilter ? dayScans.filter((scan) => scan.assessment === statusFilter) : dayScans).length === 0 && (
          <div className="empty-logs">No scans recorded on this date.</div>
        )}
        {(statusFilter ? dayScans.filter((scan) => scan.assessment === statusFilter) : dayScans).map((scan, index) => (
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
        <span className="month-nav-title">{months[selectedMonth]} {currentYear}</span>
        <button className="month-nav-button" type="button" onClick={goToNextMonth} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <button
          className={`month-nav-button today-button${isCurrentMonth ? ' current' : ''}`}
          type="button"
          onClick={goToToday}
          aria-label="Go to this month"
        >
          This Month
        </button>
      </div>
    </div>
    <div className="calendar-legend">
      <span className="calendar-legend-label">Less</span>
      <span className="calendar-legend-swatch level-0" />
      <span className="calendar-legend-swatch level-1" />
      <span className="calendar-legend-swatch level-2" />
      <span className="calendar-legend-swatch level-3" />
      <span className="calendar-legend-swatch level-4" />
      <span className="calendar-legend-label">More</span>
    </div>
    <div className="calendar-grid large-calendar">
      <div className="calendar-weekdays">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
      </div>
      {Array.from({ length: leadingDays }, (_, index) => <i className="calendar-empty" key={`leading-${index}`} />)}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(currentYear, selectedMonth, index + 1)
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
