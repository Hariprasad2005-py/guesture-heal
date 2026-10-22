// A simple 21-point hand model (same layout as MediaPipe hand landmarks). Used to draw the
// animated hand demos and for tests.
// curls: [thumb,index,middle,ring,pinky] 0..1; tiltDeg: rotation about the wrist (+ = fingers lean to the image right);
// cx,cy = wrist position (normalized); scale = palm length as fraction of image height.
export function makeHand({ curls = [0, 0, 0, 0, 0], tiltDeg = 0, cx = 0.5, cy = 0.8, scale = 0.2, aspect = 4 / 3, thumbSide = 1, spread = 0 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const D = Math.PI / 180;
  const fingers = [
    { mcp: [0.30 * thumbSide, -0.97], len: [0.42, 0.25, 0.22], idx: 5 },
    { mcp: [0.05 * thumbSide, -1.0], len: [0.47, 0.28, 0.24], idx: 9 },
    { mcp: [-0.2 * thumbSide, -0.92], len: [0.43, 0.26, 0.22], idx: 13 },
    { mcp: [-0.42 * thumbSide, -0.8], len: [0.33, 0.2, 0.2], idx: 17 },
  ];
  const local = []; // {x,y,z} in palm units (y up negative), z negative = toward camera
  local[0] = [0, 0, 0];
  fingers.forEach((f, i) => {
    const c = curls[i + 1];
    local[f.idx] = [f.mcp[0], f.mcp[1], 0];
    let phi = 0, x = f.mcp[0], y = f.mcp[1], z = 0;
    const dirx = (i - 1.5) * spread * 0.12;
    const flex = [85 * D, 100 * D, 70 * D];
    f.len.forEach((L, k) => {
      phi += flex[k] * c * (k === 0 ? 1 : 0.9);
      x += dirx * L; y -= Math.cos(phi) * L; z -= Math.sin(phi) * L;
      local[f.idx + 1 + k] = [x, y, z];
    });
  });
  // thumb: open -> across the palm
  const c = curls[0];
  const lerp = (a, b) => a + (b - a) * c;
  local[1] = [0.2 * thumbSide, -0.2, 0];
  local[2] = [lerp(0.38, 0.25) * thumbSide, lerp(-0.45, -0.4), lerp(0, -0.1)];
  local[3] = [lerp(0.62, 0.0) * thumbSide, lerp(-0.62, -0.5), lerp(0, -0.25)];
  local[4] = [lerp(0.85, -0.25) * thumbSide, lerp(-0.78, -0.58), lerp(0, -0.3)];
  const cs = Math.cos(tiltDeg * D), sn = Math.sin(tiltDeg * D);
  for (let i = 0; i < 21; i++) {
    const [x, y, z] = local[i];
    // rotate in the image plane about the wrist; palm unit -> pixels via image height
    const rx = x * cs - y * sn, ry = x * sn + y * cs;
    pts[i] = { x: cx + (rx * scale) / aspect, y: cy + ry * scale, z: (z * scale) / aspect };
  }
  return pts;
}
