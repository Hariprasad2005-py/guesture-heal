// "Hand check" card on the start screen of the hand games: shows live whether the camera can see the chosen hand
// and how each finger reads, so the player (and therapist) can see tracking works before starting.
import { FINGER_NAMES } from "../../utils/handInput";

const LABEL = { thumb: "Thumb", index: "Index", middle: "Middle", ring: "Ring", pinky: "Little" };

export default function HandCheck({ hand, side, error, ready, accent = "#22d3ee" }) {
  const found = !!hand?.present;
  return (
    <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-white">Hand check</div>
        <div className={`rounded-full px-3 py-1 text-xs font-extrabold ${found ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
          {error ? "Hand tracker could not start" : !ready ? "Loading hand tracker..." : found ? `✓ ${side === "left" ? "Left" : "Right"} hand found` : `Show your ${side} hand to the camera`}
        </div>
      </div>
      {error && <p className="mb-2 text-xs text-red-300">{error}. Check your internet connection and refresh the page.</p>}
      <p className="mb-3 text-xs text-slate-400">Hold your {side} hand up in front of the camera, palm facing it, fingers a little apart. The coloured skeleton on the camera picture below should sit on your hand. Open and close it to see the bars move.</p>
      <div className="grid grid-cols-5 gap-3">
        {FINGER_NAMES.map((n) => {
          const v = found ? hand.curl[n] : 0;
          return (
            <div key={n} className="text-center">
              <div className="mx-auto h-16 w-5 overflow-hidden rounded-full bg-slate-800">
                <div className="w-full rounded-full" style={{ height: `${Math.max(6, v * 100)}%`, marginTop: `${100 - Math.max(6, v * 100)}%`, background: accent }} />
              </div>
              <div className="mt-1 text-[11px] font-bold text-slate-300">{LABEL[n]}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-slate-400">
        <span>Grip {found ? Math.round(hand.grip * 100) : 0}%</span>
        <span>Wrist tilt {found ? Math.round(hand.tilt) : 0}°</span>
      </div>
    </div>
  );
}
