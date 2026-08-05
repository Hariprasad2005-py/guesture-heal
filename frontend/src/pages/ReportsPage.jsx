// frontend/src/pages/ReportsPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { reportApi, sessionApi, patientApi, adminApi } from "../utils/apiService";
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
  const games = ["rehab-slicer", "precision-reach", "catch-flex", "canvas-air"];

  const gameDisplayNames = {
    "rehab-slicer": "🍉 Rehab Slicer",
    "precision-reach": "🚀 Precision Reach",
    "catch-flex": "🧺 Catch & Flex",
    "canvas-air": "🎨 Canvas Air",
  };

  // ─── LOAD THERAPISTS ──────────────────────────────────────────────────────
  async function loadTherapists() {
    if (loadingTherapists) return;
    setLoadingTherapists(true);
    try {
      const token = localStorage.getItem("gestureheal-storage");
      if (token) {
        const response = await adminApi.getTherapists();
        if (response && response.therapists) {
          const therapistMap = {};
          response.therapists.forEach(t => {
            therapistMap[t._id || t.id] = t.name || t.fullName || "Unknown Therapist";
          });
          setTherapists(therapistMap);
          console.log("✅ Therapists loaded:", Object.keys(therapistMap).length);
        }
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
        const localReports = await reportDB.getReports({ 
          patientId: selectedPatientId || undefined,
          gameId: filterGame || undefined,
        });
        reportsData = localReports;
        
        try {
          const apiReports = await reportApi.getAll(selectedPatientId || undefined);
          if (apiReports?.reports) {
            reportsData = [...reportsData, ...apiReports.reports];
          }
        } catch (err) {
          console.warn('Failed to fetch API reports:', err);
        }
      } else {
        const hasToken = !!localStorage.getItem("gestureheal-storage") &&
          JSON.parse(localStorage.getItem("gestureheal-storage") || "{}")?.state?.token;
        const isPublicId = patientIdFromUrl?.startsWith("GH-") || !hasToken;
        
        if (isPublicId) {
          const localReports = await reportDB.getReports({ 
            patientId: patientIdFromUrl,
            gameId: filterGame || undefined,
          });
          reportsData = localReports;
          
          try {
            const apiReports = await reportApi.getByPublicPatient(patientIdFromUrl);
            if (apiReports?.reports) {
              reportsData = [...reportsData, ...apiReports.reports];
            }
          } catch (err) {
            console.warn('Failed to fetch public patient reports:', err);
          }
        } else {
          const [apiReports, apiSessions] = await Promise.all([
            reportApi.getByPatient(patientIdFromUrl),
            sessionApi.getByPatient(patientIdFromUrl),
          ]);
          reportsData = apiReports?.reports || [];
          sessionsData = apiSessions?.sessions || [];
          
          const localReports = await reportDB.getReports({ 
            patientId: patientIdFromUrl,
            gameId: filterGame || undefined,
          });
          reportsData = [...reportsData, ...localReports];
        }
      }

      // ─── ENRICH REPORTS WITH THERAPIST DATA ────────────────────────────
      const enrichedReports = await Promise.all(reportsData.map(async (report) => {
        const enriched = { ...report };
        
        if (!enriched.score) enriched.score = 0;
        if (!enriched.accuracyPercent) enriched.accuracyPercent = 0;
        if (!enriched.reps) enriched.reps = 0;
        if (!enriched.romData) enriched.romData = { averageRomDegrees: 0 };
        if (!enriched.romData.averageRomDegrees) enriched.romData.averageRomDegrees = 0;
        
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
        } else if (enriched.patientId && typeof enriched.patientId === 'object' && enriched.patientId.therapistId) {
          const therapistId = enriched.patientId.therapistId;
          if (therapists[therapistId]) {
            therapistName = therapists[therapistId];
          } else {
            const name = await fetchTherapistById(therapistId);
            therapistName = name;
          }
        } else if (enriched.patientId && typeof enriched.patientId === 'string' && enriched.patientId.length > 0) {
          try {
            const patientData = await patientApi.getById(enriched.patientId);
            if (patientData && patientData.patient && patientData.patient.therapistId) {
              const therapistId = patientData.patient.therapistId;
              if (therapists[therapistId]) {
                therapistName = therapists[therapistId];
              } else {
                const name = await fetchTherapistById(therapistId);
                therapistName = name;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch patient ${enriched.patientId}:`, err);
          }
        }
        
        enriched.therapistName = therapistName;
        return enriched;
      }));

      let filtered = enrichedReports;
      if (filterGame) {
        filtered = filtered.filter(r => r.gameId === filterGame);
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
      let fullReport = report;
      if (!fullReport.romAnalysis && report._id) {
        fullReport = await reportApi.getById(report._id);
        fullReport = fullReport?.report || fullReport;
      }
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
      score: report.score || 0,
      accuracyPercent: report.accuracyPercent || 0,
      reps: report.reps || 0,
      romData: report.romData || { averageRomDegrees: 0, perRep: [] },
      gameId: report.gameId || "unknown",
      patientName: report.patientName || "Unknown Patient",
      patientId: report.patientId || "Unknown ID",
      therapistName: report.therapistName || "Not Assigned",
    };
    
    setSelectedReport(safeReport);
    setShowDetail(true);
  }

  // Helper function to generate Report ID from patient name + ID
  function generateReportId(patientName, patientId) {
    if (!patientName && !patientId) {
      return `GH-${Date.now().toString().slice(-6)}`;
    }
    
    const nameParts = patientName?.trim().split(' ') || [];
    let initials = '';
    if (nameParts.length >= 2) {
      initials = nameParts[0][0].toUpperCase() + nameParts[1][0].toUpperCase();
    } else if (nameParts.length === 1) {
      initials = nameParts[0].slice(0, 2).toUpperCase();
    } else {
      initials = 'GH';
    }
    
    const idSuffix = patientId?.slice(-4) || Date.now().toString().slice(-4);
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0');
    
    return `${initials}-${dateStr}-${idSuffix}`;
  }

  // Helper function to generate Session ID (same format as Report ID)
  function generateSessionId(patientName, patientId) {
    if (!patientName && !patientId) {
      return `SES-${Date.now().toString().slice(-6)}`;
    }
    
    const nameParts = patientName?.trim().split(' ') || [];
    let initials = '';
    if (nameParts.length >= 2) {
      initials = nameParts[0][0].toUpperCase() + nameParts[1][0].toUpperCase();
    } else if (nameParts.length === 1) {
      initials = nameParts[0].slice(0, 2).toUpperCase();
    } else {
      initials = 'SS';
    }
    
    const idSuffix = patientId?.slice(-4) || Date.now().toString().slice(-4);
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0');
    
    return `${initials}-${dateStr}-${idSuffix}`;
  }

  const stats = {
    total: reports.length,
    totalScore: reports.reduce((sum, r) => sum + (r.score || 0), 0),
    avgAccuracy: reports.length ? Math.round(reports.reduce((sum, r) => sum + (r.accuracyPercent || 0), 0) / reports.length) : 0,
    avgRom: reports.length ? Math.round(reports.reduce((sum, r) => sum + (r.romData?.averageRomDegrees || 0), 0) / reports.length) : 0,
    byGame: games.reduce((acc, game) => {
      const gameReports = reports.filter(r => r.gameId === game);
      acc[game] = {
        count: gameReports.length,
        avgScore: gameReports.length ? Math.round(gameReports.reduce((s, r) => s + (r.score || 0), 0) / gameReports.length) : 0,
        avgAccuracy: gameReports.length ? Math.round(gameReports.reduce((s, r) => s + (r.accuracyPercent || 0), 0) / gameReports.length) : 0,
        avgRom: gameReports.length ? Math.round(gameReports.reduce((s, r) => s + (r.romData?.averageRomDegrees || 0), 0) / gameReports.length) : 0,
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
    const romData = report.romData?.perRep || [];
    const gameName = gameDisplayNames[report.gameId] || report.gameId || "Unknown Game";
    
    const patientName = report.patientName || "Unknown Patient";
    const patientId = report.patientId || "Unknown ID";
    
    // Generate Report ID
    const reportId = generateReportId(patientName, patientId);
    
    // Generate Session ID using the same format as Report ID
    const sessionId = generateSessionId(patientName, patientId);
    
    const generatedDate = new Date(report.generatedAt || report.date || report.createdAt || Date.now());
    const formattedDate = generatedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = generatedDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const therapistName = report.therapistName || 
                         report.therapist || 
                         (report.therapistId && therapists[report.therapistId]) || 
                         "Not Assigned";

    const patientData = {
      fullName: patientName,
      patientId: patientId,
      age: report.patientAge || 32,
      gender: report.patientGender || "Male",
      therapist: therapistName,
      bloodGroup: report.bloodGroup || "O+",
      allergies: report.allergies || "None reported",
      contact: report.contact || "+1 (555) 234-5678",
      dateOfBirth: report.dateOfBirth || "1994-03-15",
      primaryPhysician: report.primaryPhysician || "Dr. Sarah Thompson",
      department: report.department || "Physical Therapy & Rehabilitation",
      affectedSide: report.affectedSide || "Right Hand",
      surgicalDate: report.surgicalDate || "2026-04-01",
      postOpProgress: report.postOpProgress || "Week 1",
      painThreshold: report.painThreshold || "Level 3 / 10",
      targetRepetitions: report.targetRepetitions || "10 Reps",
    };

    const clinicalInterpretation = report.clinicalInterpretation || 
      `Patient ${patientData.fullName} is undergoing ${report.gameId?.replace('-', ' ')} rehabilitation with ${patientData.affectedSide} side involvement. Reported pain level before session was ${report.painLevel || 3} / 10. Current session goal: Improve ROM. Average ROM achieved: ${report.romData?.averageRomDegrees || 0}° with ${report.accuracyPercent || 0}% accuracy over ${report.reps || 0} Reps. Focus should remain on improving stability and increasing active range of motion without exceeding the pain threshold.`;

    const getClinicalStatus = (value, target, threshold) => {
      if (value >= target) return { status: 'Within target parameters', icon: <Check size={14} className="text-emerald-500" />, color: 'text-emerald-500' };
      if (value >= threshold) return { status: 'Approaching target', icon: <AlertCircle size={14} className="text-yellow-500" />, color: 'text-yellow-500' };
      return { status: 'Requires attention', icon: <AlertTriangle size={14} className="text-red-500" />, color: 'text-red-500' };
    };

    const romStatus = getClinicalStatus(report.romData?.averageRomDegrees || 0, 25, 15);
    const accuracyStatus = getClinicalStatus(report.accuracyPercent || 0, 75, 50);
    const repsStatus = getClinicalStatus(report.reps || 0, 10, 5);

    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
        {/* Action Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6 bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm print:hidden">
          <button
            onClick={() => setShowDetail(false)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium"
          >
            <ArrowLeft size={18} />
            Back to Reports
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-medium"
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden print:shadow-none print:border print:rounded-none" id="report-content">
          
          {/* ─── REPORT HEADER ────────────────────────────────────────────────── */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 md:p-8 print:bg-white print:text-black print:border-b-2 print:border-slate-800">
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
          <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 print:border-gray-300">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-slate-600 dark:text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white uppercase tracking-wide text-sm">
                Patient Information
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Full Name
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Patient ID
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Age / Gender
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Therapist
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      {patientData.fullName}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.patientId}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.age} / {patientData.gender}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.therapist}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── CLINICAL ASSESSMENT ────────────────────────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 print:border-gray-300">
            <div className="flex items-center gap-2 mb-4">
              <Clipboard size={18} className="text-slate-600 dark:text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white uppercase tracking-wide text-sm">
                Clinical Assessment
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Primary Diagnosis
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Affected Side
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Surgical Date
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Post-Op Progress
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      {report.diagnosis || "Nerve Injury Recovery"}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.affectedSide}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {new Date(patientData.surgicalDate).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.postOpProgress}
                    </td>
                  </tr>
                </tbody>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Pain Threshold (Target)
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Target Repetitions
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Session Goal
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Game
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.painThreshold}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {patientData.targetRepetitions}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      Improve ROM
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {gameName}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── SESSION PERFORMANCE METRICS ────────────────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 print:border-gray-300">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={18} className="text-slate-600 dark:text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white uppercase tracking-wide text-sm">
                Session Performance Metrics
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Metric Parameters
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Recorded Value
                    </th>
                    <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                      Clinical Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      Session ID
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono text-sm">
                      {sessionId}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <Check size={14} /> Active Tracking
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      Movement Accuracy
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {report.accuracyPercent || 0}%
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <span className={`flex items-center gap-1 ${accuracyStatus.color}`}>
                        {accuracyStatus.icon} {accuracyStatus.status}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      Range of Motion (Avg)
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {report.romData?.averageRomDegrees || 0}°
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <span className={`flex items-center gap-1 ${romStatus.color}`}>
                        {romStatus.icon} {romStatus.status}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      Completed Repetitions
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {report.reps || 0} Reps
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <span className={`flex items-center gap-1 ${repsStatus.color}`}>
                        {repsStatus.icon} {repsStatus.status}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      Post-Session Pain Level
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {report.painLevel || 3} / 10
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <Check size={14} /> At threshold
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                      Total Score
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {report.score || 0}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <span className="flex items-center gap-1 text-blue-500">
                        <Info size={14} /> Baseline recorded
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── ROM CHART ────────────────────────────────────────────────────── */}
          {romData && romData.length > 0 && (
            <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 print:border-gray-300">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Range of Motion Analysis (Per Repetition)</h3>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
                <MetricsChart
                  data={romData}
                  xKey="rep"
                  yKey="romDegrees"
                  label="ROM (°)"
                  color="#0ea5e9"
                  height={250}
                />
              </div>
            </div>
          )}

          {/* ─── GAME SPECIFIC METRICS ──────────────────────────────────────── */}
          {report.gameSpecificMetrics && Object.keys(report.gameSpecificMetrics).length > 0 && (
            <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 print:border-gray-300">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-slate-500" />
                Game Metrics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(report.gameSpecificMetrics).map(([key, value]) => (
                  <div key={key} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {typeof value === 'number' ? value.toLocaleString() : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── CLINICAL INTERPRETATION ────────────────────────────────────── */}
          <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-700 print:border-gray-300">
            <div className="flex items-center gap-2 mb-4">
              <PenTool size={18} className="text-slate-600 dark:text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white uppercase tracking-wide text-sm">
                Clinical Interpretation
              </h2>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border-l-4 border-slate-700 dark:border-slate-500">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {clinicalInterpretation}
              </p>
            </div>
          </div>

          {/* ─── FOOTER ────────────────────────────────────────────────────── */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 md:p-6 print:bg-gray-50">
            <div className="flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 gap-2">
              <div className="flex items-center gap-4">
                <span>© {new Date().getFullYear()} GestureHeal</span>
                <span className="hidden md:inline">|</span>
                <span>Clinical Report • Confidential</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-700 dark:text-slate-300 font-medium">🏥 GestureHeal</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── PRINT STYLES ────────────────────────────────────────────────── */}
        <style dangerouslySetInnerHTML={{ __html: `
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
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Reports Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {reports.length} sessions tracked across {Object.keys(stats.byGame).filter(g => stats.byGame[g].count > 0).length} games
            {selectedPatientId && patients.find(p => p._id === selectedPatientId)?.name && 
              ` — ${patients.find(p => p._id === selectedPatientId)?.name}`
            }
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isGlobalView && (
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="">All Games</option>
            {games.map(g => (
              <option key={g} value={g}>{gameDisplayNames[g] || g}</option>
            ))}
          </select>
          
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
          
          <button
            onClick={() => { setFilterGame(""); setFilterDate(""); }}
            className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Total Sessions</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Total Score</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalScore.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Avg Accuracy</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.avgAccuracy}%</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Avg ROM</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.avgRom}°</div>
        </div>
      </div>

      {/* Game Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(stats.byGame).map(([game, data]) => (
          data.count > 0 && (
            <div key={game} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-500 capitalize">{gameDisplayNames[game] || game}</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{data.count} sessions</div>
              <div className="text-sm text-slate-400">Score: {data.avgScore} | Acc: {data.avgAccuracy}%</div>
            </div>
          )
        ))}
      </div>

      {/* Pending Sessions */}
      {!isGlobalView && pendingSessions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Sessions Awaiting Reports
          </h2>
          <div className="space-y-3">
            {pendingSessions.map((session) => {
              const sid = session._id || session.id;
              return (
                <div
                  key={sid}
                  className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between flex-wrap gap-4"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Session — Day {session.day}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Score: {session.score || 0} | Accuracy: {session.accuracy || 0}%
                      {session.completedAt && (
                        <span className="ml-3 text-slate-400">
                          {new Date(session.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleGenerateReport(sid)}
                    disabled={generatingId === sid}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
                  >
                    {generatingId === sid ? (
                      <><Loader2 size={16} className="animate-spin" /> Generating...</>
                    ) : (
                      "Generate Report"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reports List */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {isGlobalView ? "All Reports" : "Generated Reports"}
        </h2>
        {reports.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <FileText size={40} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">No reports yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Complete a game session to generate reports</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const rid = report._id || report.reportId || report.id;
              const isDownloading = downloadingId === rid;
              const patientName = report.patientId?.name || report.patientName;
              const gameName = gameDisplayNames[report.gameId] || report.gameId || 'Unknown';

              return (
                <div
                  key={rid}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition cursor-pointer"
                  onClick={() => handleViewReport(report)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-lg">{gameName}</span>
                        <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded text-xs font-medium">
                          {report.gameId?.replace('-', ' ').toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span className="text-slate-400 text-sm">
                          {new Date(report.generatedAt || report.date || report.createdAt).toLocaleDateString()}
                        </span>
                        {isGlobalView && patientName && (
                          <span className="text-sm text-slate-500">— {patientName}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        <span className="text-slate-600 dark:text-slate-300">
                          Score: <span className="font-semibold text-slate-900 dark:text-white">{report.score?.toLocaleString() || 0}</span>
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Accuracy: <span className="font-semibold text-slate-900 dark:text-white">{report.accuracyPercent || 0}%</span>
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Reps: <span className="font-semibold text-slate-900 dark:text-white">{report.reps || 0}</span>
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          ROM: <span className="font-semibold text-slate-900 dark:text-white">{report.romData?.averageRomDegrees || 0}°</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleViewReport(report)}
                        className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(report)}
                        disabled={isDownloading}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-60 text-sm"
                      >
                        {isDownloading ? (
                          <><Loader2 size={14} className="animate-spin" /> Downloading...</>
                        ) : (
                          <><Download size={14} /> PDF</>
                        )}
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