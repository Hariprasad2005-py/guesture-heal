// Canvas loop shared by the arm games: keeps the canvas sharp at any size and
// calls update(dt, size) only while the game is really running, draw(ctx, size, t) always.
import { useEffect, useRef } from "react";

export default function useStageLoop(api, { update, draw }) {
  const canvasRef = useRef(null);
  const fn = useRef({ update, draw });
  fn.current = { update, draw };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const ctx = c.getContext("2d");
    const size = { w: 640, h: 360 };
    const fit = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      size.w = Math.max(2, r.width);
      size.h = Math.max(2, r.height);
      c.width = Math.round(size.w * d);
      c.height = Math.round(size.h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(c);
    let raf; let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (api.activeRef.current) fn.current.update?.(dt, size);
      fn.current.draw?.(ctx, size, now / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [api.activeRef]);
  return canvasRef;
}
