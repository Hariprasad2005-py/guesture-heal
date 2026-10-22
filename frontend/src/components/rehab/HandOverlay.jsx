// Draws the tracked hand (21 points) over a camera picture, in the same crop and mirroring as the video.
// Only the hand the player chose is drawn. cyan = left hand, orange = right hand.
import { useEffect, useRef } from "react";

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export default function HandOverlay({ videoRef, handRef, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const c = ref.current, v = videoRef?.current;
      if (c) {
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, w, h);
        const hand = handRef?.current;
        if (hand?.present && hand.lm && v?.videoWidth) {
          // same crop as object-cover, mirrored like the picture
          const s = Math.max(w / v.videoWidth, h / v.videoHeight);
          const ox = (w - v.videoWidth * s) / 2, oy = (h - v.videoHeight * s) / 2;
          const P = (p) => [w - (ox + p.x * v.videoWidth * s), oy + p.y * v.videoHeight * s];
          const col = hand.side === "left" ? "#22d3ee" : "#fb923c";
          ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = "round";
          BONES.forEach(([a, b]) => { const [x1, y1] = P(hand.lm[a]), [x2, y2] = P(hand.lm[b]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); });
          ctx.fillStyle = "#fff";
          hand.lm.forEach((p, i) => { const [x, y] = P(p); ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 && i > 0 ? 3.5 : 2.2, 0, 6.283); ctx.fill(); });
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, handRef]);
  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
