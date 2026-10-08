import { useMemo, useState } from 'react'
import { months, fullMonths } from '../utils.js'

export default function StabilityChart({ logs, onHover, hiddenAssessments }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const hoveredAssessment = hoveredPoint?.assessment || null
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

  const areaPath = (key) => {
    const line = linePath(key)
    const firstX = points[0].x
    const lastX = points[points.length - 1].x
    return `${line} L${lastX} 175 L${firstX} 175 Z`
  }

  const getOpacity = (assessment) => {
    if (hiddenAssessments?.includes(assessment)) return 0.08
    if (hoveredAssessment === null) return 1
    return hoveredAssessment === assessment ? 1 : 0.25
  }

  const isLineActive = (assessment) => hoveredAssessment === assessment && !hiddenAssessments?.includes(assessment)

  return (
    <svg
      className="reference-chart"
      onMouseLeave={() => { setHoveredPoint(null); onHover?.(null) }}
      viewBox="0 0 640 210"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Low, moderate, and high stability assessment trend"
    >
      <defs>
        <linearGradient id="lowGradient" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0f332e" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="moderateGradient" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#b8df72" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0f332e" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="highGradient" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#00df81" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0f332e" stopOpacity="1" />
        </linearGradient>
      </defs>
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
      <path className="area-fill low-area" d={areaPath('lowY')} style={{ opacity: getOpacity('low') }} />
      <path className="area-fill moderate-area" d={areaPath('moderateY')} style={{ opacity: getOpacity('moderate') }} />
      <path className="area-fill high-area" d={areaPath('highY')} style={{ opacity: getOpacity('high') }} />
      <path className={`reference-line low-line${isLineActive('low') ? ' active' : ''}`} d={linePath('lowY')} style={{ opacity: getOpacity('low') }} />
      <path className={`reference-line moderate-line${isLineActive('moderate') ? ' active' : ''}`} d={linePath('moderateY')} style={{ opacity: getOpacity('moderate') }} />
      <path className={`reference-line high-line${isLineActive('high') ? ' active' : ''}`} d={linePath('highY')} style={{ opacity: getOpacity('high') }} />
      {points.map((item, index) => (
        <g className="chart-point" key={months[index]}>
          {hoveredPoint !== null && hoveredPoint.monthIndex === index && isLineActive(hoveredPoint.assessment) && (
            <circle className={`point-halo ${hoveredPoint.assessment}-halo`} cx={item.x} cy={item[`${hoveredPoint.assessment}Y`]} r="8" />
          )}
          <circle className="data-point low-data-point" cx={item.x} cy={item.lowY} r={isLineActive('low') ? 5 : 3.5} style={{ opacity: getOpacity('low') }} />
          <circle className="data-point moderate-data-point" cx={item.x} cy={item.moderateY} r={isLineActive('moderate') ? 5 : 3.5} style={{ opacity: getOpacity('moderate') }} />
          <circle className="data-point high-data-point" cx={item.x} cy={item.highY} r={isLineActive('high') ? 5 : 3.5} style={{ opacity: getOpacity('high') }} />
          <circle className="hover-target" cx={item.x} cy={item.lowY} r="10" style={{ pointerEvents: hiddenAssessments?.includes('low') ? 'none' : 'all' }} onMouseEnter={() => { const d = { monthIndex: index, assessment: 'low', month: monthly[index].fullLabel, value: monthly[index].low }; setHoveredPoint({ monthIndex: index, assessment: 'low' }); onHover?.(d) }} />
          <circle className="hover-target" cx={item.x} cy={item.moderateY} r="10" style={{ pointerEvents: hiddenAssessments?.includes('moderate') ? 'none' : 'all' }} onMouseEnter={() => { const d = { monthIndex: index, assessment: 'moderate', month: monthly[index].fullLabel, value: monthly[index].moderate }; setHoveredPoint({ monthIndex: index, assessment: 'moderate' }); onHover?.(d) }} />
          <circle className="hover-target" cx={item.x} cy={item.highY} r="10" style={{ pointerEvents: hiddenAssessments?.includes('high') ? 'none' : 'all' }} onMouseEnter={() => { const d = { monthIndex: index, assessment: 'high', month: monthly[index].fullLabel, value: monthly[index].high }; setHoveredPoint({ monthIndex: index, assessment: 'high' }); onHover?.(d) }} />
          {hoveredPoint !== null && hoveredPoint.monthIndex === index && (
            <circle className={`reference-marker-dot ${hoveredPoint.assessment}-marker-dot`} cx={item.x} cy={item[`${hoveredPoint.assessment}Y`]} r="4" />
          )}
        </g>
      ))}
    </svg>
  )
}