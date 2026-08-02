import React, { useEffect, useRef } from 'react';

const STATUS_COLOR = {
  ok: '#10b981',
  minor: '#f59e0b',
  severe: '#ef4444',
};

export default function SkeletonOverlay({ containerRef, keypoints, overallStatus, onMount }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (containerRef?.current && onMount) onMount(containerRef.current);
  }, [containerRef, onMount]);

  useEffect(() => {
    function draw() {
      const canvas = canvasRef.current;
      const container = containerRef?.current;
      if (!canvas || !container) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const w = container ? container.clientWidth : 640;
      const h = container ? container.clientHeight : 480;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      if (keypoints) {
        const color = STATUS_COLOR[overallStatus] || STATUS_COLOR.ok;
        const bones = [
          [keypoints.leftShoulder, keypoints.rightShoulder],
          [keypoints.leftShoulder, keypoints.leftElbow],
          [keypoints.leftElbow, keypoints.leftWrist],
          [keypoints.rightShoulder, keypoints.rightElbow],
          [keypoints.rightElbow, keypoints.rightWrist],
          [keypoints.nose, keypoints.leftShoulder],
          [keypoints.nose, keypoints.rightShoulder],
        ];

        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        bones.forEach(([a, b]) => {
          if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) return;
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.stroke();
        });
        ctx.shadowBlur = 0;

        Object.values(keypoints).forEach((p) => {
          if (!p || p.visibility < 0.5 || typeof p.x !== 'number') return;
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 7, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }

      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [containerRef, keypoints, overallStatus]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
