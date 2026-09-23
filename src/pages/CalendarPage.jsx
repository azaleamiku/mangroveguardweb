import { useMemo, useState } from 'react'
import { getDayKey, months } from '../utils.js'

export default function CalendarPage({ logs }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
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
