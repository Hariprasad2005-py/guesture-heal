// frontend/src/utils/reportGenerator.js
//
// Generates a clean, modern clinical PDF using jsPDF.
// Color palette: blue-900 header, slate-50 section bands, slate-200 table lines.
//
// Data sourcing rules:
//  - Patient identity fields: patientSnapshot → populated patientId → explicit patient param.
//  - Clinical metrics (performance, ROM, smoothness, stability): the completed Session
//    record, matched by the report's exact session ID, is always the source of truth —
//    never the report's own stored snapshot, and never "the current/latest session".
//    This applies equally to brand-new reports and to old reports being reopened or
//    regenerated, since old report snapshots may contain stale/fabricated values from
//    a previous bug. If no matching session record can be resolved, the report's own
//    stored fields are used as a last resort — with the same "never invent a value"
//    rule applied to whatever is actually present.
//
//  - Session fetch strategy (confirmed against the real backend):
//      * The authed route  GET /api/sessions/:id                        requires a therapist token.
//      * The public route  GET /api/sessions/public/:id?patientId=...   is unauthenticated
//        and matches the session by its human-readable patient code (patientIdRef, e.g.
//        "GH-97491") — NOT by the patient's Mongo ObjectId. The public route is used
//        when the authed route fails and the report carries a human patient code.
//    resolveSessionRecord() never falls back to "latest session" and never guesses an id.
//
//  - Precision Reach presentation: for the Precision Reach game, the
//    "Range of Motion Analysis" (Section 3) and "Joint-Specific ROM"
//    (Section 5) sections are intentionally omitted. Precision Reach
//    does not record a clinical target ROM (its 90° value is a gameplay
//    scoring threshold, never a clinical target) and does not record
//    joint-level goniometry, so those two sections would render as all
//    "—" / "Not recorded" and would be pure noise. The real per-rep ROM
//    (100°/130° bar chart) is still shown in Section 4.
//
//  - Section numbering is computed dynamically from the sections that
//    actually render, so a Precision Reach report shows sections 1..4
//    while a non-Precision-Reach report shows 1..6, with no gaps.

import { sessionApi } from "./apiService";

// Extracts the human-readable patient code (e.g. "GH-97491") from the report.
// The public session route keys on this value, so it must be the string form
// of the patient's public identifier — never the Mongo ObjectId.
//
// Mongo ObjectIds are 24 hex characters; the public patient code is the
// "GH-xxxxx" string. This helper refuses to return anything that looks like
// a bare ObjectId, so a report that only carries the ObjectId falls through
// to null and the public route is simply not attempted.
function extractPublicPatientCode(report) {
  if (!report) return null;

  const looksLikeObjectId = (v) =>
    typeof v === "string" && /^[a-f\d]{24}$/i.test(v.trim());

  const candidates = [
    report.patientIdRef,
    report.patientId?.patientIdRef,
    report.patientSnapshot?.patientIdRef,
    report.patientId?.patientId,
    report.patientId?.code,
    report.patientId?.publicId,
    report.patientSnapshot?.patientId,
    report.patientSnapshot?.code,
    report.patientSnapshot?.publicId,
  ];

  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const v = c.trim();
    if (!v) continue;
    if (looksLikeObjectId(v)) continue;
    return v;
  }
  return null;
}

// ── SESSION DATA RESOLUTION ───────────────────────────────────────────────
// Resolves the authoritative Session record for a report.
//
//  - If the caller already has the session in memory (e.g. right after a
//    session finishes and a report is generated immediately), pass it as
//    `sessionParam` and no fetch happens at all.
//  - Otherwise, this fetches the session by the report's own session
//    reference — the ONLY id ever used. It never substitutes "latest"
//    or "most recent" session data, and never guesses.
//  - Two routes are tried, in order:
//      1. sessionApi.getById(sessionId)                          — authed route
//      2. sessionApi.publicGetById(sessionId, publicPatientCode) — public route
//    Route 2 is only attempted when route 1 fails AND the report carries a
//    human-readable patient code (NOT a Mongo ObjectId). This matches the
//    backend's public route, which keys on the human code.
//  - If both routes fail, or the report has no session reference, this
//    returns null and callers must treat clinical metrics as unavailable
//    from the session (falling back only to whatever the report already
//    has stored — never inventing new values).
async function resolveSessionRecord(report, sessionParam) {
  if (sessionParam) return sessionParam;

  const rawRef =
    report?.sessionId ??
    report?.session ??
    report?.gameSessionId ??
    null;

  const sessionId =
    rawRef && typeof rawRef === "object"
      ? rawRef._id
      : rawRef;

  if (!sessionId) return null;

  // ── Route 1: auth-required `/sessions/:id` ────────────────────────────
  try {
    const data = await sessionApi.getById(sessionId);
    const record = unwrapSessionResponse(data, sessionId);
    if (record) return record;
  } catch (err) {
    // Not fatal — public reports have no token and are expected to 401 here.
    console.warn(
      "[reportGenerator] Authed session fetch failed, will try public route if possible:",
      sessionId,
      err?.message
    );
  }

  // ── Route 2: public `/sessions/public/:id?patientId=...` ──────────────
  const publicPatientCode = extractPublicPatientCode(report);

  if (publicPatientCode) {
    try {
      const data = await sessionApi.publicGetById(sessionId, publicPatientCode);
      const record = unwrapSessionResponse(data, sessionId);
      if (record) return record;
    } catch (err) {
      console.warn(
        "[reportGenerator] Public session fetch also failed:",
        sessionId,
        err?.message
      );
    }
  } else {
    console.warn(
      "[reportGenerator] No human-readable patient code on report; skipping public session route.",
      sessionId
    );
  }

  return null;
}

