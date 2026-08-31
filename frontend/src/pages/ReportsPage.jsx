// frontend/src/pages/ReportsPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { reportApi, sessionApi, patientApi, patientPublicApi, adminApi } from "../utils/apiService";
import { reportDB, sessionDB } from "../utils/sessionStore";
import { generatePDFReport } from "../utils/reportGenerator";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import {
  Download,
  FileText,
  Loader2,
  Filter,
  Calendar,
  TrendingUp,
  Trophy,
  Target,
  Activity,
  ArrowLeft,
  Printer,
  User,
  Clipboard,
  FileText as FileTextIcon,
  Info,
  AlertTriangle,
  AlertCircle,
  Check,
  X,
  PenTool,
  BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";
import MetricsChart from "../components/rehab/MetricsChart";

// report.gameType is the real enum stored on the backend
const GAME_TYPE_LABELS = {
  rehab_slicer: "🍉 Rehab Slicer",
  precision_reach: "🚀 Precision Reach",
  catch_flex: "🧺 Catch & Flex",
  canvas_air: "🎨 Canvas Air",
  cloud_reach: "☁️ Cloud Reach",
};

function formatGameType(gameType) {
  if (!gameType) return "Unknown Game";
  return GAME_TYPE_LABELS[gameType] || gameType.replace(/_/g, " ");
}

function formatClinicalDate(value, fallback = "Not recorded") {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(value, fallback = "Not recorded") {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function getPatientInfo(report) {
  const ref = report.patientId;
  const populated = ref && typeof ref === "object" ? ref : null;
  const snapshot = report.patientSnapshot || {};
  return {
    publicId: report.patientIdRef || (typeof ref === "string" ? ref : null) || "Unknown ID",
    name: snapshot.name || populated?.name || null,
    age: snapshot.age ?? populated?.age ?? null,
    gender: snapshot.gender ?? populated?.gender ?? null,
    condition: snapshot.condition || populated?.condition || null,
    surgeryType: snapshot.surgeryType || populated?.surgeryType || null,
    surgeryDate: snapshot.surgeryDate || populated?.surgeryDate || null,
    goals: snapshot.goals || populated?.goals || null,
    painLevel: snapshot.painLevel ?? populated?.painLevel ?? null,
  };
}

function summarizeRepData(repData) {
  if (!Array.isArray(repData) || repData.length === 0) return null;
  const withRom = repData.filter((r) => typeof r.rom === "number");
  const withConfidence = repData.filter((r) => typeof r.confidence === "number");
  return {
    count: repData.length,
    avgRom: withRom.length ? Math.round(withRom.reduce((s, r) => s + r.rom, 0) / withRom.length) : null,
    avgConfidence: withConfidence.length ? Math.round((withConfidence.reduce((s, r) => s + r.confidence, 0) / withConfidence.length) * 100) : null,
    correct: repData.filter((r) => r.isCorrect === true).length,
    incorrect: repData.filter((r) => r.isCorrect === false).length,
  };
}

function averageRomAttainment(romAnalysis) {
  if (!Array.isArray(romAnalysis) || romAnalysis.length === 0) return null;
  const withPct = romAnalysis.filter((r) => typeof r.percentageAchieved === "number");
  if (!withPct.length) return null;
  return Math.round(withPct.reduce((s, r) => s + r.percentageAchieved, 0) / withPct.length);
}

function averageRomDegrees(romAnalysis) {
  if (!Array.isArray(romAnalysis) || romAnalysis.length === 0) return 0;
  const withRom = romAnalysis.filter((r) => typeof r.averageRom === "number");
  if (!withRom.length) return 0;
  return Math.round(withRom.reduce((s, r) => s + r.averageRom, 0) / withRom.length);
}

function normalizeLegacyLocalReport(local) {
  const legacyGameId = local.gameId;
  const gameType = legacyGameId ? legacyGameId.replace(/-/g, '_') : (local.gameType || null);
  return {
    ...local,
    _id: local._id || local.reportId,
    gameType,
    performance: local.performance || {
      score: local.score || 0,
      accuracy: local.accuracyPercent || 0,
      totalReps: local.reps || 0,
    },
    romAnalysis: local.romAnalysis || [],
    repData: local.repData || [],
    _offlineFallback: true,
  };
}

export default function ReportsPage() {
  const { patientId: patientIdFromUrl } = useParams();
  const navigate = useNavigate();
  const [selectedPatientId, setSelectedPatientId] = useState(patientIdFromUrl || "");
  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [filterGame, setFilterGame] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  // State for therapists cache
  const [therapists, setTherapists] = useState({});
  const [loadingTherapists, setLoadingTherapists] = useState(false);

  const isGlobalView = !patientIdFromUrl;
  const games = ["rehab_slicer", "precision_reach", "catch_flex", "canvas_air", "cloud_reach"];

  // ─── ROLE HELPER ──────────────────────────────────────────────────────────
  function isAdminUser() {
    try {
      const raw = localStorage.getItem("gestureheal-storage");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed?.state?.user?.role === "admin";
    } catch {
      return false;
    }
  }

  // ─── LOAD THERAPISTS ──────────────────────────────────────────────────────
  async function loadTherapists() {
    if (!isAdminUser()) return;
    if (loadingTherapists) return;
    setLoadingTherapists(true);
    try {
      const response = await adminApi.getTherapists();
      if (response && response.therapists) {
        const therapistMap = {};
        response.therapists.forEach(t => {
          therapistMap[t._id || t.id] = t.name || t.fullName || "Unknown Therapist";
        });
        setTherapists(therapistMap);
      }
    } catch (err) {
      console.warn('Failed to load therapists:', err);
    } finally {
      setLoadingTherapists(false);
    }
  }

  // ─── FETCH SINGLE THERAPIST ─────────────────────────────────────────────
  async function fetchTherapistById(therapistId) {
    if (!therapistId) return "Not Assigned";
    if (therapists[therapistId]) return therapists[therapistId];
    if (!isAdminUser()) return "Not Assigned";

    try {
      const response = await adminApi.getTherapistDetail(therapistId);
      if (response && response.therapist) {
        const name = response.therapist.name || response.therapist.fullName || "Unknown Therapist";
        setTherapists(prev => ({ ...prev, [therapistId]: name }));
        return name;
      }
      return "Unknown Therapist";
    } catch (err) {
      console.warn(`Failed to fetch therapist ${therapistId}:`, err);
      return "Not Assigned";
    }
  }

  // ─── LOAD PATIENTS ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isGlobalView) {
      patientApi.getAll()
        .then((data) => setPatients(data?.patients || []))
        .catch(() => toast.error("Failed to load patient list"));
    }
    loadTherapists();
  }, [isGlobalView]);

  // ─── LOAD REPORTS ──────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [patientIdFromUrl, selectedPatientId, filterGame, filterDate]);

  async function loadData() {
    setLoading(true);
    try {
      let reportsData = [];
      let sessionsData = [];

      if (isGlobalView) {
        try {
          const apiReports = await reportApi.getAll(selectedPatientId || undefined);
          reportsData = apiReports?.reports || [];
        } catch (err) {
          console.warn('Failed to fetch API reports, falling back to local cache:', err);
          const localReports = await reportDB.getReports({
            patientId: selectedPatientId || undefined,
            gameId: filterGame || undefined,
          });
          reportsData = localReports.map(normalizeLegacyLocalReport);
        }
      } else {
        const hasToken = !!localStorage.getItem("gestureheal-storage") &&
          JSON.parse(localStorage.getItem("gestureheal-storage") || "{}")?.state?.token;
        const isPublicId = patientIdFromUrl?.startsWith("GH-") || !hasToken;

        if (isPublicId) {
          try {
            const apiReports = await reportApi.getByPublicPatient(patientIdFromUrl);
            reportsData = apiReports?.reports || [];
          } catch (err) {
            console.warn('Failed to fetch public patient reports, falling back to local cache:', err);
            const localReports = await reportDB.getReports({
              patientId: patientIdFromUrl,
              gameId: filterGame || undefined,
            });
            reportsData = localReports.map(normalizeLegacyLocalReport);
          }
        } else {
          try {
            const [apiReports, apiSessions] = await Promise.all([
              reportApi.getByPatient(patientIdFromUrl),
              sessionApi.getByPatient(patientIdFromUrl),
            ]);
            reportsData = apiReports?.reports || [];
            sessionsData = apiSessions?.sessions || [];
          } catch (err) {
            console.warn('Failed to fetch reports/sessions for patient, falling back to local cache:', err);
            const localReports = await reportDB.getReports({
              patientId: patientIdFromUrl,
              gameId: filterGame || undefined,
            });
            reportsData = localReports.map(normalizeLegacyLocalReport);
          }
        }
      }

      // ─── ENRICH REPORTS WITH THERAPIST DATA ────────────────────────────
      const patientLookupCache = new Map();
      async function lookupPatient(patientIdValue) {
        if (patientLookupCache.has(patientIdValue)) {
          return patientLookupCache.get(patientIdValue);
        }
        const lookupPromise = (async () => {
          try {
            const isPublicId = String(patientIdValue).startsWith("GH-");
            const patientData = isPublicId
              ? await patientPublicApi.getById(patientIdValue)
              : await patientApi.getById(patientIdValue);
            return patientData?.patient || null;
          } catch (err) {
            console.warn(`Failed to fetch patient ${patientIdValue}:`, err);
            return null;
          }
        })();
        patientLookupCache.set(patientIdValue, lookupPromise);
        return lookupPromise;
      }

      const enrichedReports = await Promise.all(reportsData.map(async (report) => {
        const enriched = { ...report };

        if (!enriched.performance) enriched.performance = {};
        if (typeof enriched.performance.score !== "number") enriched.performance.score = 0;
        if (typeof enriched.performance.accuracy !== "number") enriched.performance.accuracy = 0;
        if (typeof enriched.performance.totalReps !== "number") enriched.performance.totalReps = 0;
        if (!Array.isArray(enriched.romAnalysis)) enriched.romAnalysis = [];
        if (!Array.isArray(enriched.repData)) enriched.repData = [];

        const snap = enriched.patientSnapshot || {};
        const isSnapshotStale = !snap.name || snap.name === "Unknown Patient";

        const rawPatientRef = enriched.patientId;
        const patientIdStr = rawPatientRef && typeof rawPatientRef === "object"
          ? rawPatientRef.patientId || rawPatientRef._id
          : rawPatientRef;
        const lookupId = enriched.patientIdRef || patientIdStr;

        let livePatient = null;
        if (lookupId) {
          livePatient = await lookupPatient(String(lookupId));
        }

        if (livePatient && isSnapshotStale) {
          enriched.patientSnapshot = {
            name: livePatient.name || snap.name,
            age: livePatient.age ?? snap.age,
            gender: livePatient.gender ?? snap.gender,
            condition: livePatient.condition || snap.condition,
            surgeryType: livePatient.surgeryType || snap.surgeryType,
            surgeryDate: livePatient.surgeryDate || snap.surgeryDate,
            painLevel: livePatient.painLevel ?? snap.painLevel,
            goals: livePatient.goals || snap.goals,
          };
        }

        let therapistName = "Not Assigned";

        if (enriched.therapistName) {
          therapistName = enriched.therapistName;
        } else if (enriched.therapistId) {
          if (therapists[enriched.therapistId]) {
            therapistName = therapists[enriched.therapistId];
          } else {
            const name = await fetchTherapistById(enriched.therapistId);
            therapistName = name;
          }
        } else if (rawPatientRef && typeof rawPatientRef === 'object' && rawPatientRef.therapistId) {
          const therapistId = rawPatientRef.therapistId;
          if (therapists[therapistId]) {
            therapistName = therapists[therapistId];
          } else {
            const name = await fetchTherapistById(therapistId);
            therapistName = name;
          }
        } else if (livePatient?.therapistId) {
          const therapistId = livePatient.therapistId;
          if (therapists[therapistId]) {
            therapistName = therapists[therapistId];
          } else {
            const name = await fetchTherapistById(therapistId);
            therapistName = name;
          }
        }

        enriched.therapistName = therapistName;
        return enriched;
      }));

      let filtered = enrichedReports;
      if (filterGame) {
        filtered = filtered.filter(r => r.gameType === filterGame);
      }
      if (filterDate) {
        const dateStr = new Date(filterDate).toDateString();
        filtered = filtered.filter(r => {
          const rDate = new Date(r.generatedAt || r.date || r.createdAt);
          return rDate.toDateString() === dateStr;
        });
      }

      const seen = new Set();
      const unique = filtered.filter(r => {
        const key = r.sessionId || r._id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setReports(unique);
      setSessions(sessionsData);
    } catch (err) {
      console.error('Failed to load reports:', err);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport(sessionId) {
    setGeneratingId(sessionId);
    try {
      await reportApi.generate(sessionId);
      toast.success("Report generated!");
      await loadData();
    } catch (err) {
      toast.error("Failed to generate report: " + (err.message || "Unknown error"));
    } finally {
      setGeneratingId(null);
    }
  }

 async function handleDownloadPDF(report) {
  const rid = report._id || report.reportId || report.id;
  setDownloadingId(rid);
  try {
    // Use the full production URL instead of localhost proxy
    const API_URL = import.meta.env.VITE_API_URL || "https://gestureheal-backend.onrender.com/api";
    const token = localStorage.getItem('token') || 
      JSON.parse(localStorage.getItem('gestureheal-storage') || '{}')?.state?.token;

    const res = await fetch(`${API_URL}/reports/${rid}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
    const data = await res.json();
    
    let fullReport = data?.report || report;

    // ... (Keep your existing patientSnapshot patching logic here)
    
    await generatePDFReport(fullReport);
    toast.success("PDF downloaded!");
  } catch (err) {
    toast.error("PDF generation failed: " + (err.message || "unknown error"));
  } finally {
    setDownloadingId(null);
  }
}

  function handleViewReport(report) {
    if (!report) {
      toast.error("No report data available");
      return;
    }

    const safeReport = {
      ...report,
      performance: report.performance || {},
      romAnalysis: report.romAnalysis || [],
      repData: report.repData || [],
      romData: report.romData || null,
      gameType: report.gameType || null,
      therapistName: report.therapistName || "Not Assigned",
      observations: report.observations || "",
      recommendations: report.recommendations || "",
    };

    setSelectedReport(safeReport);
    setShowDetail(true);
  }

  const stats = {
    total: reports.length,
    totalScore: reports.reduce((sum, r) => sum + (r.performance?.score || 0), 0),
    avgAccuracy: reports.length ? Math.round(reports.reduce((sum, r) => sum + (r.performance?.accuracy || 0), 0) / reports.length) : 0,
    avgRom: reports.length ? Math.round(reports.reduce((sum, r) => sum + averageRomDegrees(r.romAnalysis), 0) / reports.length) : 0,
    byGame: games.reduce((acc, game) => {
      const gameReports = reports.filter(r => r.gameType === game);
      acc[game] = {
        count: gameReports.length,
        avgScore: gameReports.length ? Math.round(gameReports.reduce((s, r) => s + (r.performance?.score || 0), 0) / gameReports.length) : 0,
        avgAccuracy: gameReports.length ? Math.round(gameReports.reduce((s, r) => s + (r.performance?.accuracy || 0), 0) / gameReports.length) : 0,
        avgRom: gameReports.length ? Math.round(gameReports.reduce((s, r) => s + averageRomDegrees(r.romAnalysis), 0) / gameReports.length) : 0,
      };
      return acc;
    }, {}),
  };

  if (loading) return <LoadingSpinner text="Loading reports..." />;

  const reportedSessionIds = new Set(reports.map(r => String(r.sessionId || r._id)));
  const pendingSessions = sessions.filter(
    s => s.status === "completed" && !reportedSessionIds.has(String(s._id || s.id))
  );

  // ─── CLINICAL REPORT DETAIL VIEW ──────────────────────────────────────────

  if (showDetail && selectedReport) {
    const report = selectedReport;
    const repData = report.repData || [];
    const repSummary = summarizeRepData(repData);
    const gameName = formatGameType(report.gameType);

    const info = getPatientInfo(report);
    const patientName = info.name || "Unknown Patient";

    const reportId = report.reportNumber || report._id || "Unknown";
    const sessionRef = report.sessionId;
    const sessionId = (sessionRef && typeof sessionRef === "object" ? sessionRef._id : sessionRef) || "Unknown";

    const generatedDate = new Date(report.generatedAt || report.date || report.createdAt || Date.now());
    const formattedDate = generatedDate.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const formattedTime = generatedDate.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const therapistName = report.therapistName ||
      report.therapist ||
      (report.therapistId && therapists[report.therapistId]) ||
      "Not Assigned";

    const patientData = {
      fullName: patientName,
      patientId: info.publicId,
      age: info.age ?? "Not recorded",
      gender: info.gender || "Not recorded",
      therapist: therapistName,
      condition: info.condition || "Not recorded",
      surgeryType: info.surgeryType || "Not recorded",
      surgeryDate: info.surgeryDate || null,
      goals: info.goals || "Not recorded",
      baselinePainLevel: info.painLevel != null ? `${info.painLevel} / 10` : "Not recorded",
    };

    const romAttainmentPct = averageRomAttainment(report.romAnalysis);

    const getClinicalStatus = (value, target, threshold) => {
      if (value >= target) return { status: 'Within target parameters', icon: <Check size={14} className="text-emerald-600" />, color: 'text-emerald-600' };
      if (value >= threshold) return { status: 'Approaching target', icon: <AlertCircle size={14} className="text-amber-600" />, color: 'text-amber-600' };
      return { status: 'Requires attention', icon: <AlertTriangle size={14} className="text-red-600" />, color: 'text-red-600' };
    };

    const romStatus = romAttainmentPct != null ? getClinicalStatus(romAttainmentPct, 90, 70) : null;
    const accuracyStatus = getClinicalStatus(report.performance?.accuracy || 0, 75, 50);

    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
        {/* Action Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6 bg-white rounded-xl p-4 border border-slate-200 shadow-sm print:hidden">
          <button
            onClick={() => setShowDetail(false)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium"
          >
            <ArrowLeft size={18} />
            Back to Reports
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 font-medium"
            >
              <Printer size={16} />
              Print
            </button>
            <button
              onClick={() => handleDownloadPDF(report)}
              disabled={downloadingId === (report._id || report.reportId)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-60"
            >
              {downloadingId === (report._id || report.reportId) ? (
                <><Loader2 size={16} className="animate-spin" /> Downloading...</>
              ) : (
                <><Download size={16} /> Download PDF</>
              )}
            </button>
          </div>
        </div>

        {/* ─── CLINICAL REPORT ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden print:shadow-none print:border print:rounded-none" id="report-content">

          {/* ─── REPORT HEADER ────────────────────────────────────────────────── */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="bg-white/10 p-2 rounded-lg print:bg-slate-100 print:p-2 print:rounded-lg">
                    <FileTextIcon size={24} className="text-white print:text-slate-800" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">Clinical Assessment Report</h1>
                    <p className="text-slate-300 text-sm print:text-gray-600">GestureHeal Rehabilitation Center</p>
                  </div>
                </div>
              </div>
              <div className="text-right border-l-2 border-white/30 pl-4 print:border-gray-300">
                <div className="text-xs uppercase tracking-wider opacity-70 print:text-gray-500">Report ID</div>
                <div className="text-lg font-bold font-mono tracking-wide">{reportId}</div>
                <div className="text-sm mt-1 text-slate-300 print:text-gray-600">
                  <div>{formattedDate}</div>
                  <div className="text-xs opacity-70">• {formattedTime} •</div>
                </div>
                <div className="text-[10px] uppercase tracking-wider opacity-50 print:text-gray-400 mt-1">
                  Authorized for Clinical Use Only
                </div>
              </div>
            </div>
          </div>

          {/* ─── PATIENT INFORMATION ────────────────────────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900 uppercase tracking-wide text-sm">Patient Information</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Full Name</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Patient ID</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Age / Gender</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Therapist</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">{patientData.fullName}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{patientData.patientId}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{patientData.age} / {patientData.gender}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{patientData.therapist}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              <span className="text-slate-400">Rehab Goals:</span> {patientData.goals}
            </div>
          </div>

          {/* ─── CLINICAL ASSESSMENT ────────────────────────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Clipboard size={18} className="text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900 uppercase tracking-wide text-sm">Clinical Assessment</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Primary Diagnosis</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Surgery Type</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Surgery Date</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Game / Session Type</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">{patientData.condition}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{patientData.surgeryType}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{formatClinicalDate(patientData.surgeryDate)}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{gameName}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── SESSION PERFORMANCE METRICS ────────────────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={18} className="text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900 uppercase tracking-wide text-sm">Session Performance Metrics</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Metric Parameters</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Recorded Value</th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Clinical Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Session ID</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200 font-mono text-sm">{sessionId}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-emerald-600"><Check size={14} /> Session recorded</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Movement Accuracy</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{report.performance?.accuracy || 0}%</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className={`flex items-center gap-1 ${accuracyStatus.color}`}>{accuracyStatus.icon} {accuracyStatus.status}</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">ROM Attainment (vs. target, avg across exercises)</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{romAttainmentPct != null ? `${romAttainmentPct}%` : 'Not recorded'}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{romStatus ? (<span className={`flex items-center gap-1 ${romStatus.color}`}>{romStatus.icon} {romStatus.status}</span>) : (<span className="flex items-center gap-1 text-slate-400"><Info size={14} /> No exercise ROM data</span>)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Completed Repetitions</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{report.performance?.totalReps || 0} Reps</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-blue-600"><Info size={14} /> Recorded</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Level Reached</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{report.performance?.level ?? 'Not recorded'}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-blue-600"><Info size={14} /> Recorded</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Max Combo</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{report.performance?.maxCombo ?? 'Not recorded'}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-blue-600"><Info size={14} /> Recorded</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Session Duration</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{report.performance?.durationSeconds != null ? `${Math.round(report.performance.durationSeconds / 60 * 10) / 10} min` : 'Not recorded'}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-blue-600"><Info size={14} /> Recorded</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Session Start / End</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{formatDateTime(report.performance?.startedAt)} → {formatDateTime(report.performance?.completedAt)}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-blue-600"><Info size={14} /> Recorded</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Patient Baseline Pain Level</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{patientData.baselinePainLevel}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-slate-400"><Info size={14} /> From patient record at report time, not a live session reading</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">Total Score</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">{report.performance?.score || 0}</td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200"><span className="flex items-center gap-1 text-blue-600"><Info size={14} /> Baseline recorded</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── PER-REP ROM CHART ────────────────────────────────────────────── */}
          {repData.length > 0 && (
            <div className="p-6 md:p-8 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Range of Motion per Repetition</h3>
              <p className="text-xs text-slate-400 mb-3">Per-rep ROM in degrees, recorded during the session ({repData.length} reps).</p>
              <div className="bg-slate-50 rounded-xl p-4">
                <MetricsChart data={repData} xKey="repNumber" yKey="rom" label="ROM (°)" color="#0ea5e9" height={250} />
              </div>
            </div>
          )}

          {/* ─── PER-REP SUMMARY ──────────────────────────────────────────── */}
          {repSummary && (
            <div className="p-6 md:p-8 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-slate-500" />
                Per-Rep Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Reps Recorded</p>
                  <p className="text-lg font-bold text-slate-900">{repSummary.count}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Average ROM</p>
                  <p className="text-lg font-bold text-slate-900">{repSummary.avgRom != null ? `${repSummary.avgRom}°` : 'Not recorded'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Average Confidence</p>
                  <p className="text-lg font-bold text-slate-900">{repSummary.avgConfidence != null ? `${repSummary.avgConfidence}%` : 'Not recorded'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Correct / Incorrect</p>
                  <p className="text-lg font-bold text-slate-900">{repSummary.correct} / {repSummary.incorrect}</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── JOINT-SPECIFIC ROM ────────────────────────────────────────── */}
          {report.romData && (
            <div className="p-6 md:p-8 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Activity size={16} className="text-slate-500" />
                Joint-Specific ROM
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Shoulder</p>
                  <p className="text-sm text-slate-900">Flexion: <span className="font-semibold">{report.romData.shoulder?.flexion ?? 0}°</span></p>
                  <p className="text-sm text-slate-900">Extension: <span className="font-semibold">{report.romData.shoulder?.extension ?? 0}°</span></p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Elbow</p>
                  <p className="text-sm text-slate-900">Flexion: <span className="font-semibold">{report.romData.elbow?.flexion ?? 0}°</span></p>
                  <p className="text-sm text-slate-900">Extension: <span className="font-semibold">{report.romData.elbow?.extension ?? 0}°</span></p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Wrist</p>
                  <p className="text-sm text-slate-900">Flexion: <span className="font-semibold">{report.romData.wrist?.flexion ?? 0}°</span></p>
                  <p className="text-sm text-slate-900">Extension: <span className="font-semibold">{report.romData.wrist?.extension ?? 0}°</span></p>
                  <p className="text-sm text-slate-900">Rotation: <span className="font-semibold">{report.romData.wrist?.rotation ?? 0}°</span></p>
                </div>
              </div>
            </div>
          )}

          {/* ─── ROM ANALYSIS BY EXERCISE ───────────────────────────────────── */}
          {report.romAnalysis && report.romAnalysis.length > 0 && (
            <div className="p-6 md:p-8 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Target size={16} className="text-slate-500" />
                ROM Analysis by Exercise
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Exercise</th>
                      <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Average ROM</th>
                      <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Max ROM</th>
                      <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">Target ROM</th>
                      <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 font-semibold border border-slate-200">% Achieved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.romAnalysis.map((ex, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-medium text-slate-900 border border-slate-200">{ex.exerciseName || 'Unknown'}</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.averageRom ?? 0}°</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.maxRom ?? 0}°</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.targetRom ?? 0}°</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.percentageAchieved ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── MOVEMENT QUALITY ──────────────────────────────────────────── */}
          {(report.smoothness != null || report.stability != null) && (
            <div className="p-6 md:p-8 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Activity size={16} className="text-slate-500" />
                Movement Quality
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Smoothness</p>
                  <p className="text-lg font-bold text-slate-900">{report.smoothness != null ? report.smoothness : 'Not recorded'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Stability</p>
                  <p className="text-lg font-bold text-slate-900">{report.stability != null ? report.stability : 'Not recorded'}</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── CLINICAL OBSERVATIONS & RECOMMENDATIONS ────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <PenTool size={18} className="text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900 uppercase tracking-wide text-sm">Clinical Observations</h2>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-slate-700">
              <p className="text-sm text-slate-700 leading-relaxed">{report.observations || "Not recorded"}</p>
            </div>
          </div>

          <div className="p-6 md:p-8 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Clipboard size={18} className="text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900 uppercase tracking-wide text-sm">Recommendations</h2>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-slate-700">
              <p className="text-sm text-slate-700 leading-relaxed">{report.recommendations || "Not recorded"}</p>
            </div>
          </div>

          {/* ─── FOOTER ────────────────────────────────────────────────────── */}
          <div className="bg-slate-50 p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-500 gap-2">
              <div className="flex items-center gap-4">
                <span>© {new Date().getFullYear()} GestureHeal</span>
                <span className="hidden md:inline">|</span>
                <span>Clinical Report • Confidential</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-700 font-medium">🏥 GestureHeal</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── PRINT STYLES ────────────────────────────────────────────────── */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body { background: white !important; }
            .print\\:hidden { display: none !important; }
            .print\\:shadow-none { box-shadow: none !important; }
            .print\\:border { border: 1px solid #e5e7eb !important; }
            .print\\:rounded-none { border-radius: 0 !important; }
            .print\\:bg-white { background: white !important; }
            .print\\:text-black { color: black !important; }
            .print\\:border-b-2 { border-bottom: 2px solid #1e293b !important; }
            .print\\:border-gray-300 { border-color: #d1d5db !important; }
            .print\\:text-gray-600 { color: #4b5563 !important; }
            .print\\:text-gray-500 { color: #6b7280 !important; }
            .print\\:text-gray-400 { color: #9ca3af !important; }
            .print\\:bg-gray-50 { background: #f9fafb !important; }
            .print\\:bg-slate-100 { background: #f1f5f9 !important; }
            .print\\:text-slate-800 { color: #1e293b !important; }
            .print\\:border-slate-800 { border-color: #1e293b !important; }
            #report-content { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          }
        `}} />

      </div>
    );
  }

  // ─── MAIN REPORTS LIST VIEW ─────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 py-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Reports Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {reports.length} session{reports.length !== 1 ? "s" : ""} tracked
            {selectedPatientId && patients.find(p => p._id === selectedPatientId)?.name
              ? ` — ${patients.find(p => p._id === selectedPatientId)?.name}`
              : ""}
          </p>
        </div>
      </div>

      {/* ─── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <Filter size={15} className="text-slate-400 flex-shrink-0" />
        {isGlobalView && (
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Patients</option>
            {patients.map((p) => (
              <option key={p._id || p.id} value={p._id || p.id}>
                {p.name} ({p.patientId})
              </option>
            ))}
          </select>
        )}

        <select
          value={filterGame}
          onChange={(e) => setFilterGame(e.target.value)}
          className="flex-1 min-w-[140px] border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Games</option>
          {games.map(g => (
            <option key={g} value={g}>{formatGameType(g)}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 flex-1 min-w-[140px] border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500">
          <Calendar size={14} className="text-slate-400 flex-shrink-0" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
          />
        </div>

        {(filterGame || filterDate) && (
          <button
            onClick={() => { setFilterGame(""); setFilterDate(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* ─── Summary Stats ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Reports", value: stats.total, icon: FileText, color: "blue" },
          { label: "Total Score", value: stats.totalScore.toLocaleString(), icon: Trophy, color: "violet" },
          { label: "Avg Accuracy", value: `${stats.avgAccuracy}%`, icon: TrendingUp, color: "teal" },
          { label: "Avg ROM", value: `${stats.avgRom}°`, icon: Activity, color: "amber" },
        ].map(({ label, value, icon: Icon, color }) => {
          const palettes = {
            blue: "bg-blue-50 text-blue-600 border-blue-100",
            violet: "bg-violet-50 text-violet-600 border-violet-100",
            teal: "bg-teal-50 text-teal-600 border-teal-100",
            amber: "bg-amber-50 text-amber-600 border-amber-100",
          };
          return (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl border flex-shrink-0 flex items-center justify-center ${palettes[color]}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{label}</p>
                <p className="text-3xl font-extrabold text-slate-900 leading-snug">{value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Game Breakdown ──────────────────────────────────────────────── */}
      {Object.values(stats.byGame).some(d => d.count > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats.byGame).map(([game, data]) =>
            data.count > 0 && (
              <div key={game} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-sm font-semibold text-slate-500 mb-1 truncate">{formatGameType(game)}</p>
                <p className="text-2xl font-extrabold text-slate-900">{data.count} <span className="text-base font-semibold text-slate-500">sessions</span></p>
                <p className="text-xs text-slate-400 mt-1">Acc: {data.avgAccuracy}%</p>
              </div>
            )
          )}
        </div>
      )}

      {/* ─── Pending Sessions ────────────────────────────────────────────── */}
      {!isGlobalView && pendingSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">Sessions Awaiting Reports</h2>
          {pendingSessions.map((session) => {
            const sid = session._id || session.id;
            return (
              <div key={sid} className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Session — Day {session.day}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Score: {session.score || 0} · Accuracy: {session.accuracy || 0}%
                    {session.completedAt && (<span className="ml-2 text-slate-400">· {new Date(session.completedAt).toLocaleDateString()}</span>)}
                  </p>
                </div>
                <button
                  onClick={() => handleGenerateReport(sid)}
                  disabled={generatingId === sid}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 text-sm font-medium disabled:opacity-60 transition"
                >
                  {generatingId === sid ? (<><Loader2 size={14} className="animate-spin" /> Generating…</>) : ("Generate Report")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Reports List ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">
          {isGlobalView ? "All Reports" : "Generated Reports"}
        </h2>

        {reports.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-slate-300" />
            </div>
            <p className="font-semibold text-slate-700">No reports yet</p>
            <p className="text-sm text-slate-400 mt-1">Complete a game session to generate reports</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const rid = report._id || report.reportNumber || report.id;
              const isDownloading = downloadingId === rid;
              const info = getPatientInfo(report);
              const accuracy = report.performance?.accuracy ?? 0;
              const accuracyColor = accuracy >= 75 ? "text-emerald-600 bg-emerald-50" : accuracy >= 50 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";

              return (
                <div key={rid} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200 cursor-pointer group" onClick={() => handleViewReport(report)}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* Left: game + patient + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap mb-2">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                          {report.gameType ? report.gameType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Unknown Game"}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar size={11} />
                          {new Date(report.generatedAt || report.date || report.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {isGlobalView && info.name && (<span className="text-xs text-slate-500 flex items-center gap-1"><BarChart3 size={11} />{info.name}</span>)}
                        {report.reportNumber && (<span className="text-xs text-slate-300 font-mono">{report.reportNumber}</span>)}
                      </div>

                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="text-slate-600 font-medium">Score: <span className="font-semibold text-slate-900">{report.performance?.score?.toLocaleString() ?? 0}</span></span>
                        <span className={`font-semibold rounded px-1.5 py-0.5 text-xs ${accuracyColor}`}>{accuracy}% accuracy</span>
                        <span className="text-slate-600 font-medium">Reps: <span className="font-semibold text-slate-900">{report.performance?.totalReps ?? 0}</span></span>
                        {averageRomDegrees(report.romAnalysis) > 0 && (<span className="text-slate-600 font-medium">ROM: <span className="font-semibold text-slate-900">{averageRomDegrees(report.romAnalysis)}°</span></span>)}
                        {report.therapistName && report.therapistName !== "Not Assigned" && (<span className="text-slate-400 text-xs">Therapist: {report.therapistName}</span>)}
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleViewReport(report)} className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition">View</button>
                      <button onClick={() => handleDownloadPDF(report)} disabled={isDownloading} className="flex items-center gap-1.5 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 font-bold disabled:opacity-60 text-sm transition shadow-md shadow-blue-200">
                        {isDownloading ? (<><Loader2 size={12} className="animate-spin" /> Downloading…</>) : (<><Download size={12} /> PDF</>)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}