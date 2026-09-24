import { useEffect, useState } from 'react'
import { formatDateTime, isOnline } from '../utils.js'

export default function DevicesPage({ devices: initialDevices }) {
  const [devices, setDevices] = useState(initialDevices)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)

  useEffect(() => {
    setDevices(initialDevices)
  }, [initialDevices])

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
              <span className="camera-label">[ Placeholder: QR Code Scanner ]</span>
            </div>
            <div className="qr-pair-form">
              <div className="form-field">
                <label className="form-label">Device ID</label>
                <input className="form-input" placeholder="[ Input Placeholder: Device ID (Auto-fill) ]" disabled />
              </div>
            </div>
            <button className="pair-confirm-button" disabled>Confirm Pairing</button>
          </div>
        </div>
      </div>
    </section>
  )
}
