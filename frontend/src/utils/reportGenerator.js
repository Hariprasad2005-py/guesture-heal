// frontend/src/utils/reportGenerator.js
export async function generatePDFReport(report, patient = null) {
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header
    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("GestureHeal", margin, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Clinical Assessment Report", margin, 27);
    doc.text(`Report No: ${report.reportNumber || report._id || "N/A"}`, pageW - margin, 18, { align: "right" });
    doc.text(`Generated: ${new Date(report.generatedAt || report.createdAt).toLocaleDateString()}`, pageW - margin, 27, { align: "right" });

    y = 52;
    doc.setTextColor(30, 41, 59);

    // Patient Information
    // IMPORTANT: every fallback below uses `!=  null` / `??`, never `||` or
    // a truthy ternary. A legitimate value of 0 (e.g. painLevel: 0, meaning
    // "no pain") must render as "0/10", not silently fall through to "—"
    // just because 0 is falsy in JavaScript.
    const snap = report.patientSnapshot || {};
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Patient Information", margin, y);
    y += 2;
    doc.setDrawColor(20, 184, 166);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const patientRows = [
      ["Name", snap.name || patient?.name || "—"],
      ["Age", snap.age != null ? `${snap.age} years` : "—"],
      ["Gender", snap.gender ?? "—"],
      ["Condition", snap.condition ?? "—"],
      ["Surgery Type", snap.surgeryType ?? "—"],
      ["Surgery Date", snap.surgeryDate ? new Date(snap.surgeryDate).toLocaleDateString() : "—"],
      ["Pain Level", snap.painLevel != null ? `${snap.painLevel}/10` : "—"],
      ["Goals", snap.goals ?? "—"],
    ];
    patientRows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), margin + 40, y);
      y += 7;
    });

    y += 5;

    // Session Performance
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Session Performance", margin, y);
    y += 2;
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    const perf = report.performance || {};
    const perfRows = [
      ["Day", perf.day ?? "—"],
      ["Score", perf.score != null ? perf.score.toLocaleString() : "—"],
      // No fabricated default of "1" here anymore: some games (e.g. Cloud
      // Reach) have no leveled-progression concept at all, so showing a
      // fake "Level 1" implied a game state that doesn't exist for them.
      ["Level Reached", perf.level ?? "—"],
      ["Movement Accuracy", perf.accuracy != null ? `${perf.accuracy}%` : "—"],
      ["Max Combo", perf.combo ?? "—"],
      [
        "Stars",
        perf.stars != null
          ? `${"★".repeat(perf.stars)}${"☆".repeat(Math.max(0, 3 - perf.stars))}`
          : "—",
      ],
      [
        "Duration",
        perf.durationSeconds != null
          ? `${Math.floor(perf.durationSeconds / 60)}m ${perf.durationSeconds % 60}s`
          : "—",
      ],
      ["Exercises Completed", perf.exercisesCompleted ?? "—"],
      ["Total Reps", perf.totalReps ?? "—"],
    ];

    doc.setFontSize(10);
    const halfW = (pageW - margin * 2) / 2;
    perfRows.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * halfW;
      const rowY = y + row * 8;
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, x, rowY);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), x + 38, rowY);
    });
    y += Math.ceil(perfRows.length / 2) * 8 + 8;

    // ROM Analysis
    if (report.romAnalysis && report.romAnalysis.length > 0) {
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Range of Motion Analysis", margin, y);
      y += 2;
      doc.line(margin, y, pageW - margin, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y - 4, pageW - margin * 2, 8, "F");
      doc.setFont("helvetica", "bold");
      const cols = [margin, margin + 55, margin + 90, margin + 120, margin + 152];
      ["Exercise", "Avg ROM°", "Max ROM°", "Target ROM°", "Achievement"].forEach((h, i) => {
        doc.text(h, cols[i], y);
      });
      y += 7;

      doc.setFont("helvetica", "normal");
      report.romAnalysis.forEach((row) => {
        if (y > 260) { doc.addPage(); y = margin; }
        doc.text(row.exerciseName || "—", cols[0], y);
        doc.text(String(row.averageRom ?? "—"), cols[1], y);
        doc.text(String(row.maxRom ?? "—"), cols[2], y);
        doc.text(String(row.targetRom ?? "—"), cols[3], y);
        const pct = row.percentageAchieved ?? 0;
        doc.setTextColor(pct >= 90 ? 21 : pct >= 70 ? 217 : 239, pct >= 90 ? 128 : pct >= 70 ? 119 : 68, pct >= 90 ? 61 : pct >= 70 ? 6 : 68);
        doc.text(`${pct}%`, cols[4], y);
        doc.setTextColor(30, 41, 59);
        y += 7;
      });
      y += 5;
    }

    // Clinical Observations
    if (report.observations || report.recommendations) {
      if (y > 230) { doc.addPage(); y = margin; }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Clinical Observations & Recommendations", margin, y);
      y += 2;
      doc.line(margin, y, pageW - margin, y);
      y += 7;

      doc.setFontSize(10);
      if (report.observations) {
        doc.setFont("helvetica", "bold");
        doc.text("Observations:", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        const obsLines = doc.splitTextToSize(report.observations || "No observations recorded.", pageW - margin * 2);
        doc.text(obsLines, margin, y);
        y += obsLines.length * 6 + 5;
      }

      if (report.recommendations) {
        doc.setFont("helvetica", "bold");
        doc.text("Recommendations:", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        const recLines = doc.splitTextToSize(report.recommendations || "No recommendations available.", pageW - margin * 2);
        doc.text(recLines, margin, y);
        y += recLines.length * 6 + 5;
      }

      if (report.therapistNotes) {
        doc.setFont("helvetica", "bold");
        doc.text("Therapist Notes:", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(report.therapistNotes || "No therapist notes.", pageW - margin * 2);
        doc.text(noteLines, margin, y);
      }
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `GestureHeal Clinical Report  •  Page ${i} of ${pageCount}  •  Confidential`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    const filename = `GestureHeal_Report_${report.reportNumber || report._id || "export"}.pdf`;
    doc.save(filename);
    return true;
  } catch (err) {
    console.error("[reportGenerator] PDF generation failed:", err);
    // Re-throw with a user-friendly message
    throw new Error(`Failed to generate PDF report: ${err.message || "Unknown error"}`);
  }
}