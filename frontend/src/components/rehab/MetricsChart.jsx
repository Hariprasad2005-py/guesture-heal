// frontend/src/components/rehab/MetricsChart.jsx
import React from 'react';

// Reserved space (in SVG user units, matching the viewBox below) so
// y-axis number labels and x-axis rep labels have somewhere to render
// that isn't on top of the plotted line/points.
const LEFT_AXIS_WIDTH = 34;
const BOTTOM_AXIS_HEIGHT = 20;
const RIGHT_MARGIN = 8;
const TOP_MARGIN = 10;

// Fixed internal coordinate width for the chart's viewBox. Actual
// on-screen size is whatever CSS gives the container — the viewBox is
// what makes that mapping well-defined, which is exactly what was
// missing before (no viewBox meant point positions and axis label
// positions had no guaranteed relationship to the rendered box, which
// is why the y-axis labels were collapsing onto a single line).
const CHART_VIEW_WIDTH = 600;

export default function MetricsChart({
  data,
  xKey = 'rep',
  yKey = 'romDegrees',
  label = 'Value',
  color = '#22d3ee',
  height = 200,
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        No data available
      </div>
    );
  }

  const viewHeight = height + TOP_MARGIN + BOTTOM_AXIS_HEIGHT;
  const plotWidth = CHART_VIEW_WIDTH - LEFT_AXIS_WIDTH - RIGHT_MARGIN;

  const maxVal = Math.max(...data.map((d) => d[yKey] || 0), 1);
  const minVal = Math.min(...data.map((d) => d[yKey] || 0), 0);
  const range = maxVal - minVal || 1;
  const padding = 0.1;
  const yMin = Math.max(0, minVal - range * padding);
  const yMax = maxVal + range * padding;

  // getX/getY both return coordinates in the SAME user-unit space the
  // viewBox declares, so points, gridlines, and axis labels all line up
  // regardless of how large or small the chart is actually rendered.
  const getX = (i) =>
    LEFT_AXIS_WIDTH + (i / (data.length - 1 || 1)) * plotWidth;
  const getY = (val) =>
    TOP_MARGIN + height - ((val - yMin) / (yMax - yMin)) * height;

  const points = data
    .map((d, i) => `${getX(i)},${getY(d[yKey] || 0)}`)
    .join(' ');

  const successPoints = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.success !== false)
    .map(({ d, i }) => ({ x: getX(i), y: getY(d[yKey] || 0) }));

  const failPoints = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.success === false)
    .map(({ d, i }) => ({ x: getX(i), y: getY(d[yKey] || 0) }));

  return (
    <div className="relative w-full" style={{ height: viewHeight }}>
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${CHART_VIEW_WIDTH} ${viewHeight}`}
        preserveAspectRatio="none"
      >
        {/* Grid lines + y-axis labels, anchored to the reserved left
            margin so they never overlap the plotted line/points. */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = TOP_MARGIN + height - ratio * height;
          const val = yMin + ratio * (yMax - yMin);
          return (
            <g key={ratio}>
              <line
                x1={LEFT_AXIS_WIDTH}
                y1={y}
                x2={CHART_VIEW_WIDTH - RIGHT_MARGIN}
                y2={y}
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={LEFT_AXIS_WIDTH - 8}
                y={y}
                dy="3"
                textAnchor="end"
                fontSize="10"
                className="fill-slate-500"
                style={{ fontFamily: 'monospace' }}
              >
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />

        {/* Fill area */}
        <polygon
          points={`${LEFT_AXIS_WIDTH},${TOP_MARGIN + height} ${points} ${CHART_VIEW_WIDTH - RIGHT_MARGIN},${TOP_MARGIN + height}`}
          fill={color}
          opacity="0.1"
        />

        {/* Success points (green) */}
        {successPoints.map((p, i) => (
          <circle
            key={`success-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#22c55e"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}

        {/* Fail points (red) */}
        {failPoints.map((p, i) => (
          <circle
            key={`fail-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#ef4444"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}

        {/* X-axis labels — one per actual data point, positioned
            directly under its plotted point using the real xKey value
            (e.g. rep 1..5), not a hardcoded first/middle/last subset. */}
        {data.map((d, i) => (
          <text
            key={`x-label-${i}`}
            x={getX(i)}
            y={viewHeight - 4}
            textAnchor="middle"
            fontSize="10"
            className="fill-slate-500"
            style={{ fontFamily: 'monospace' }}
          >
            {`${xKey === 'rep' ? 'Rep ' : ''}${d[xKey]}`}
          </text>
        ))}
      </svg>
    </div>
  );
}