// frontend/src/components/rehab/MetricsChart.jsx
import React from 'react';

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

  const maxVal = Math.max(...data.map(d => d[yKey] || 0), 1);
  const minVal = Math.min(...data.map(d => d[yKey] || 0), 0);
  const range = maxVal - minVal || 1;
  const padding = 0.1;
  const paddedRange = range * (1 + padding * 2);
  const yMin = Math.max(0, minVal - range * padding);
  const yMax = maxVal + range * padding;

  const getY = (val) => height - ((val - yMin) / (yMax - yMin)) * height * 0.9 - 10;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = getY(d[yKey] || 0);
    return `${x},${y}`;
  }).join(' ');

  const successPoints = data.filter(d => d.success !== false).map((d, i) => {
    const x = (data.indexOf(d) / (data.length - 1 || 1)) * 100;
    const y = getY(d[yKey] || 0);
    return { x, y };
  });

  const failPoints = data.filter(d => d.success === false).map((d, i) => {
    const x = (data.indexOf(d) / (data.length - 1 || 1)) * 100;
    const y = getY(d[yKey] || 0);
    return { x, y };
  });

  return (
    <div className="relative w-full" style={{ height: height + 40 }}>
      <svg className="w-full h-full" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - ratio * height * 0.9 - 10;
          const val = yMin + ratio * (yMax - yMin);
          return (
            <g key={ratio}>
              <line
                x1="0"
                y1={y}
                x2="100%"
                y2={y}
                stroke="#1e293b"
                strokeWidth="0.5"
                strokeDasharray="4 4"
              />
              <text
                x="0"
                y={y}
                dy="-4"
                className="text-[10px] fill-slate-500"
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
          points={`0,${height} ${points} ${100},${height}`}
          fill={color}
          opacity="0.1"
        />

        {/* Success points (green) */}
        {successPoints.map((p, i) => (
          <circle
            key={`success-${i}`}
            cx={`${p.x}%`}
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
            cx={`${p.x}%`}
            cy={p.y}
            r="4"
            fill="#ef4444"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        {data.length > 0 && (
          <>
            <span>Rep 1</span>
            <span>Rep {Math.floor(data.length / 2)}</span>
            <span>Rep {data.length}</span>
          </>
        )}
      </div>
    </div>
  );
}