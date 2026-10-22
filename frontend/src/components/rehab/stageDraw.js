// Small canvas drawing helpers shared by the arm games.

// Front-view figure whose arms are raised to the given elevations (0 = down,
// 90 = out to shoulder height, 180 = overhead). (x, y) is the centre of the head,
// s scales it (1 = about 130px tall). Left arm cyan, right arm orange.
export function drawAvatar(ctx, x, y, s, { l = 0, r = 0, body = "#e2e8f0", alpha = 1, glow = "#6fe0d0", dashed = false } = {}) {
  const rad = (d) => (d * Math.PI) / 180;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = glow;
  ctx.shadowBlur = dashed ? 0 : 12;
  if (dashed) ctx.setLineDash([6, 6]);
  ctx.strokeStyle = body;
  ctx.fillStyle = body;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.283); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, 26); ctx.moveTo(-22, 28); ctx.lineTo(22, 28);
  ctx.moveTo(-22, 28); ctx.lineTo(-13, 74); ctx.lineTo(13, 74); ctx.lineTo(22, 28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9, 74); ctx.lineTo(-12, 118); ctx.moveTo(9, 74); ctx.lineTo(12, 118); ctx.stroke();
  [[-1, l, "#22d3ee"], [1, r, "#fb923c"]].forEach(([sg, e, c]) => {
    const sx = sg * 22, sy = 28;
    const dx = sg * Math.sin(rad(e)), dy = Math.cos(rad(e));
    const ex = sx + dx * 27, ey = sy + dy * 27, hx = sx + dx * 54, hy = sy + dy * 54;
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 7; ctx.shadowColor = c;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, 6.283); ctx.fillStyle = dashed ? "rgba(255,255,255,0.2)" : "#fff"; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  });
  ctx.restore();
}

export const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

// Draws the player's own tracked hand (21 points) as a glowing skeleton, mirrored like the camera picture.
// (cx, cy) = wrist, S = palm length in pixels. Only the chosen hand is passed in.
const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export function drawLiveHand(ctx, hand, cx, cy, S, color, { alpha = 1, highlight = null } = {}) {
  if (!hand?.present || !hand.lm) return;
  const lm = hand.lm, asp = hand.aspect || 4 / 3;
  const pl = Math.hypot((lm[9].x - lm[0].x) * asp, lm[9].y - lm[0].y) || 1;
  const P = (p) => [cx - ((p.x - lm[0].x) * asp / pl) * S, cy + ((p.y - lm[0].y) / pl) * S];
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(3, S * 0.07);
  HAND_BONES.forEach(([a, b]) => { const [x1, y1] = P(lm[a]), [x2, y2] = P(lm[b]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); });
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff";
  lm.forEach((p, i) => { const [x, y] = P(p); ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 && i > 0 ? S * 0.055 : S * 0.032, 0, 6.283); ctx.fill(); });
  if (highlight != null) { const [x, y] = P(lm[highlight]); ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, S * 0.1, 0, 6.283); ctx.stroke(); }
  ctx.restore();
}
