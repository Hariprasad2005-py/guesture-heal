import { useEffect, useRef } from 'react';

const STATUS_COLORS = {
  ok: '#10b981',
  minor: '#f59e0b',
  severe: '#ef4444',
};

/**
 * Draws the upper-body skeleton (shoulders, elbows, wrists) on a canvas
 * overlaid on top of the mirrored webcam feed. Color reflects posture status.
 */
export default function SkeletonOverlay({ poseData, overallStatus = 'ok', shoulderAngle = 0 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { width, height } = container.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (!poseData) return;

    const color = STATUS_COLORS[overallStatus] || STATUS_COLORS.ok;
    const { raw } = poseData;

    // Points are normalized [0,1] from the model but the video is mirrored
    // (scale-x-[-1]) in the DOM, so flip x for correct overlay alignment.
    const toPx = (pt) => ({ x: (1 - pt.x) * width, y: pt.y * height });

    const bones = [
      [raw.leftShoulder, raw.rightShoulder],
      [raw.leftShoulder, raw.leftElbow],
      [raw.leftElbow, raw.leftWrist],
      [raw.rightShoulder, raw.rightElbow],
      [raw.rightElbow, raw.rightWrist],
    ];

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    bones.forEach(([a, b]) => {
      if (!a || !b) return;
      if (a.visibility < 0.4 || b.visibility < 0.4) return;
      const pa = toPx(a);
      const pb = toPx(b);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });

    const joints = [
      raw.leftShoulder,
      raw.rightShoulder,
      raw.leftElbow,
      raw.rightElbow,
      raw.leftWrist,
      raw.rightWrist,
    ];
    joints.forEach((pt) => {
      if (!pt || pt.visibility < 0.4) return;
      const p = toPx(pt);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const label = `${Math.round(shoulderAngle)}°`;
    ctx.strokeText(label, 12, 24);
    ctx.fillText(label, 12, 24);
  }, [poseData, overallStatus, shoulderAngle]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}