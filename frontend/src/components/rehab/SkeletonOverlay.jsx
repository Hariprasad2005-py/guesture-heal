import { useEffect, useRef } from "react";

const STATUS_COLORS = {
  ok: "#10b981",
  minor: "#f59e0b",
  severe: "#ef4444",
};

function pointToCanvas(point, width, height) {
  return {
    x: (1 - point.x) * width,
    y: point.y * height,
  };
}

export default function SkeletonOverlay({
  poseData,
  keypoints,
  overallStatus = "ok",
  shoulderAngle = 0,
  containerRef,
  // Optional wrist trajectory trail: an array of { x, y } points in 0-100
  // percentage units (the same shape RehabSlicer's `trail` state already
  // uses for its canvas-panel trail). Callers that don't pass this get
  // identical rendering to before.
  wristTrail = null,
}) {
  const localContainerRef = useRef(null);
  const canvasRef = useRef(null);

  const resolvedKeypoints = keypoints || poseData?.raw;

  useEffect(() => {
    const container =
      containerRef?.current || localContainerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) return undefined;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const context = canvas.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      if (!resolvedKeypoints) return;

      const color =
        STATUS_COLORS[overallStatus] || STATUS_COLORS.ok;

      // Wrist trajectory trail, drawn before the skeleton so the bones
      // and joint dots render on top of it. wristTrail points are in
      // 0-100 percentage units, so they're normalized to [0,1] here
      // before reusing pointToCanvas (which already handles the same
      // mirroring the skeleton points below rely on).
      if (wristTrail && wristTrail.length > 1) {
        context.save();
        context.strokeStyle = "#22d3ee";
        context.lineWidth = 3;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.globalAlpha = 0.5;
        context.shadowBlur = 0;
        context.beginPath();
        wristTrail.forEach((point, index) => {
          const canvasPoint = pointToCanvas(
            { x: point.x / 100, y: point.y / 100 },
            rect.width,
            rect.height
          );
          if (index === 0) {
            context.moveTo(canvasPoint.x, canvasPoint.y);
          } else {
            context.lineTo(canvasPoint.x, canvasPoint.y);
          }
        });
        context.stroke();
        context.restore();
      }

      const bones = [
        ["leftShoulder", "rightShoulder"],
        ["leftShoulder", "leftElbow"],
        ["leftElbow", "leftWrist"],
        ["rightShoulder", "rightElbow"],
        ["rightElbow", "rightWrist"],
      ];

      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 4;
      context.shadowColor = color;
      context.shadowBlur = 10;
      context.lineCap = "round";

      bones.forEach(([from, to]) => {
        const a = resolvedKeypoints[from];
        const b = resolvedKeypoints[to];

        if (
          !a ||
          !b ||
          a.visibility < 0.4 ||
          b.visibility < 0.4
        ) {
          return;
        }

        const start = pointToCanvas(a, rect.width, rect.height);
        const end = pointToCanvas(b, rect.width, rect.height);

        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      });

      [
        "leftShoulder",
        "rightShoulder",
        "leftElbow",
        "rightElbow",
        "leftWrist",
        "rightWrist",
      ].forEach((name) => {
        const point = resolvedKeypoints[name];

        if (!point || point.visibility < 0.4) return;

        const canvasPoint = pointToCanvas(
          point,
          rect.width,
          rect.height
        );

        context.beginPath();
        context.arc(
          canvasPoint.x,
          canvasPoint.y,
          6,
          0,
          Math.PI * 2
        );
        context.fill();
      });

      context.shadowBlur = 0;
      context.font = "700 14px sans-serif";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(0,0,0,.75)";
      context.fillStyle = "#fff";

      const label = `${Math.round(shoulderAngle || poseData?.maxShoulderAngle || 0)}°`;

      context.strokeText(label, 12, 24);
      context.fillText(label, 12, 24);
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(container);

    return () => observer.disconnect();
  }, [
    containerRef,
    resolvedKeypoints,
    overallStatus,
    shoulderAngle,
    poseData,
    wristTrail,
  ]);

  return (
    <div
      ref={localContainerRef}
      className="absolute inset-0 pointer-events-none z-10"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        aria-hidden="true"
      />
    </div>
  );
}