// Unwraps the various response shapes the session endpoints may return and
// validates that the resulting record is the session we asked for.
function unwrapSessionResponse(data, expectedSessionId) {
  if (!data) return null;

  const record =
    data?.session ??
    data?.data?.session ??
    data?.data ??
    data ??
    null;

  if (!record || typeof record !== "object") return null;

  if (
    record._id &&
    expectedSessionId &&
    String(record._id) !== String(expectedSessionId)
  ) {
    console.warn(
      "[reportGenerator] Session ID mismatch. Expected:",
      expectedSessionId,
      "Received:",
      record._id
    );
    return null;
  }

  return record;
}

export async function generatePDFReport(report, patient = null, session = null) {
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const PAGE_W = doc.internal.pageSize.getWidth();   // 210
    const PAGE_H = doc.internal.pageSize.getHeight();  // 297
    const M = 18;   // left/right margin
    const CONTENT = PAGE_W - M * 2;

    // ── Palette ──────────────────────────────────────────────────────────────
    const C = {
      headerBg: [15, 40, 80],      // deep blue-900
      accent: [37, 99, 235],       // blue-600
      sectionBg: [248, 250, 252],  // slate-50
      tableBg: [241, 245, 249],    // slate-100
      tableBgAlt: [252, 253, 254], // near-white for zebra rows
      borderGray: [226, 232, 240], // slate-200
      textDark: [15, 23, 42],      // slate-950
      textMid: [71, 85, 105],      // slate-600
      textLight: [148, 163, 184],  // slate-400
      white: [255, 255, 255],
      green: [21, 128, 61],
      amber: [161, 98, 7],
      red: [185, 28, 28],
    };

    let y = 0;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const fill = (c) => doc.setFillColor(...c);
    const text = (c) => doc.setTextColor(...c);
    const draw = (c) => doc.setDrawColor(...c);

    function checkPage(needed = 12) {
      if (y + needed > PAGE_H - 20) { doc.addPage(); y = M + 4; }
    }

    // Dynamic section numbering: each call to sectionHeader advances the
    // counter, so the printed number always matches the visible order and
    // no gaps appear when a section is skipped for a given game.
    let sectionCounter = 0;
    function sectionHeader(title) {
      sectionCounter += 1;
      checkPage(16);
      fill(C.sectionBg);
      doc.rect(M, y - 4, CONTENT, 10, "F");
      // Thin accent bar on the left of the section band, for a cleaner
      // "clinical document" look than a full underline.
      fill(C.accent);
      doc.rect(M, y - 4, 1.2, 10, "F");
      // Section number, right-aligned inside the band.
      text(C.accent);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(String(sectionCounter), M + CONTENT - 2, y + 2, { align: "right" });
      // Section title.
      text(C.textDark);
      doc.setFontSize(9.5);
      doc.text(title.toUpperCase(), M + 4, y + 2);
      y += 12;
    }

    // ── SESSION RESOLUTION ──────────────────────────────────────────────────
    const sessionRecord = await resolveSessionRecord(report, session);

    // ── DATA GATHERING ────────────────────────────────────────────────────────
    const snap = report.patientSnapshot || {};
    const pop = report.patientId && typeof report.patientId === "object" ? report.patientId : null;
    const pt = patient || {};
    const pick = (...vals) => vals.find((v) => v != null && v !== "" && v !== "Unknown Patient");

    const pName = pick(snap.name, pop?.name, pt.name) || "—";
    const pAge = pick(snap.age, pop?.age, pt.age);
    const pGender = pick(snap.gender, pop?.gender, pt.gender);
    const pCondition = pick(snap.condition, pop?.condition, pt.condition);
    const pSurgeryType = pick(snap.surgeryType, pop?.surgeryType, pt.surgeryType);
    const pSurgeryDate = pick(snap.surgeryDate, pop?.surgeryDate, pt.surgeryDate);
    const pPainLevel = pick(snap.painLevel, pop?.painLevel, pt.painLevel);
    const pGoals = pick(snap.goals, pop?.goals, pt.goals);
    const pId =
      report.patientIdRef ||
      pop?.patientId ||
      snap?.patientId ||
      pt.patientId ||
      "—";

    const therapistCandidates = [
      report.therapistName,
      snap.therapistName,
      pop?.therapistName,
      pop?.therapist?.name,
      pop?.therapist?.fullName,
      pop?.therapistId?.name,
      pop?.therapistId?.fullName,
      pt.therapistName,
      pt.therapist?.name,
      pt.therapist?.fullName,
    ];

    const therapistName =
      therapistCandidates.find(
        (v) =>
          typeof v === "string" &&
          v.trim() &&
          !/^[a-f\d]{24}$/i.test(v.trim()) &&
          v.trim() !== "Not Assigned"
      ) || "Not recorded";

    // ── SOURCE OBJECTS ──────────────────────────────────────────────────────
    const source = sessionRecord || report;

    const sourcePerformance =
      source.performance ??
      source.sessionPerformance ??
      source.performanceMetrics ??
      source.metrics ??
      {};

    // Merge all candidate game-specific containers, with gameSpecificMetrics
    // winning on key collisions. See file header for the full rationale.
    const getGameSpecificMetrics = (record) => {
      if (!record) return {};

      const candidates = [
        record.session?.gameSpecific,
        record.data?.gameSpecific,
        record.gameSpecific,
        record.session?.gameSpecificMetrics,
        record.data?.gameSpecificMetrics,
        record.gameSpecificMetrics,
      ];

      const merged = {};
      for (const candidate of candidates) {
        if (!candidate) continue;
        let obj = candidate;
        if (typeof obj === "string") {
          try { obj = JSON.parse(obj); } catch { obj = null; }
        }
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          Object.assign(merged, obj);
        }
      }
      return merged;
    };

    const sessionGameSpecific = getGameSpecificMetrics(sessionRecord);
    const reportGameSpecific = getGameSpecificMetrics(report);
    const sourceGameSpecific = sessionRecord ? sessionGameSpecific : reportGameSpecific;

    // ── CLINICAL METRICS ────────────────────────────────────────────────────
    const perf = {
      ...sourcePerformance,

      day:
        sourcePerformance.day ??
        source.day ??
        report.day,

      score:
        sourcePerformance.score ??
        source.score ??
        sourceGameSpecific.score,

      level:
        sourcePerformance.level ??
        source.level ??
        sourceGameSpecific.level,

      accuracy:
        sourcePerformance.accuracy ??
        source.accuracy ??
        sourceGameSpecific.accuracy,

      maxCombo:
        sessionGameSpecific.bestCombo ??
        sessionGameSpecific.longestHitStreak ??
        sessionGameSpecific.maxCombo ??
        sourcePerformance.maxCombo ??
        sourcePerformance.combo ??
        source.maxCombo ??
        source.bestStreak ??
        sourceGameSpecific.maxCombo ??
        sourceGameSpecific.bestStreak ??
        sourceGameSpecific.bestCombo ??
        sourceGameSpecific.longestHitStreak,

      stars:
        sourcePerformance.stars ??
        source.stars ??
        sourceGameSpecific.stars,

      durationSeconds:
        sourcePerformance.durationSeconds ??
        source.durationSeconds ??
        sourceGameSpecific.durationSeconds,

      exercisesCompleted:
        sourcePerformance.exercisesCompleted ??
        source.exercisesCompleted ??
        sourceGameSpecific.exercisesCompleted ??
        source.exerciseResults?.length,

      totalReps:
        sourcePerformance.totalReps ??
        source.totalReps ??
        sourceGameSpecific.totalReps ??
        source.repData?.length ??
        sourceGameSpecific.repData?.length,

      hits:
        sessionGameSpecific.hits ??
        sessionGameSpecific.totalHits ??
        sourcePerformance.hits ??
        source.hits ??
        sourceGameSpecific.hits,

      misses:
        sessionGameSpecific.misses ??
        sessionGameSpecific.totalMisses ??
        sessionGameSpecific.missedActions ??
        sourcePerformance.misses ??
        source.misses ??
        sourceGameSpecific.misses,

      paps:
        sessionGameSpecific.paps ??
        sessionGameSpecific.PAPS ??
        sourcePerformance.paps ??
        source.paps ??
        sourceGameSpecific.paps ??
        sourceGameSpecific.PAPS,

      avgResponse:
        sessionGameSpecific.avgResponseTimeSeconds ??
        sessionGameSpecific.averageResponseTimeSeconds ??
        sessionGameSpecific.avgResponse ??
        sessionGameSpecific.averageResponse ??
        sourcePerformance.avgResponse ??
        sourcePerformance.averageResponse ??
        source.avgResponse ??
        source.averageResponse ??
        sourceGameSpecific.avgResponse ??
        sourceGameSpecific.averageResponse,

      difficulty:
        sessionGameSpecific.difficulty ??
        sessionGameSpecific.difficultyLevel ??
        sourcePerformance.difficulty ??
        source.difficulty ??
        sourceGameSpecific.difficulty,

      painAdjusted:
        sessionGameSpecific.painAdjusted ??
        sourcePerformance.painAdjusted ??
        source.painAdjusted ??
        sourceGameSpecific.painAdjusted,
    };

    // ── ROM RESOLUTION ──────────────────────────────────────────────────────
    const romList = sessionRecord
      ? (
          Array.isArray(sessionRecord.romAnalysis)
            ? sessionRecord.romAnalysis
            : Array.isArray(sessionRecord.gameSpecificMetrics?.romAnalysis)
              ? sessionRecord.gameSpecificMetrics.romAnalysis
              : []
        )
      : (
          Array.isArray(report.romAnalysis)
            ? report.romAnalysis
            : Array.isArray(report.gameSpecificMetrics?.romAnalysis)
              ? report.gameSpecificMetrics.romAnalysis
              : []
        );

    const smoothnessVal = sessionRecord?.smoothness ?? report.smoothness;
    const stabilityVal = sessionRecord?.stability ?? report.stability;

    const repList = sessionRecord
      ? (
          Array.isArray(sessionRecord.repData)
            ? sessionRecord.repData
            : Array.isArray(sessionRecord.gameSpecific?.repData)
              ? sessionRecord.gameSpecific.repData
              : Array.isArray(sessionRecord.gameSpecificMetrics?.repData)
                ? sessionRecord.gameSpecificMetrics.repData
                : []
        )
      : (
          Array.isArray(report.repData)
            ? report.repData
            : Array.isArray(report.gameSpecific?.repData)
              ? report.gameSpecific.repData
              : Array.isArray(report.gameSpecificMetrics?.repData)
                ? report.gameSpecificMetrics.repData
                : []
        );

    const jointRom = sessionRecord
      ? (sessionRecord.romData && typeof sessionRecord.romData === "object" ? sessionRecord.romData : null)
      : (report.romData && typeof report.romData === "object" ? report.romData : null);

    const precisionRomDegrees =
      sessionRecord?.gameSpecific?.romDegrees ??
      sessionRecord?.gameSpecific?.averageRomDegrees ??
      sessionRecord?.romData?.averageRomDegrees ??
      sessionRecord?.averageRomDegrees ??
      sessionRecord?.romDegrees ??
      report?.gameSpecific?.romDegrees ??
      report?.gameSpecific?.averageRomDegrees ??
      report?.romData?.averageRomDegrees ??
      report?.averageRomDegrees ??
      report?.romDegrees ??
      null;

    const precisionMaxRomDegrees =
      sessionRecord?.gameSpecific?.maxRomDegrees ??
      sessionRecord?.romData?.maxRomDegrees ??
      sessionRecord?.maxRomDegrees ??
      report?.gameSpecific?.maxRomDegrees ??
      report?.romData?.maxRomDegrees ??
      report?.maxRomDegrees ??
      null;

    const isPrecisionReach =
      String(
        sessionRecord?.gameType ||
        sessionRecord?.gameId ||
        sessionRecord?.game ||
        sessionRecord?.gameName ||
        report?.gameType ||
        report?.gameId ||
        report?.game ||
        report?.gameName ||
        ""
      )
        .toLowerCase()
        .includes("precision");

    const resolvedRomList =
      romList.length > 0
        ? romList
        : isPrecisionReach &&
          (precisionRomDegrees != null || precisionMaxRomDegrees != null)
          ? [{
              exerciseName: "Precision Reach",
              averageRom: precisionRomDegrees ?? null,
              maxRom: precisionMaxRomDegrees ?? null,
              targetRom: null,
              percentageAchieved: null,
            }]
          : [];

    const reportDate = new Date(report.generatedAt || report.createdAt || Date.now());
    const dateStr = reportDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = reportDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const dateTimeStr = `${dateStr} at ${timeStr}`;

    // ── PAGE: HEADER ──────────────────────────────────────────────────────────
    // Two-band header: solid blue title bar + a lighter "document meta" strip
    // beneath it, so the top of the page reads like a real clinical report.
    fill(C.headerBg);
    doc.rect(0, 0, PAGE_W, 32, "F");
    fill(C.accent);
    doc.rect(0, 0, 5, 32, "F");

    text(C.white);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("GestureHeal", M + 4, 13);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text("Clinical Assessment Report  •  Rehabilitation Center", M + 4, 19);
    doc.setFontSize(7);
    text([180, 200, 230]);
    doc.text("CONFIDENTIAL — FOR CLINICAL USE ONLY", M + 4, 26);

    // Right side: report identity
    text(C.white);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`Report No: ${report.reportNumber || report._id || "N/A"}`, PAGE_W - M, 12, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`Date Issued: ${dateTimeStr}`, PAGE_W - M, 18, { align: "right" });
    doc.text(`Therapist: ${therapistName}`, PAGE_W - M, 24, { align: "right" });

    // Thin accent rule under the header, then the "Prepared for" line.
    fill(C.accent);
    doc.rect(0, 32, PAGE_W, 0.6, "F");

    y = 40;
    text(C.textMid);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("PREPARED FOR", M, y);
    text(C.textDark);
    doc.setFontSize(10);
    doc.text(String(pName), M, y + 6);
    text(C.textLight);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Patient ID: ${pId}`, PAGE_W - M, y + 6, { align: "right" });
    y += 12;

    // Thin separator before Section 1.
    draw(C.borderGray);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + CONTENT, y);
    y += 6;

    // ── SECTION 1: PATIENT INFORMATION ──────────────────────────────────────
    sectionHeader("Patient Information");

    const col1x = M;
    const col2x = M + 37;
    const col3x = M + CONTENT / 2 + 2;
    const col4x = col3x + 37;

    const leftRows = [
      ["Name", pName],
      ["Patient ID", pId],
      ["Age", pAge != null ? `${pAge} yrs` : "—"],
      ["Gender", pGender ?? "—"],
    ];
    const rightRows = [
      ["Condition", pCondition ?? "—"],
      ["Surgery Type", pSurgeryType ?? "—"],
      ["Surgery Date", pSurgeryDate ? new Date(pSurgeryDate).toLocaleDateString("en-US") : "—"],
      ["Pain Level", pPainLevel != null ? `${pPainLevel} / 10` : "Not recorded"],
    ];

    const tableTop = y;
    leftRows.forEach(([lbl, val], i) => {
      const rowY = tableTop + i * 8;
      if (i % 2 === 0) { fill(C.tableBgAlt); doc.rect(col1x, rowY - 3.5, CONTENT / 2 - 1, 8, "F"); }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold"); text(C.textMid);
      doc.text(`${lbl}:`, col1x + 1, rowY + 1);
      doc.setFont("helvetica", "normal"); text(C.textDark);
      doc.text(String(val), col2x, rowY + 1);
    });
    rightRows.forEach(([lbl, val], i) => {
      const rowY = tableTop + i * 8;
      if (i % 2 === 0) { fill(C.tableBgAlt); doc.rect(col3x, rowY - 3.5, CONTENT / 2, 8, "F"); }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold"); text(C.textMid);
      doc.text(`${lbl}:`, col3x + 1, rowY + 1);
      doc.setFont("helvetica", "normal"); text(C.textDark);
      doc.text(String(val), col4x, rowY + 1);
    });
    y = tableTop + Math.max(leftRows.length, rightRows.length) * 8 + 4;

    if (pGoals && pGoals !== "—") {
      fill(C.tableBg);
      const goalLines = doc.splitTextToSize(`Rehab Goals: ${pGoals}`, CONTENT - 4);
      doc.rect(M, y - 2, CONTENT, goalLines.length * 5 + 4, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "italic"); text(C.textMid);
      doc.text(goalLines, M + 2, y + 2);
      y += goalLines.length * 5 + 6;
    }
    y += 4;

    // ── SECTION 2: SESSION PERFORMANCE ──────────────────────────────────────
    checkPage(50);
    sectionHeader("Session Performance Metrics");

    const dur = perf.durationSeconds != null
      ? `${Math.floor(perf.durationSeconds / 60)}m ${perf.durationSeconds % 60}s`
      : "—";

    const stars =
      typeof perf.stars === "number"
        ? `${"*".repeat(Math.max(0, Math.min(3, Math.floor(perf.stars))))}${".".repeat(
          Math.max(0, 3 - Math.min(3, Math.floor(perf.stars)))
        )}`
        : "Not recorded";

    const perfRows = [
      ["Session Day", perf.day ?? "—"],
      ["Score", perf.score ?? "—"],
      ["Difficulty", perf.difficulty ?? "Not recorded"],
    ];

    if (!isPrecisionReach || perf.level != null) {
      perfRows.push(["Level Reached", perf.level ?? "Not recorded"]);
    }

    perfRows.push(
      ["Movement Accuracy", perf.accuracy != null ? `${perf.accuracy}%` : "—"],
      ["PAPS", perf.paps ?? "—"],
      ["Average Response Time", perf.avgResponse != null ? `${perf.avgResponse} s` : "—"],
      ["Max Combo", perf.maxCombo ?? "Not recorded"],
      ["Stars", stars],
      ["Duration", dur],
      ["Exercises Completed", perf.exercisesCompleted ?? "—"],
      ["Total Reps", perf.totalReps ?? "—"],
      ["Hits", perf.hits ?? "—"],
      ["Misses", perf.misses ?? "—"],
    );

    const halfRow = Math.ceil(perfRows.length / 2);
    const perfTop = y;
    perfRows.forEach(([lbl, val], i) => {
      const col = i < halfRow ? 0 : 1;
      const row = i < halfRow ? i : i - halfRow;
      const px = M + col * (CONTENT / 2 + 1);
      const py = perfTop + row * 8;
      if (row % 2 === 0) {
        fill(col === 0 ? C.tableBg : C.tableBgAlt);
        doc.rect(px, py - 3.5, CONTENT / 2, 8, "F");
      }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold"); text(C.textMid);
      doc.text(`${lbl}:`, px + 1, py + 1);
      doc.setFont("helvetica", "normal"); text(C.textDark);
      doc.text(String(val), px + 43, py + 1);
    });
    y = perfTop + halfRow * 8 + 6;

    if (smoothnessVal != null || stabilityVal != null) {
      checkPage(24);
      const bars = [
        { label: "Movement Smoothness", value: smoothnessVal },
        { label: "Movement Stability", value: stabilityVal },
      ];
      bars.forEach(({ label, value }) => {
        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); text(C.textMid);
        doc.text(`${label}:`, M, y);

        if (value == null) {
          text(C.textLight);
          doc.setFont("helvetica", "italic");
          doc.text("Not recorded", M + 42, y);
          doc.setFont("helvetica", "normal");
          y += 8;
          return;
        }

        const pct = Math.min(100, Math.max(0, value));
        const barW = CONTENT - 60;
        fill(C.borderGray);
        doc.roundedRect(M + 42, y - 3, barW, 5, 1, 1, "F");
        const clr = pct >= 75 ? C.green : pct >= 50 ? C.amber : C.red;
        fill(clr);
        doc.roundedRect(M + 42, y - 3, (barW * pct) / 100, 5, 1, 1, "F");
        text(C.textMid);
        doc.text(`${pct}%`, M + 42 + barW + 3, y);
        y += 8;
      });
      y += 3;
    }

    // ── SECTION 3: RANGE OF MOTION ANALYSIS (skipped for Precision Reach) ──
    // Precision Reach does not record a clinical target ROM (its 90° value
    // is a gameplay scoring threshold, never a clinical target), so Target°
    // and Achieved % would always be "—". The real per-rep ROM is still
    // shown in the following per-repetition section. Skip entirely.
    if (
      !isPrecisionReach &&
      Array.isArray(resolvedRomList) &&
      resolvedRomList.length > 0
    ) {
      checkPage(36);
      sectionHeader("Range of Motion Analysis");

      // Right-align the three numeric columns for a clinical-table look.
      const cExercise = M;
      const cAvg      = M + 60;
      const cMax      = M + 90;
      const cTarget   = M + 120;
      const cAchieved = M + CONTENT;

      fill(C.headerBg);
      doc.rect(M, y - 4, CONTENT, 8, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold"); text(C.white);
      doc.text("Exercise", cExercise + 1, y);
      doc.text("Avg ROM°", cAvg, y, { align: "right" });
      doc.text("Max ROM°", cMax, y, { align: "right" });
      doc.text("Target°", cTarget, y, { align: "right" });
      doc.text("Achieved %", cAchieved - 1, y, { align: "right" });
      y += 7;

      doc.setFont("helvetica", "normal");
      resolvedRomList.forEach((row, idx) => {
        checkPage(9);
        if (idx % 2 === 0) { fill(C.tableBgAlt); doc.rect(M, y - 3.5, CONTENT, 7.5, "F"); }

        const pct = row.percentageAchieved != null ? row.percentageAchieved : null;
        const statusClr = pct == null ? C.textLight : pct >= 90 ? C.green : pct >= 70 ? C.amber : C.red;

        doc.setFontSize(8.5); text(C.textDark);
        doc.text(String(row.exerciseName || "—").substring(0, 24), cExercise + 1, y);
        doc.text(String(row.averageRom ?? "—"), cAvg, y, { align: "right" });
        doc.text(String(row.maxRom ?? "—"), cMax, y, { align: "right" });
        doc.text(String(row.targetRom ?? "—"), cTarget, y, { align: "right" });
        text(statusClr);
        doc.setFont("helvetica", "bold");
        doc.text(pct != null ? `${pct}%` : "—", cAchieved - 1, y, { align: "right" });
        doc.setFont("helvetica", "normal"); text(C.textDark);
        y += 7.5;
      });
      y += 5;
    }

    // ── SECTION 4: RANGE OF MOTION PER REPETITION ──────────────────────────
    const repRomValues = repList.map((r) => {
      if (r?.romDegrees != null) return Number(r.romDegrees);
      if (r?.rom != null) return Number(r.rom);
      return null;
    });
    const hasRepRom = repRomValues.some((v) => v != null);

    if (repList.length > 0) {
      checkPage(92);
      sectionHeader("Range of Motion per Repetition");

      doc.setFontSize(8); doc.setFont("helvetica", "normal"); text(C.textMid);
      doc.text(`Per-rep ROM in degrees, recorded during the session (${repList.length} reps).`, M, y);
      y += 8;

      if (hasRepRom) {
        const chartH = 38;
        const chartW = CONTENT - 14;
        const chartX = M + 14;
        const chartTop = y;
        const validValues = repRomValues.filter((v) => v != null);
        const maxVal = validValues.length ? Math.max(...validValues) : 1;
        const niceMax = Math.max(25, Math.ceil(maxVal / 25) * 25);

        draw(C.borderGray);
        doc.setLineWidth(0.2);
        const steps = 4;
        for (let s = 0; s <= steps; s++) {
          const gy = chartTop + chartH - (chartH * s) / steps;
          doc.line(chartX, gy, chartX + chartW, gy);
          doc.setFontSize(7); text(C.textLight);
          doc.text(String(Math.round((niceMax * s) / steps)), chartX - 3, gy + 1, { align: "right" });
        }

        const barGap = 3;
        const barW = Math.min(14, (chartW - barGap * (repList.length - 1)) / repList.length);
        repList.forEach((r, i) => {
          const v = repRomValues[i];
          const bx = chartX + i * (barW + barGap);
          const correct = r.isCorrect !== undefined ? r.isCorrect : r.success;
          const barClr = v == null ? C.borderGray : (correct === false ? C.red : C.accent);
          const bh = v == null ? 0 : (chartH * v) / niceMax;
          fill(barClr);
          doc.rect(bx, chartTop + chartH - bh, barW, bh, "F");
          doc.setFontSize(7); text(C.textMid);
          doc.text(String(i + 1), bx + barW / 2, chartTop + chartH + 5, { align: "center" });
        });

        y = chartTop + chartH + 10;
      }

      const confidenceValues = repList.map((r) => r.confidence).filter((c) => c != null);
      const avgConfidence = confidenceValues.length
        ? `${Math.round((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) * 100)}%`
        : "Not recorded";
      const validRomValues = repRomValues.filter((v) => v != null);
      const avgRomDisplay = validRomValues.length
        ? `${Math.round(validRomValues.reduce((a, b) => a + b, 0) / validRomValues.length)}°`
        : "Not recorded";
      const correctCount = repList.filter((r) => (r.isCorrect !== undefined ? r.isCorrect : r.success) === true).length;
      const incorrectCount = repList.filter((r) => (r.isCorrect !== undefined ? r.isCorrect : r.success) === false).length;

      const summaryRows = [
        ["Reps Recorded", String(repList.length)],
        ["Average ROM", avgRomDisplay],
        ["Average Confidence", avgConfidence],
        ["Correct / Incorrect", `${correctCount} / ${incorrectCount}`],
      ];
      const sumTop = y;
      summaryRows.forEach(([lbl, val], i) => {
        const sx = M + i * (CONTENT / 4);
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); text(C.textMid);
        doc.text(lbl, sx, sumTop);
        doc.setFontSize(10.5); doc.setFont("helvetica", "bold"); text(C.textDark);
        doc.text(val, sx, sumTop + 6);
      });
      y = sumTop + 14;
    }

    // ── SECTION 5: JOINT-SPECIFIC ROM (skipped for Precision Reach) ────────
    // Precision Reach does not record joint-level goniometry, so every field
    // would read "Not recorded". Skip entirely for that game.
    if (!isPrecisionReach && jointRom) {
      checkPage(30);
      sectionHeader("Joint-Specific ROM");

      const fmt = (v) => (v != null ? `${v}°` : "Not recorded");
      const joints = [
        ["Shoulder", [["Flexion", jointRom.shoulder?.flexion], ["Extension", jointRom.shoulder?.extension]]],
        ["Elbow", [["Flexion", jointRom.elbow?.flexion], ["Extension", jointRom.elbow?.extension]]],
        ["Wrist", [
          ["Flexion", jointRom.wrist?.flexion],
          ["Extension", jointRom.wrist?.extension],
          ["Rotation", jointRom.wrist?.rotation],
        ]],
      ];

      const jointColW = CONTENT / 3;
      const jointTop = y;
      let maxFieldCount = 0;
      joints.forEach(([jointName, fields], idx) => {
        maxFieldCount = Math.max(maxFieldCount, fields.length);
        const jx = M + idx * jointColW;
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); text(C.textDark);
        doc.text(jointName, jx, jointTop);
        fields.forEach(([fLabel, fVal], fi) => {
          doc.setFontSize(8); doc.setFont("helvetica", "normal");
          text(fVal != null ? C.textMid : C.textLight);
          if (fVal == null) doc.setFont("helvetica", "italic");
          doc.text(`${fLabel}: ${fmt(fVal)}`, jx, jointTop + 6 + fi * 5);
          doc.setFont("helvetica", "normal");
        });
      });
      y = jointTop + 6 + maxFieldCount * 5 + 6;
    }

    // ── SECTION 6: CLINICAL NOTES + SIGNATURE BLOCK ────────────────────────
    if (report.observations || report.recommendations || report.therapistNotes) {
      checkPage(30);
      sectionHeader("Clinical Observations & Recommendations");

      const blocks = [
        { label: "Observations", value: report.observations },
        { label: "Recommendations", value: report.recommendations },
        { label: "Therapist Notes", value: report.therapistNotes },
      ];
      blocks.forEach(({ label, value }) => {
        if (!value) return;
        checkPage(20);
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); text(C.textMid);
        doc.text(`${label}:`, M, y);
        y += 5;
        doc.setFont("helvetica", "normal"); text(C.textDark);
        const lines = doc.splitTextToSize(value, CONTENT);
        checkPage(lines.length * 5.5 + 4);
        fill(C.sectionBg);
        doc.rect(M, y - 2, CONTENT, lines.length * 5.5 + 3, "F");
        draw(C.accent);
        doc.setLineWidth(0.8);
        doc.line(M, y - 2, M, y + lines.length * 5.5 + 1);
        doc.setLineWidth(0.25);
        doc.text(lines, M + 4, y + 2);
        y += lines.length * 5.5 + 7;
      });

      // Signature block — standard on clinical documents.
      checkPage(28);
      y += 4;
      draw(C.borderGray);
      doc.setLineWidth(0.3);
      doc.line(M, y, M + CONTENT, y);
      y += 8;

      doc.setFontSize(8); doc.setFont("helvetica", "normal"); text(C.textMid);
      doc.text("Reviewed and approved by:", M, y);
      y += 10;

      const sigLineW = 80;
      draw(C.textMid);
      doc.setLineWidth(0.4);
      doc.line(M, y, M + sigLineW, y);
      doc.line(M + CONTENT - sigLineW, y, M + CONTENT, y);
      y += 4;

      doc.setFontSize(8); doc.setFont("helvetica", "bold"); text(C.textDark);
      doc.text(therapistName, M, y);
      doc.text(dateStr, M + CONTENT - sigLineW, y);
      y += 4;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); text(C.textLight);
      doc.text("Therapist signature", M, y);
      doc.text("Date of signature", M + CONTENT - sigLineW, y);
    }

    // ── FOOTER on every page ────────────────────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg);
      fill(C.headerBg);
      doc.rect(0, PAGE_H - 12, PAGE_W, 12, "F");
      fill(C.accent);
      doc.rect(0, PAGE_H - 12, 5, 12, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); text(C.white);
      doc.text(
        `GestureHeal  •  ${report.reportNumber || report._id || ""}  •  Confidential — For Clinical Use Only`,
        M + 4,
        PAGE_H - 5.5
      );
      doc.text(`Page ${pg} of ${totalPages}`, PAGE_W - M, PAGE_H - 5.5, { align: "right" });
    }

    const filename = `GestureHeal_Report_${report.reportNumber || report._id || "export"}.pdf`;
    doc.save(filename);
    return true;
  } catch (err) {
    console.error("[reportGenerator] PDF generation failed:", err);
    throw new Error(`Failed to generate PDF report: ${err.message || "Unknown error"}`);
  }
}