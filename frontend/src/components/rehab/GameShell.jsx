// Shared full-screen game layout: themed stage, slim glass top bar, small
// camera picture in the corner. Used by the games so every game has the
// same big play area instead of a small box beside a big camera.
import { Pause, Play, X } from "lucide-react";
import SkeletonOverlay from "./SkeletonOverlay";
import StageBackdrop, { STAGE_THEMES } from "./StageBackdrop";

export default function GameShell({ offset = 100, theme = 0, dim = 0, backdrop = null, children }) {
  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#0B1120] text-white"
      style={{ paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}
    >
      <div className="absolute inset-0 overflow-hidden" style={{ top: offset }}>
        {backdrop || <StageBackdrop theme={theme} dim={dim} />}
        {children}
      </div>
    </div>
  );
}

export function StageTopBar({ children, isPaused, onPause, onResume, onEnd }) {
  return (
    <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-2 border-b border-white/15 bg-slate-950/70 px-3 py-2 backdrop-blur sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs font-semibold text-white sm:text-sm">{children}</div>
      <div className="flex flex-shrink-0 gap-2">
        <button onClick={isPaused ? onResume : onPause} className="rounded-lg bg-white/15 p-2 hover:bg-white/25" aria-label={isPaused ? "Resume" : "Pause"}>
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button onClick={onEnd} className="rounded-lg bg-red-500/30 p-2 hover:bg-red-500/50" aria-label="End session">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function CameraPip({ videoRef, poseData, guidance, shoulderAngle, label, corner = "br", className = "" }) {
  return (
    <div className={`absolute z-40 h-24 w-36 overflow-hidden rounded-xl border-2 border-white/80 shadow-lg sm:h-36 sm:w-52 ${corner === "tr" ? "right-2 top-14 sm:right-4" : "bottom-2 right-2 sm:bottom-4 sm:right-4"} ${className}`}>
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
      <SkeletonOverlay poseData={poseData} overallStatus={guidance?.overallStatus} shoulderAngle={shoulderAngle} />
      {label && <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] sm:text-xs">{label}</div>}
    </div>
  );
}

// Big "use your LEFT/RIGHT hand" prompt, coloured like Cloud Reach
// (cyan = left, orange = right).
export function HandBanner({ hand }) {
  if (hand !== "left" && hand !== "right") return null;
  const left = hand === "left";
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-full px-5 py-1.5 text-sm font-black text-white shadow-lg sm:text-base"
      style={{ background: left ? "#0891b2" : "#ea580c" }}
    >
      {left ? "✋ Use your LEFT hand" : "Use your RIGHT hand ✋"}
    </div>
  );
}

export { STAGE_THEMES };
