// frontend/src/utils/reportGenerator.js
//
// Generates a clean, modern clinical PDF using jsPDF.
// Color palette: blue-900 header, slate-50 section bands, slate-200 table lines.
// All data is sourced from the cascade: patientSnapshot → populated patientId → explicit patient param.

export async function generatePDFReport(report, patient = null) {
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const PAGE_W = doc.internal.pageSize.getWidth();   // 210
    const PAGE_H = doc.internal.pageSize.getHeight();  // 297
    const M = 18;   // left/right margin
    const CONTENT = PAGE_W - M * 2;

    // ── Palette ──────────────────────────────────────────────────────────────
    const C = {
      headerBg: [15, 40, 80],   // deep blue-900
      headerBg2: [24, 60, 120],   // blue-800 accent strip
      accent: [37, 99, 235],   // blue-600
      sectionBg: [248, 250, 252],  // slate-50
      tableBg: [241, 245, 249],  // slate-100
      borderGray: [226, 232, 240],  // slate-200
      textDark: [15, 23, 42],   // slate-950
      textMid: [71, 85, 105],   // slate-600
      textLight: [148, 163, 184],  // slate-400
      white: [255, 255, 255],
      green: [21, 128, 61],   // green-700
      amber: [161, 98, 7],  // amber-700
      red: [185, 28, 28],  // red-700
    };

    let y = 0;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const rgb = (c) => ({ r: c[0], g: c[1], b: c[2] });
    const fill = (c) => doc.setFillColor(...c);
    const text = (c) => doc.setTextColor(...c);
    const draw = (c) => doc.setDrawColor(...c);

    function checkPage(needed = 12) {
      if (y + needed > PAGE_H - 20) { doc.addPage(); y = M; }
    }

    function sectionHeader(title, iconChar = "▸") {
      checkPage(16);
      fill(C.sectionBg);
      doc.rect(M, y - 4, CONTENT, 10, "F");
      draw(C.borderGray);
      doc.setLineWidth(0.25);
      doc.line(M, y + 6, M + CONTENT, y + 6);
      text(C.accent);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(iconChar, M + 1, y + 2);
      text(C.textDark);
      doc.setFontSize(9.5);
      doc.text(title.toUpperCase(), M + 7, y + 2);
      y += 12;
    }

    function labelValue(label, value, x = M, col2 = M + 38, rowH = 7) {
      checkPage(rowH + 2);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      text(C.textMid);
      doc.text(`${label}:`, x, y);
      doc.setFont("helvetica", "normal");
      text(C.textDark);
      const lines = doc.splitTextToSize(String(value ?? "—"), CONTENT - (col2 - M) - 2);
      doc.text(lines, col2, y);
      y += Math.max(rowH, lines.length * 5);
    }

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
    const pId = pop?.patientId || pt.patientId || "—";

    const perf = report.performance || {};
    const reportDate = new Date(report.generatedAt || report.createdAt || Date.now());
    const dateStr = reportDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    // ── PAGE: HEADER ──────────────────────────────────────────────────────────
    // Main header band
    fill(C.headerBg);
    doc.rect(0, 0, PAGE_W, 36, "F");
    // Accent side stripe
    fill(C.accent);
    doc.rect(0, 0, 5, 36, "F");

    text(C.white);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("GestureHeal", M + 4, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Clinical Assessment Report", M + 4, 22);
    doc.text("Rehabilitation Center — Confidential", M + 4, 29);

    // Report meta — right side
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`Report No: ${report.reportNumber || report._id || "N/A"}`, PAGE_W - M, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${dateStr}`, PAGE_W - M, 21, { align: "right" });
    doc.text(`Therapist: ${report.therapistName || "Not Assigned"}`, PAGE_W - M, 28, { align: "right" });

    y = 44;

    // ── PATIENT INFORMATION ──────────────────────────────────────────────────
    sectionHeader("Patient Information", "①");

    // Two-column patient table
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
      ["Pain Level", pPainLevel != null ? `${pPainLevel} / 10` : "—"],
    ];

    const tableTop = y;
    leftRows.forEach(([lbl, val], i) => {
      const rowY = tableTop + i * 8;
      if (i % 2 === 0) { fill(C.tableBg); doc.rect(col1x, rowY - 3.5, CONTENT / 2 - 1, 8, "F"); }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold"); text(C.textMid);
      doc.text(`${lbl}:`, col1x + 1, rowY + 1);
      doc.setFont("helvetica", "normal"); text(C.textDark);
      doc.text(String(val), col2x, rowY + 1);
    });
    rightRows.forEach(([lbl, val], i) => {
      const rowY = tableTop + i * 8;
      if (i % 2 === 0) { fill(C.tableBg); doc.rect(col3x, rowY - 3.5, CONTENT / 2, 8, "F"); }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold"); text(C.textMid);
      doc.text(`${lbl}:`, col3x + 1, rowY + 1);
      doc.setFont("helvetica", "normal"); text(C.textDark);
      doc.text(String(val), col4x, rowY + 1);
    });
    y = tableTop + Math.max(leftRows.length, rightRows.length) * 8 + 4;

    // Goals (full width)
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

    // ── SESSION PERFORMANCE ──────────────────────────────────────────────────
    checkPage(50);
    sectionHeader("Session Performance Metrics", "②");

    const stars = perf.stars != null
      ? `${"★".repeat(perf.stars)}${"☆".repeat(Math.max(0, 3 - perf.stars))}`
      : "—";
    const dur = perf.durationSeconds != null
      ? `${Math.floor(perf.durationSeconds / 60)}m ${perf.durationSeconds % 60}s`
      : "—";

    const perfRows = [
      ["Session Day", perf.day ?? "—"],
      ["Score", perf.score != null ? perf.score.toLocaleString() : "—"],
      ["Level Reached", perf.level ?? "—"],
      ["Movement Accuracy", perf.accuracy != null ? `${perf.accuracy}%` : "—"],
      ["Max Combo", perf.maxCombo ?? perf.combo ?? "—"],
      ["Stars", stars],
      ["Duration", dur],
      ["Exercises Completed", perf.exercisesCompleted ?? "—"],
      ["Total Reps", perf.totalReps ?? "—"],
    ];

    const halfRow = Math.ceil(perfRows.length / 2);
    const perfTop = y;
    perfRows.forEach(([lbl, val], i) => {
      const col = i < halfRow ? 0 : 1;
      const row = i < halfRow ? i : i - halfRow;
      const px = M + col * (CONTENT / 2 + 1);
      const py = perfTop + row * 8;
      if (row % 2 === 0) { fill(col === 0 ? C.tableBg : C.sectionBg); doc.rect(px, py - 3.5, CONTENT / 2, 8, "F"); }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold"); text(C.textMid);
      doc.text(`${lbl}:`, px + 1, py + 1);
      doc.setFont("helvetica", "normal"); text(C.textDark);
      doc.text(String(val), px + 43, py + 1);
    });
    y = perfTop + halfRow * 8 + 6;

    // Smoothness / Stability mini-bars
    if (report.smoothness != null || report.stability != null) {
      checkPage(24);
      const bars = [
        { label: "Movement Smoothness", value: report.smoothness },
        { label: "Movement Stability", value: report.stability },
      ];
      bars.forEach(({ label, value }) => {
        if (value == null) return;
        const pct = Math.min(100, Math.max(0, value));
        const barW = CONTENT - 60;
        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); text(C.textMid);
        doc.text(`${label}:`, M, y);
        // Track
        fill(C.borderGray);
        doc.roundedRect(M + 42, y - 3, barW, 5, 1, 1, "F");
        // Fill
        const clr = pct >= 75 ? C.green : pct >= 50 ? C.amber : C.red;
        fill(clr);
        doc.roundedRect(M + 42, y - 3, (barW * pct) / 100, 5, 1, 1, "F");
        // Label
        text(C.textMid);
        doc.text(`${pct}%`, M + 42 + barW + 3, y);
        y += 8;
      });
      y += 3;
    }

    // ── ROM ANALYSIS ─────────────────────────────────────────────────────────
    if (Array.isArray(report.romAnalysis) && report.romAnalysis.length > 0) {
      checkPage(36);
      sectionHeader("Range of Motion Analysis", "③");

      // Table header
      const cols = [M, M + 52, M + 84, M + 115, M + 146];
      const headers = ["Exercise", "Avg ROM°", "Max ROM°", "Target°", "Achieved %"];
      fill(C.headerBg);
      doc.rect(M, y - 4, CONTENT, 8, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold"); text(C.white);
      headers.forEach((h, i) => doc.text(h, cols[i] + 1, y));
      y += 7;

      doc.setFont("helvetica", "normal");
      report.romAnalysis.forEach((row, idx) => {
        checkPage(9);
        if (idx % 2 === 0) { fill(C.tableBg); doc.rect(M, y - 3.5, CONTENT, 7.5, "F"); }
        const pct = row.percentageAchieved ?? 0;
        const statusClr = pct >= 90 ? C.green : pct >= 70 ? C.amber : C.red;
        doc.setFontSize(8.5); text(C.textDark);
        doc.text(String(row.exerciseName || "—").substring(0, 22), cols[0] + 1, y);
        doc.text(String(row.averageRom ?? "—"), cols[1] + 1, y);
        doc.text(String(row.maxRom ?? "—"), cols[2] + 1, y);
        doc.text(String(row.targetRom ?? "—"), cols[3] + 1, y);
        text(statusClr);
        doc.setFont("helvetica", "bold");
        doc.text(`${pct}%`, cols[4] + 1, y);
        doc.setFont("helvetica", "normal"); text(C.textDark);
        y += 7.5;
      });
      y += 5;
    }

    // ── CLINICAL NOTES ────────────────────────────────────────────────────────
    if (report.observations || report.recommendations || report.therapistNotes) {
      checkPage(30);
      sectionHeader("Clinical Observations & Recommendations", "④");

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
    }

    // ── FOOTER on every page ──────────────────────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg);
      // Footer bar
      fill(C.headerBg);
      doc.rect(0, PAGE_H - 12, PAGE_W, 12, "F");
      fill(C.accent);
      doc.rect(0, PAGE_H - 12, 5, 12, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); text(C.white);
      doc.text("GestureHeal Rehabilitation Platform  •  Confidential — For Clinical Use Only", M + 4, PAGE_H - 5.5);
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