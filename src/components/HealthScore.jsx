import { useMemo } from 'react'

export default function HealthScore({ logs }) {
  const score = useMemo(() => {
    const validLogs = logs.filter((scan) => ['high', 'moderate', 'low'].includes(scan.assessment))
    if (validLogs.length === 0) {
      return { value: 0, color: '#b5c7bd', status: 'No scan data yet', description: 'Complete a field scan to calculate coastal resilience.' }
    }
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
  return (
    <article className="score-card">
      <div>
        <p className="label">STABILITY CHART</p>
        <h2 style={{ color: score.color }}>{score.status}</h2>
        <p className="muted">{score.description}</p>
      </div>
      <div className="gauge">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="45" />
          <circle className="gauge-arc" cx="60" cy="60" r="45" style={{ strokeDashoffset: dashOffset, stroke: score.color }} />
        </svg>
        <strong>
          {score.value}
          <span>%</span>
        </strong>
      </div>
    </article>
  )
}
