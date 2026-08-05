// frontend/src/pages/SessionReportPage.jsx
import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { sessionApi, reportApi } from "../utils/apiService";
import { generatePDFReport } from "../utils/reportGenerator";
import { useAppStore } from "../store/appStore";
import { Trophy, Target, Repeat, Clock, Download, Loader2, ArrowRight, Home } from "lucide-react";
import toast from "react-hot-toast";

// Different games report slightly different summary shapes (CloudReach:
// {score, accuracy, reps, successes, misses, maxReach}; CatchFlex/CanvasAir:
// {score, level, accuracy, combo, maxCombo, stars, exerciseResults[],
// durationSeconds, missedActions, ...}). This normalizes either shape (or
// a fetched backend Session document) into one consistent display object,
// matching the field names ReportsPage / generatePDFReport already expect
// (report.performance.*), so the same session looks the same everywhere.
function normalize(raw, gameId, gameName) {
  if (!raw) return null;
  const exerciseResults = raw.exerciseResults || [];
  const totalReps =
    exerciseResults.reduce((sum, e) => sum + (e.repsCompleted || 0), 0) ||
    raw.reps ||
    raw.successes ||
    0;
  const accuracy =
    raw.accuracy ??
    (raw.reps ? Math.round(((raw.successes || 0) / raw.reps) * 100) : 0);

  return {
    gameId: raw.gameType || gameId,
    gameName,
    day: raw.day,
    score: raw.score ?? 0,
    level: raw.level ?? 1,
    accuracy,
    combo: raw.combo ?? 0,
    maxCombo: raw.maxCombo ?? raw.combo ?? 0,
    stars: raw.stars ?? 0,
    durationSeconds: raw.durationSeconds,
    totalReps,
    misses: raw.misses ?? raw.missedActions ?? 0,
    maxReach: raw.maxReach,
    exerciseResults,
    completedAt: raw.completedAt || new Date().toISOString(),
  };
}

function starString(stars = 0) {
  return "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars));
}

