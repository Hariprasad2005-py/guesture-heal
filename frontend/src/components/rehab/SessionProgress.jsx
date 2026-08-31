import React from "react";

/**
 * Session-level progress: reps completed and time remaining. Optional
 * props (dayNumber/totalDays/romImprovementDegrees) are simply omitted
 * from the UI when not supplied, rather than shown as a misleading 0.
 */

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export default function SessionProgress({
  repsCompleted = 0,
  totalReps = 0,
  secondsRemaining = 0,
  dayNumber = null,
  totalDays = null,
  romImprovementDegrees = null,
}) {
  const repPercent = totalReps > 0 ? Math.min(100, Math.round((repsCompleted / totalReps) * 100)) : 0;

  return (
    <div className="bg-white rounded-2xl border border-[#D6E4EF] shadow-sm px-4 py-3 w-full">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        {dayNumber != null && totalDays != null && (
          <span className="text-base font-semibold text-[#1A5276]">Day {dayNumber} of {totalDays}</span>
        )}
        <span className="text-base text-[#5D6D7E]">{formatMMSS(secondsRemaining)} remaining</span>
      </div>

      <div
        className="w-full h-4 rounded-full bg-[#EBF5FB] overflow-hidden"
        role="progressbar"
        aria-valuenow={repPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${repsCompleted} of ${totalReps} reps completed`}
      >
        <div className="h-full bg-[#27AE60] rounded-full transition-all duration-300" style={{ width: `${repPercent}%` }} />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-base font-medium text-[#2C3E50]">Reps: {repsCompleted} / {totalReps}</span>
        {romImprovementDegrees != null && (
          <span className={`text-base font-medium ${romImprovementDegrees >= 0 ? "text-[#27AE60]" : "text-[#5D6D7E]"}`}>
            {romImprovementDegrees >= 0 ? "+" : ""}{Math.round(romImprovementDegrees)}° vs last session
          </span>
        )}
      </div>
    </div>
  );
}