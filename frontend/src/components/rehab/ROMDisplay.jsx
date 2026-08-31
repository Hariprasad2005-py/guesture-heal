import React from "react";

/**
 * Real-time Range-of-Motion gauge for CloudReach.
 * Number + arc are always shown together — never color alone — so it
 * stays colorblind-safe and reads clearly at a glance for elderly patients.
 */

const MAX_DISPLAY_ANGLE = 150; // degrees; clamps the arc, not the number

export default function ROMDisplay({ angle = 0, targetAngle = null, label = "Range of Motion" }) {
  const clampedAngle = Math.max(0, Math.min(MAX_DISPLAY_ANGLE, angle));
  const percent = clampedAngle / MAX_DISPLAY_ANGLE;

  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const offset = arcLength * (1 - percent);
  const rotation = -225;

  const targetPercent = targetAngle != null ? Math.max(0, Math.min(1, targetAngle / MAX_DISPLAY_ANGLE)) : null;
  const targetRotation = targetPercent != null ? rotation + arcLength * targetPercent * (360 / circumference) : null;

  return (
    <div
      className="flex flex-col items-center justify-center bg-white rounded-2xl border border-[#D6E4EF] shadow-sm px-4 py-3"
      role="img"
      aria-label={`${label}: ${Math.round(angle)} degrees${targetAngle != null ? `, target ${Math.round(targetAngle)} degrees` : ""}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="#EBF5FB" strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="#2E86C1" strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 300ms ease-out" }}
          />
          {targetRotation != null && (
            <circle
              cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke="#27AE60" strokeWidth={strokeWidth + 4}
              strokeDasharray={`2 ${circumference}`}
              strokeLinecap="round"
              transform={`rotate(${targetRotation} ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-[#1A5276] leading-none">{Math.round(angle)}°</span>
        </div>
      </div>
      <span className="mt-2 text-base font-medium text-[#5D6D7E] text-center">{label}</span>
      {targetAngle != null && (
        <span className="text-sm text-[#27AE60] font-medium">Goal: {Math.round(targetAngle)}°</span>
      )}
    </div>
  );
}