export default function SessionReportPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, currentPatient, publicPatientId } = useAppStore();
  const state = location.state;

  const [refreshed, setRefreshed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const patientId =
    state?.patientId || currentPatient?.patientId || publicPatientId || user?.patientId || null;
  const isTherapist = !!token && user?.role === "therapist";

  // Immediate, always-available view — built synchronously from whatever
  // navigate() passed in. Never blocks on the network.
  const immediate = useMemo(
    () => (state ? normalize(state, state.gameId, state.gameName) : null),
    [state]
  );

  // Best-available view: prefer the freshly-fetched canonical session once
  // it arrives, otherwise fall back to the immediate one.
  const display = refreshed || immediate;

  useEffect(() => {
    if (!state?.sessionId) return;

    let cancelled = false;
    setRefreshing(true);

    const fetchCanonical = async () => {
      try {
        const res = isTherapist
          ? await sessionApi.getById(state.sessionId)
          : patientId
          ? await sessionApi.publicGetById(state.sessionId, patientId)
          : null;
        const session = res?.session || res;
        if (!cancelled && session) {
          setRefreshed(normalize(session, state.gameId, state.gameName));
        }
      } catch (err) {
        // Session may not have finished saving yet (finishSession is
        // fire-and-forget) or the fetch route needs auth we don't have --
        // either way, the immediate summary already rendered, so this is
        // a silent best-effort upgrade, not a hard failure.
        console.warn("[SessionReportPage] Could not refresh canonical session:", err);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    fetchCanonical();

    // Therapist-owned sessions: also trigger official Report generation in
    // the background so this session shows up correctly under /reports
    // afterward. Public (GH-xxxx) patients have no route for this -- their
    // therapist generates the official report later from ReportsPage's
    // "Sessions Awaiting Reports" list.
    if (isTherapist) {
      reportApi.generate(state.sessionId).catch(() => {
        // Non-fatal: session may still be mid-save server-side, or a
        // report may already exist. Either way this is a background nicety.
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.sessionId]);

  if (!state || !immediate) {
    return (
      <div className="max-w-xl mx-auto p-10 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">No session data found</h1>
        <p className="text-slate-500 mb-6">
          This page shows a report right after finishing a game. Try starting a new session.
        </p>
        <Link
          to="/games"
          className="inline-flex items-center gap-2 px-5 py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700"
        >
          Back to Games <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      // generatePDFReport only reads report.performance / report.romAnalysis
      // / report.patientSnapshot -- it doesn't care whether this is a real
      // DB-backed Report document, so this works even for public patients
      // who have no persisted Report yet.
      const reportShaped = {
        reportNumber: state.sessionId ? `Session-${String(state.sessionId).slice(-6)}` : "Session",
        generatedAt: display.completedAt,
        patientSnapshot: {
          name: currentPatient?.name || user?.name,
          condition: currentPatient?.condition,
        },
        performance: {
          day: display.day,
          score: display.score,
          level: display.level,
          accuracy: display.accuracy,
          combo: display.maxCombo,
          stars: display.stars,
          durationSeconds: display.durationSeconds,
          exercisesCompleted: display.exerciseResults.length || undefined,
          totalReps: display.totalReps,
        },
        romAnalysis: display.exerciseResults
          .filter((e) => e.averageRom || e.maxRom)
          .map((e) => ({
            exerciseName: e.name,
            averageRom: e.averageRom,
            maxRom: e.maxRom,
            targetRom: e.targetRom || 90,
            percentageAchieved: e.targetRom
              ? Math.round(((e.maxRom || 0) / e.targetRom) * 100)
              : undefined,
          })),
      };
      await generatePDFReport(reportShaped);
      toast.success("PDF downloaded!");
    } catch (err) {
      toast.error("PDF generation failed: " + (err.message || "unknown error"));
    } finally {
      setDownloading(false);
    }
  }

  const reportsLink = isTherapist && patientId
    ? `/reports/patient/${patientId}`
    : isTherapist
    ? "/reports"
    : patientId
    ? `/patient/dashboard/${patientId}`
    : "/games";

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
          <Trophy className="text-teal-600" size={36} />
        </div>
        <h1 className="text-3xl font-black text-slate-900">Session Complete!</h1>
        <p className="text-slate-500 mt-1">
          {display.gameName || "Rehab Session"}
          {refreshing && (
            <span className="inline-flex items-center gap-1 ml-2 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" /> syncing...
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Trophy} label="Score" value={display.score?.toLocaleString?.() ?? display.score} color="amber" />
        <StatCard icon={Target} label="Accuracy" value={`${display.accuracy}%`} color="teal" />
        <StatCard icon={Repeat} label="Reps" value={display.totalReps} color="blue" />
        <StatCard
          icon={Clock}
          label="Duration"
          value={
            display.durationSeconds
              ? `${Math.round(display.durationSeconds / 60)}m ${display.durationSeconds % 60}s`
              : "—"
          }
          color="purple"
        />
      </div>

      {display.stars > 0 && (
        <div className="text-center mb-8">
          <span className="text-3xl text-amber-400">{starString(display.stars)}</span>
        </div>
      )}

      {display.exerciseResults.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Exercise Breakdown</h2>
          <div className="space-y-3">
            {display.exerciseResults.map((e, i) => (
              <div key={i} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-800">{e.name}</span>
                <span className="text-slate-500">
                  {e.repsCompleted ?? 0} reps · {e.accuracy ?? 0}% accuracy
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-60"
        >
          {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          {downloading ? "Generating PDF..." : "Download Report"}
        </button>
        <Link
          to={reportsLink}
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700"
        >
          View All Reports <ArrowRight size={18} />
        </Link>
        <button
          onClick={() => navigate("/games")}
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
        >
          <Home size={18} /> Play Again
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    teal: "bg-teal-50 text-teal-600 border-teal-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  };
  return (
    <div className={`p-5 rounded-2xl border-2 text-center ${colors[color]}`}>
      <Icon size={20} className="mx-auto mb-2 opacity-70" />
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-60 mt-1">{label}</div>
    </div>
  );
}