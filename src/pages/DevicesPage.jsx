import { useEffect, useState, useRef } from 'react'
import { formatDateTime, isOnline } from '../utils.js'
import Icon from '../components/Icon.jsx'

function getDeviceStatus(device) {
  if (!device.lastPairedToken) return 'Unpaired'
  return isOnline(device.lastSeenAt) ? 'Online' : 'Offline'
}

export default function DevicesPage({ devices: initialDevices }) {
  const [devices, setDevices] = useState(initialDevices)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [qr, setQr] = useState(null)
  const [deviceId, setDeviceId] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [qrStatus, setQrStatus] = useState('idle')
  const [pairedDevice, setPairedDevice] = useState(null)
  const knownDeviceIdsRef = useRef(new Set())
  const currentTokenRef = useRef(null)

  useEffect(() => {
    setDevices(initialDevices)
  }, [initialDevices])

  useEffect(() => {
    if (!isAddPanelOpen) return
    let cancelled = false
    let controller = null

    async function loadQr() {
      setQrStatus('loading')
      setPairedDevice(null)
      setDeviceId('')
      setDeviceName('')
      setStatusMessage('')
      knownDeviceIdsRef.current = new Set()
      currentTokenRef.current = null

      try {
        const res = await fetch('/api/pair/qr')
        const data = await res.json()
        if (!cancelled && data && data.qrDataUrl) {
          setQr(data)
          currentTokenRef.current = data.token
          knownDeviceIdsRef.current = new Set(devices.map(d => d.deviceId))
          setQrStatus('ready')
        } else if (!cancelled) {
          setQrStatus('error')
        }
      } catch (e) {
        if (!cancelled) setQrStatus('error')
      }
    }

    loadQr()

    return () => {
      cancelled = true
      if (controller) controller.abort()
    }
  }, [isAddPanelOpen])

   useEffect(() => {
     if (!isAddPanelOpen || qrStatus !== 'ready') return

     const token = currentTokenRef.current
     if (!token) return

     const matchedDevice = devices.find(d => d.lastPairedToken === token)
     if (matchedDevice) {
       setPairedDevice(matchedDevice)
       setDeviceId(matchedDevice.deviceId)
       setDeviceName(matchedDevice.deviceName || matchedDevice.deviceId)
       setQrStatus('connected')
       setStatusMessage(`Paired ${matchedDevice.deviceId}`)
       return
     }
   }, [devices, isAddPanelOpen, qrStatus])

  async function handleDisconnect() {
    const pairedDeviceId = pairedDevice?.deviceId || deviceId
    setPairedDevice(null)
    setDeviceId('')
    setDeviceName('')
    setStatusMessage('')
    knownDeviceIdsRef.current = new Set(devices.map(d => d.deviceId))
    currentTokenRef.current = null

    setQrStatus('loading')
    try {
      if (pairedDeviceId) {
        await fetch('/api/pair/unpair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: pairedDeviceId }),
        })
      }
    } catch (e) {
      console.error('Unpair failed', e)
    }

    try {
      const res = await fetch('/api/pair/qr')
      const data = await res.json()
      if (data && data.qrDataUrl) {
        setQr(data)
        currentTokenRef.current = data.token
        setQrStatus('ready')
      } else {
        setQrStatus('error')
      }
    } catch (e) {
      setQrStatus('error')
    }
  }

  function handleCancel() {
    handleDisconnect()
  }

  async function handleRetry() {
    setQrStatus('loading')
    try {
      const res = await fetch('/api/pair/qr')
      const data = await res.json()
      if (data && data.qrDataUrl) {
        setQr(data)
        currentTokenRef.current = data.token
        knownDeviceIdsRef.current = new Set(devices.map(d => d.deviceId))
        setQrStatus('ready')
      } else {
        setQrStatus('error')
      }
    } catch (e) {
      setQrStatus('error')
    }
  }

  const qrDisabled = qrStatus === 'connecting' || qrStatus === 'connected'

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
                  <tr>                  <td colSpan="4" className="empty-state">
                    <div className="empty-state-inner">
                      <Icon name="devices" />
                      <span>No devices registered. Use the QR pairing panel to add one.</span>
                    </div>
                  </td></tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.deviceId}>
                      <td><b>{device.deviceName}</b></td>
                      <td>{formatDateTime(device.registeredAt)}</td>
                      <td>{formatDateTime(device.lastSeenAt)}</td>
                      <td><span className={`status-badge ${getDeviceStatus(device).toLowerCase()}`}>{getDeviceStatus(device)}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="devices-add-panel">
          <div className="qr-pair-body">
            <div
              className="camera-placeholder"
              aria-live="polite"
              aria-label={qrStatus === 'connected' ? 'Device connected' : qrStatus === 'connecting' ? 'Waiting for device' : 'QR pairing'}
            >
              {qr && qr.qrDataUrl ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <img
                    src={qr.qrDataUrl}
                    alt="Pairing QR"
                    style={{
                      display: 'block',
                      width: '100%',
                      height: 'auto',
                      borderRadius: '20px',
                      opacity: qrDisabled ? 0.25 : 1,
                      transition: 'opacity 0.3s ease',
                    }}
                  />
                  {(qrStatus === 'connecting' || qrStatus === 'connected') && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 14,
                      borderRadius: '20px',
                    }}>
                      {qrStatus === 'connecting' && (
                        <>
                          <div className="qr-spinner" />
                          <span className="qr-overlay-label">Waiting for device...</span>
                        </>
                      )}
                      {qrStatus === 'connected' && (
                        <>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span className="qr-overlay-label">Device connected</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : qrStatus === 'error' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <span className="camera-label" style={{ color: 'var(--color-danger)' }}>Failed to load QR</span>
                  <button className="pair-retry-button" onClick={handleRetry}>Retry</button>
                </div>
              ) : (
                <span className="camera-label">Generating QR...</span>
              )}
            </div>
            <div className="qr-pair-form">
              <div className="form-field">
                <label className="form-label">Device ID</label>
                <input
                  className="form-input"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="Device ID"
                  readOnly
                  disabled={qrDisabled}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Device Name</label>
                <input
                  className="form-input"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="Device Name"
                  readOnly
                  disabled={qrDisabled}
                />
              </div>
              {statusMessage && <p className="qr-status">{statusMessage}</p>}
            </div>
            {qrStatus === 'connected' && (
              <button className="pair-disconnect-button" onClick={handleDisconnect}>
                Disconnect
              </button>
            )}
            {qrStatus === 'connecting' && (
              <button className="pair-cancel-button" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
