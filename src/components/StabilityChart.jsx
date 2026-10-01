import { useMemo, useState } from 'react'
import { months, fullMonths } from '../utils.js'

export default function StabilityChart({ logs }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const monthly = useMemo(() => {
    const dates = logs.map(({ scannedAt }) => new Date(scannedAt)).filter(d => !Number.isNaN(d.valueOf()))
    const mostRecent = dates.length > 0 ? new Date(Math.max(...dates)) : new Date()
    const windowMonths = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(mostRecent.getFullYear(), mostRecent.getMonth() - i, 1)
      windowMonths.push({ year: d.getFullYear(), month: d.getMonth(), label: months[d.getMonth()], fullLabel: fullMonths[d.getMonth()] })
    }
    return windowMonths.map(({ year, month, label, fullLabel }) => {
      const scans = logs.filter(({ scannedAt }) => {
        const date = new Date(scannedAt)
        return !Number.isNaN(date.valueOf()) && date.getFullYear() === year && date.getMonth() === month
      })
      return {
        low: scans.filter(({ assessment }) => assessment === 'low').length,
        moderate: scans.filter(({ assessment }) => assessment === 'moderate').length,
        high: scans.filter(({ assessment }) => assessment === 'high').length,
        scans,
        label,
        fullLabel,
      }
    })
  }, [logs])

  const maxValue = 100
  const points = monthly.map(({ low, moderate, high }, index) => ({
    x: 34 + index * 53.3,
    lowY: 175 - (low / maxValue) * 150,
    moderateY: 175 - (moderate / maxValue) * 150,
    highY: 175 - (high / maxValue) * 150,
  }))

  const linePath = (key) => points.reduce((path, point, index) => {
    const y = point[key] || 175
    if (index === 0) return `M${point.x} ${y}`
    return `${path} L${point.x} ${y}`
  }, '')

  const tooltipData = hoveredPoint === null ? null : (() => {
    const { monthIndex, assessment } = hoveredPoint
    const p = points[monthIndex]
    const y = p[`${assessment}Y`]
    return {
      x: p.x,
      y,
      value: monthly[monthIndex][assessment],
      assessment,
      month: monthly[monthIndex].fullLabel,
    }
  })()

  return (
    <svg
      className="reference-chart"
      onMouseLeave={() => setHoveredPoint(null)}
      viewBox="0 0 640 210"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Low, moderate, and high stability assessment trend"
    >
      <g className="reference-grid">
        <path d="M34 25H620M34 55H620M34 85H620M34 115H620M34 145H620M34 175H620" />
      </g>
      <g className="reference-axis">
        <text x="3" y="29">100</text>
        <text x="3" y="59">80</text>
        <text x="3" y="89">60</text>
        <text x="3" y="119">40</text>
        <text x="3" y="149">20</text>
        <text x="8" y="179">0</text>
        {monthly.map(({ label }, index) => (
          <text key={label + index} x={34 + index * 53.3} y="199" textAnchor={index === 0 ? 'start' : index === 11 ? 'end' : 'middle'}>
            {label}
          </text>
        ))}
      </g>
      <path className="reference-line low-line" d={linePath('lowY')} />
      <path className="reference-line moderate-line" d={linePath('moderateY')} />
      <path className="reference-line high-line" d={linePath('highY')} />
      {points.map((item, index) => (
        <g className="chart-point" key={months[index]}>
          <circle className="data-point low-data-point" cx={item.x} cy={item.lowY} r="3.5" />
          <circle className="data-point moderate-data-point" cx={item.x} cy={item.moderateY} r="3.5" />
          <circle className="data-point high-data-point" cx={item.x} cy={item.highY} r="3.5" />
          <circle className="hover-target" cx={item.x} cy={item.lowY} r="10" onMouseEnter={() => setHoveredPoint({ monthIndex: index, assessment: 'low' })} />
          <circle className="hover-target" cx={item.x} cy={item.moderateY} r="10" onMouseEnter={() => setHoveredPoint({ monthIndex: index, assessment: 'moderate' })} />
          <circle className="hover-target" cx={item.x} cy={item.highY} r="10" onMouseEnter={() => setHoveredPoint({ monthIndex: index, assessment: 'high' })} />
          {hoveredPoint !== null && hoveredPoint.monthIndex === index && (
            <circle className={`reference-marker-dot ${hoveredPoint.assessment}-marker-dot`} cx={item.x} cy={item[`${hoveredPoint.assessment}Y`]} r="4" />
          )}
        </g>
      ))}
      {tooltipData && (
        <>
          <line className="reference-marker" x1={tooltipData.x} y1="18" x2={tooltipData.x} y2="175" />
          <g className="reference-tooltip" transform={`translate(${Math.max(48, Math.min(592, tooltipData.x))}, ${Math.max(2, tooltipData.y - 92)})`}>
            <rect x="-40" y="0" width="80" height="36" rx="6" />
            <text className="tooltip-date" x="0" y="14" textAnchor="middle">{tooltipData.month}</text>
            <circle className={`${tooltipData.assessment}-dot`} cx="-12" cy="26" r="3" />
            <text x="-8" y="30" textAnchor="start">{tooltipData.value}</text>
          </g>
        </>
      )}
    </svg>
  )
}