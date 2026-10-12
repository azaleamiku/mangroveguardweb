import { useMemo, useState } from 'react'

const DONUT_SIZE = 180
const DONUT_CENTER = DONUT_SIZE / 2
const DONUT_RADIUS = 68
const SEGMENT_GAP = 20
const BADGE_HEIGHT = 20
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS
const round = (value) => Number(value.toFixed(2))

const CATEGORY_COLORS = {
  high: 'var(--color-accent)',
  moderate: 'var(--color-warning)',
  low: 'var(--color-danger)',
}

const CATEGORIES = [
  { key: 'high', label: 'High' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'low', label: 'Low' },
]

export default function HealthScore({ logs }) {
  const [hoveredCategory, setHoveredCategory] = useState(null)

  const summary = useMemo(() => {
    const validLogs = logs.filter(({ assessment }) => ['high', 'moderate', 'low'].includes(assessment))
    const counts = CATEGORIES.reduce((totals, { key }) => ({
      ...totals,
      [key]: validLogs.filter(({ assessment }) => assessment === key).length,
    }), {})
    const ranked = [...CATEGORIES].sort((a, b) => counts[b.key] - counts[a.key])
    if (validLogs.length === 0) {
      return {
        total: 0,
        counts,
        ranked,
        status: 'No scan data yet',
        description: 'Complete a field scan to calculate coastal resilience.',
        dominantKey: null,
      }
    }
    const dominant = ranked[0]
    const dominantCount = counts[dominant.key]
    const verb = dominantCount === 1 ? 'shows' : 'show'
    return {
      total: validLogs.length,
      counts,
      ranked,
      status: `${dominant.label} Stability Overall`,
      description: `${dominantCount} of ${validLogs.length} total scan${validLogs.length === 1 ? '' : 's'} ${verb} ${dominant.label.toLowerCase()} stability.`,
      dominantKey: dominant.key,
    }
  }, [logs])

  const active = summary.ranked.filter(({ key }) => summary.counts[key] > 0)
  const available = CIRCUMFERENCE - SEGMENT_GAP * active.length
  let cursor = SEGMENT_GAP / 2
  const segments = active.map((category) => {
    const fraction = summary.counts[category.key] / summary.total
    const length = Math.max(fraction * available, 0.75)
    const start = cursor
    const end = start + length
    cursor = end + SEGMENT_GAP
    const mid = start + length / 2
    const angle = (mid / CIRCUMFERENCE) * Math.PI * 2 - Math.PI / 2
    const percent = Math.round(fraction * 100)
    const badgeText = `${percent}%`
    const badgeWidth = round(badgeText.length * 7.6 + 16)
    const badgeX = round(DONUT_CENTER + DONUT_RADIUS * Math.cos(angle))
    const badgeY = round(DONUT_CENTER + DONUT_RADIUS * Math.sin(angle))
    return {
      ...category,
      color: CATEGORY_COLORS[category.key],
      count: summary.counts[category.key],
      length,
      percent,
      badgeText,
      badgeWidth,
      badgeX,
      badgeY,
      badgeRectX: round(badgeX - badgeWidth / 2),
      badgeRectY: round(badgeY - BADGE_HEIGHT / 2),
      dashArray: `${round(length)} ${round(CIRCUMFERENCE - length)}`,
      dashOffset: round(-start),
    }
  })

  // A badge is only legible when its neighbours are far enough away to avoid overlap.
  const showBadge = segments.map((segment, index) => {
    if (segments.length === 1) return true
    const previous = segments[(index - 1 + segments.length) % segments.length]
    const next = segments[(index + 1) % segments.length]
    const clearance = Math.min(
      (segment.length + previous.length) / 2 + SEGMENT_GAP,
      (segment.length + next.length) / 2 + SEGMENT_GAP,
    )
    return clearance >= segment.badgeWidth
  })

  const segmentByKey = new Map(segments.map((segment) => [segment.key, segment]))
  const hoveredSegment = hoveredCategory === null ? null : segmentByKey.get(hoveredCategory) || null
  const isDimmed = (key) => hoveredCategory !== null && hoveredCategory !== key
  const ariaLabel = summary.total === 0
    ? 'Stability distribution donut chart with no scan data yet'
    : `Stability distribution donut chart: ${segments.map(({ label, percent }) => `${percent}% ${label}`).join(', ')}`

  return (
    <article className="score-card">
      <div>
        <p className="label">STABILITY CHART</p>
        <h2 style={{ color: summary.dominantKey ? CATEGORY_COLORS[summary.dominantKey] : 'var(--color-text-muted)' }}>
          {summary.status}
        </h2>
        <p className="muted">{summary.description}</p>
        <ul className="donut-legend">
          {CATEGORIES.map(({ key, label }) => {
            const segment = segmentByKey.get(key)
            return (
              <li
                className={`donut-legend-item${hoveredCategory === key ? ' active' : ''}`}
                key={key}
                onMouseEnter={() => setHoveredCategory(key)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <i style={{ background: CATEGORY_COLORS[key] }} aria-hidden="true" />
                <span>{label}</span>
                <span className="donut-legend-value">{segment ? `${segment.percent}%` : '0%'}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="score-donut">
        <svg
          viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHoveredCategory(null)}
        >
          <defs>
            <filter id="donutBadgeShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#021b1a" floodOpacity="0.35" />
            </filter>
          </defs>
          <circle className="donut-track" cx={DONUT_CENTER} cy={DONUT_CENTER} r={DONUT_RADIUS} />
          <g transform={`rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`}>
            {segments.map((segment) => (
              <circle
                className={`donut-segment ${segment.key}${isDimmed(segment.key) ? ' dimmed' : ''}`}
                cx={DONUT_CENTER}
                cy={DONUT_CENTER}
                r={DONUT_RADIUS}
                key={segment.key}
                style={{ stroke: segment.color, strokeDasharray: segment.dashArray, strokeDashoffset: segment.dashOffset }}
                onMouseEnter={() => setHoveredCategory(segment.key)}
              />
            ))}
          </g>
          {segments.map((segment, index) => (
            showBadge[index] && (
              <g
                className={`donut-badge ${segment.key}${isDimmed(segment.key) ? ' dimmed' : ''}`}
                key={`${segment.key}-badge`}
                onMouseEnter={() => setHoveredCategory(segment.key)}
              >
                <rect
                  filter="url(#donutBadgeShadow)"
                  height={BADGE_HEIGHT}
                  rx={BADGE_HEIGHT / 2}
                  style={{ stroke: segment.color }}
                  width={segment.badgeWidth}
                  x={segment.badgeRectX}
                  y={segment.badgeRectY}
                />
                <text dominantBaseline="central" textAnchor="middle" x={segment.badgeX} y={segment.badgeY}>
                  {segment.badgeText}
                </text>
              </g>
            )
          ))}
        </svg>
        <div className={`donut-center${hoveredSegment ? ' is-hovering' : ''}`}>
          <span aria-hidden={hoveredSegment ? 'true' : undefined} className="donut-logo-badge">
            <img alt="" className="donut-logo" src="/mangroveguard-logo.png" />
          </span>
          <div aria-hidden={hoveredSegment ? undefined : 'true'} className="donut-readout">
            {hoveredSegment && (
              <>
                <strong>{hoveredSegment.count}</strong>
                <span>{hoveredSegment.label}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
