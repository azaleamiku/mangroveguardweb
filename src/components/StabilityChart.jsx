import { useMemo, useState } from 'react'
import { months, fullMonths } from '../utils.js'

export default function StabilityChart({ logs }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const monthly = useMemo(() => months.map((_, monthIndex) => {
    const scans = logs.filter(({ scannedAt }) => {
      const date = new Date(scannedAt)
      return !Number.isNaN(date.valueOf()) && date.getMonth() === monthIndex
    })
    return {
      low: scans.filter(({ assessment }) => assessment === 'low').length,
      moderate: scans.filter(({ assessment }) => assessment === 'moderate').length,
      high: scans.filter(({ assessment }) => assessment === 'high').length,
      scans,
    }
  }), [logs])

  const maxValue = Math.max(100, Math.ceil(Math.max(...monthly.map(({ low, moderate, high }) => Math.max(low, moderate, high)), 0) / 10) * 10)
  const points = monthly.map(({ low, moderate, high }, index) => ({
    x: 34 + index * 53.3,
    lowY: 175 - (low / maxValue) * 150,
    moderateY: 175 - (moderate / maxValue) * 150,
    highY: 175 - (high / maxValue) * 150,
  }))

  const linePath = (key) => points.reduce((path, point, index) => {
    const y = point[key] || 175
    if (index === 0) return `M${point.x} ${y}`
    const previous = points[index - 1]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C${midpoint} ${previous[key] || 175}, ${midpoint} ${y}, ${point.x} ${y}`
  }, '')

  const areaPath = (key) => `${linePath(key)} L620 175 L34 175Z`
  const point = hoveredIndex === null ? null : points[hoveredIndex]
  const tooltipY = point ? Math.max(2, Math.min(96, Math.min(point.lowY, point.moderateY, point.highY) - 92)) : 2
  const tooltipX = point ? Math.max(65, Math.min(575, point.x)) : 34
  const tooltipDate = hoveredIndex === null ? '' : fullMonths[hoveredIndex]
  const hovered = hoveredIndex === null ? null : monthly[hoveredIndex]

  return (
    <svg
      className="reference-chart"
      onMouseLeave={() => setHoveredIndex(null)}
      viewBox="0 0 640 210"
      preserveAspectRatio="none"
      role="img"
      aria-label="Low, moderate, and high stability assessment trend"
    >
      <defs>
        <linearGradient id="lowFill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--color-danger)" stopOpacity=".32" />
          <stop offset="1" stopColor="var(--color-danger)" stopOpacity=".03" />
        </linearGradient>
      </defs>
      <g className="reference-grid">
        <path d="M34 25H620M34 55H620M34 85H620M34 115H620M34 145H620M34 175H620" />
      </g>
      <g className="reference-axis">
        <text x="3" y="29">{maxValue}</text>
        <text x="3" y="59">{Math.round(maxValue * .8)}</text>
        <text x="3" y="89">{Math.round(maxValue * .6)}</text>
        <text x="3" y="119">{Math.round(maxValue * .4)}</text>
        <text x="3" y="149">{Math.round(maxValue * .2)}</text>
        <text x="8" y="179">0</text>
        {months.map((monthName, index) => (
          <text key={monthName} x={34 + index * 53.3} y="199" textAnchor={index === 0 ? 'start' : index === 11 ? 'end' : 'middle'}>
            {monthName}
          </text>
        ))}
      </g>
      <path className="reference-area low-area" d={areaPath('lowY')} />
      <path className="reference-line low-line" d={linePath('lowY')} />
      <path className="reference-line moderate-line" d={linePath('moderateY')} />
      <path className="reference-line high-line" d={linePath('highY')} />
      {points.map((item, index) => (
        <g className="chart-point" key={months[index]} onMouseEnter={() => setHoveredIndex(index)}>
          <circle className="hover-target" cx={item.x} cy={item.lowY} r="10" />
          <circle className="hover-target" cx={item.x} cy={item.moderateY} r="10" />
          <circle className="hover-target" cx={item.x} cy={item.highY} r="10" />
          {hoveredIndex === index && (
            <>
              <circle className="reference-marker-dot low-marker-dot" cx={item.x} cy={item.lowY} r="4" />
              <circle className="reference-marker-dot moderate-marker-dot" cx={item.x} cy={item.moderateY} r="4" />
              <circle className="reference-marker-dot high-marker-dot" cx={item.x} cy={item.highY} r="4" />
            </>
          )}
        </g>
      ))}
      {point && (
        <>
          <line className="reference-marker" x1={point.x} y1="18" x2={point.x} y2="175" />
          <g className="reference-tooltip" transform={`translate(${tooltipX}, ${tooltipY})`}>
            <rect x="-65" y="0" width="130" height="52" rx="6" />
            <text className="tooltip-date" x="0" y="16" textAnchor="middle">{tooltipDate}</text>
            <circle className="low-dot" cx="-42" cy="32" r="3" />
            <text x="-38" y="36" textAnchor="start">{hovered.low}</text>
            <circle className="moderate-dot" cx="-8" cy="32" r="3" />
            <text x="-4" y="36" textAnchor="start">{hovered.moderate}</text>
            <circle className="high-dot" cx="26" cy="32" r="3" />
            <text x="30" y="36" textAnchor="start">{hovered.high}</text>
          </g>
        </>
      )}
    </svg>
  )
}
