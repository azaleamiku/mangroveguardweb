import { useEffect, useState } from 'react'
import { formatDateTime, isOnline } from '../utils.js'

export default function DevicesPage({ devices: initialDevices }) {
  const [devices, setDevices] = useState(initialDevices)

  useEffect(() => {
    setDevices(initialDevices)
  }, [initialDevices])

  return (
    <section className="devices-page">
      <div className="calendar-page-header">
        <div>
          <p className="label">DEVICE REGISTRY</p>
          <h2>Devices</h2>
          <p>Registered field devices and their current status.</p>
        </div>
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
    </section>
  )
}
