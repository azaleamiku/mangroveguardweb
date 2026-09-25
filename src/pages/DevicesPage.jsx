import { useEffect, useState } from 'react'
import { formatDateTime, isOnline } from '../utils.js'

export default function DevicesPage({ devices: initialDevices }) {
  const [devices, setDevices] = useState(initialDevices)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [qr, setQr] = useState(null)
  const [deviceId, setDeviceId] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    setDevices(initialDevices)
  }, [initialDevices])

  useEffect(() => {
    if (!isAddPanelOpen) return
    let cancelled = false
    async function loadQr() {
      try {
        const res = await fetch('/api/pair/qr')
        const data = await res.json()
        if (!cancelled && data && data.qrDataUrl) setQr(data)
      } catch {}
    }
    loadQr()
    return () => { cancelled = true }
  }, [isAddPanelOpen])

  async function confirmPairing() {
    setStatusMessage('')
    if (!qr || !deviceId) {
      setStatusMessage('Device ID is required')
      return
    }
    try {
      const res = await fetch('/api/pair/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: qr.token, deviceId, deviceName: deviceName || deviceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Pairing failed')
      setStatusMessage(`Paired ${data.deviceId}`)
      setDeviceId('')
      setDeviceName('')
      const res2 = await fetch('/api/pair/qr')
      const data2 = await res2.json()
      if (data2 && data2.qrDataUrl) setQr(data2)
    } catch (error) {
      setStatusMessage(error.message)
      const res2 = await fetch('/api/pair/qr')
      const data2 = await res2.json()
      if (data2 && data2.qrDataUrl) setQr(data2)
    }
  }

  return (
    <section className="devices-page">
      <div className={`devices-content-wrapper${isAddPanelOpen ? ' panel-open' : ''}`}>
        <div className="devices-main">
          <div className="calendar-page-header">
            <div>
              <p className="label">DEVICE REGISTRY</p>
              <h2>Devices</h2>
              <p>Registered field devices and their current status.</p>
            </div>
            <button
              className="add-device-button"
              onClick={() => setIsAddPanelOpen((prev) => !prev)}
              aria-label={isAddPanelOpen ? 'Close panel' : 'Pair new device'}
              title={isAddPanelOpen ? 'Close' : 'Pair New Device'}
            >
              {isAddPanelOpen ? (
                <span className="add-icon">×</span>
              ) : (
                <svg className="qr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3z" />
                  <path d="M21 14h3v3h-3z" />
                  <path d="M14 21h3v3h-3z" />
                </svg>
              )}
            </button>
          </div>
          <div className="devices-table-wrapper">
            <table className="data-table devices-table">
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Registration Date</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr><td colSpan="4" className="empty-state">No devices registered yet.</td></tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.deviceId}>
                      <td><b>{device.deviceName}</b></td>
                      <td>{formatDateTime(device.registeredAt)}</td>
                      <td>{formatDateTime(device.lastSeenAt)}</td>
                      <td><span className={`status-badge ${isOnline(device.lastSeenAt) ? 'online' : 'offline'}`}>{isOnline(device.lastSeenAt) ? 'Online' : 'Offline'}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="devices-add-panel">
          <div className="qr-pair-body">
            <div className="camera-placeholder">
              {qr && qr.qrDataUrl ? (
                <img src={qr.qrDataUrl} alt="Pairing QR" />
              ) : (
                <span className="camera-label">Generating QR...</span>
              )}
            </div>
            <div className="qr-pair-form">
              <div className="form-field">
                <label className="form-label">Device ID</label>
                <input className="form-input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="Device ID" />
              </div>
              <div className="form-field">
                <label className="form-label">Device Name</label>
                <input className="form-input" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Optional name" />
              </div>
              {statusMessage && <p className="qr-status">{statusMessage}</p>}
            </div>
            <button className="pair-confirm-button" onClick={confirmPairing} disabled={!qr || !deviceId}>Confirm Pairing</button>
          </div>
        </div>
      </div>
    </section>
  )
}
