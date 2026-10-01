import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LogsPage from './pages/LogsPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import FlagPage from './pages/FlagPage.jsx'
import DevicesPage from './pages/DevicesPage.jsx'
import SessionsPage from './pages/SessionsPage.jsx'

import { fallbackLogs } from './utils.js'

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [logs, setLogs] = useState(fallbackLogs)
  const [logsConnected, setLogsConnected] = useState(false)
  const [devices, setDevices] = useState([])
  const [sessions, setSessions] = useState([])

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

  useEffect(() => {
    let cancelled = false
    async function loadDevices() {
      try {
        const response = await fetch('/api/devices')
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setDevices(data)
      } catch (_) {}
    }
    loadDevices()
    const events = new EventSource('/api/devices/events')
    events.addEventListener('devices-updated', loadDevices)
    return () => {
      cancelled = true
      events.close()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadSessions() {
      try {
        const response = await fetch('/api/sessions')
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setSessions(data)
      } catch (_) {}
    }
    loadSessions()
    const events = new EventSource('/api/sessions/events')
    events.addEventListener('sessions-updated', loadSessions)
    return () => {
      cancelled = true
      events.close()
    }
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage logs={logs} />
      case 'logs':
        return <LogsPage logs={logs} logsConnected={logsConnected} />
      case 'calendar':
        return <CalendarPage logs={logs} />
      case 'flag':
        return <FlagPage />
      case 'devices':
        return <DevicesPage devices={devices} />
      case 'sessions':
        return <SessionsPage sessions={sessions} logs={logs} />
      default:
        return <DashboardPage logs={logs} />
    }
  }

  return <div className="page-shell">
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        <Header />
        {renderPage()}
      </main>
    </div>
  </div>
}
