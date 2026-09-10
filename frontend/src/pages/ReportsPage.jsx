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

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;

  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }

  return null;
}

function summarizeRepData(repData) {
  if (!Array.isArray(repData) || repData.length === 0) return null;

  const romValues = repData
    .map((r) => toFiniteNumber(r.rom) ?? toFiniteNumber(r.romDegrees))
    .filter((value) => value !== null);

  const confidenceValues = repData
    .map((r) => toFiniteNumber(r.confidence))
    .filter((value) => value !== null);

  const correctness = repData
    .map((r) =>
      normalizeBoolean(r.isCorrect !== undefined ? r.isCorrect : r.success)
    )
    .filter((value) => value !== null);

  const correct = correctness.filter((value) => value === true).length;
  const incorrect = correctness.filter((value) => value === false).length;

  return {
    count: repData.length,

    avgRom: romValues.length
      ? Math.round(romValues.reduce((sum, v) => sum + v, 0) / romValues.length)
      : null,

    avgConfidence: confidenceValues.length
      ? Math.round(
        (confidenceValues.reduce((sum, v) => sum + v, 0) /
          confidenceValues.length) *
        100
      )
      : null,

    correct,
    incorrect,

    correctnessRecorded: correctness.length > 0,
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

// ─── SHARED PATIENT RESOLUTION HELPER ─────────────────────────────────────
function extractPatientLookupId(report) {
  if (!report) return null;

  if (report.patientIdRef) return String(report.patientIdRef);

  const ref = report.patientId;

  if (typeof ref === "string" && ref.trim()) return ref;

  if (ref && typeof ref === "object") {
    if (ref.patientId) return String(ref.patientId);
    if (ref._id) return String(ref._id);
  }

  return null;
}

// ─── THERAPIST NAME vs ID DISTINCTION ─────────────────────────────────────

// A 24-character hex string is a MongoDB ObjectId — NOT a therapist name.
// Covers both ObjectId("...") and any hex string of that exact length.
function isLikelyObjectId(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!/^[a-fA-F0-9]{24}$/.test(s)) return false;
  return true;
}

// Returns a usable DISPLAY NAME from a therapist-shaped value, or null.
// STRICT: a raw string is NEVER accepted as a name — because a raw string
// might be a therapistId (ObjectId) rather than a display name. Only objects
// with an explicit .name / .fullName / .displayName / .username field yield
// a name. This is what prevents "6a4ccd3ce7c2649c265a5f5a" from being shown.
function extractNameFromTherapistValue(value) {
  if (!value) return null;

  if (typeof value === "object") {
    const candidates = [value.name, value.fullName, value.displayName, value.username];
    for (const c of candidates) {
      if (typeof c === "string") {
        const t = c.trim();
        if (
          t &&
          t !== "Not Assigned" &&
          t !== "[object Object]" &&
          !isLikelyObjectId(t)
        ) {
          return t;
        }
      }
    }
    return null;
  }

  // A raw string must NOT automatically be treated as a therapist name,
  // because it may actually be a therapistId.
  return null;
}

// Returns a string ID from a therapist-shaped value ONLY if it is truly an ID.
// Never returns "[object Object]".
function extractTherapistIdString(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed === "[object Object]" ||
      trimmed === "undefined" ||
      trimmed === "null" ||
      trimmed === "Not Assigned"
    ) {
      return null;
    }
    return trimmed;
  }

  if (typeof value === "object") {
    // A populated object without a name still has an _id we could use.
    if (typeof value._id === "string" && value._id.trim()) {
      return value._id.trim();
    }
    if (typeof value.id === "string" && value.id.trim()) {
      return value.id.trim();
    }
  }

  return null;
}

// Collect every plausible therapist-bearing field from a single object.
function pushTherapistFieldsFromObject(obj, out) {
  if (!obj || typeof obj !== "object") return;

  out.push(obj.therapistName);
  out.push(obj.therapist);
  out.push(obj.therapistId);

  // Sometimes therapist info is nested under a "therapist" object that has
  // its own nested therapistId.
  if (obj.therapist && typeof obj.therapist === "object") {
    out.push(obj.therapist.therapistId);
    out.push(obj.therapist.therapist);
  }
}

// Collects every plausible therapist-related value from a report/patient
// combination, in the priority order required by the spec.
function collectTherapistCandidates({
  report,
  fullReport,
  livePatient,
  populatedPatient,
} = {}) {
  const out = [];

  // 1. report.therapistName / .therapist / .therapistId
  pushTherapistFieldsFromObject(report, out);

  // 2. fullReport.therapistName / .therapist / .therapistId
  if (fullReport && fullReport !== report) {
    pushTherapistFieldsFromObject(fullReport, out);
  }

  // 3. report.patientSnapshot.* and fullReport.patientSnapshot.*
  pushTherapistFieldsFromObject(report?.patientSnapshot, out);
  pushTherapistFieldsFromObject(fullReport?.patientSnapshot, out);

  // 4. report.patientId.* and fullReport.patientId.* (populated patient)
  if (report?.patientId && typeof report.patientId === "object") {
    pushTherapistFieldsFromObject(report.patientId, out);
  }
  if (
    fullReport?.patientId &&
    typeof fullReport.patientId === "object" &&
    fullReport.patientId !== report?.patientId
  ) {
    pushTherapistFieldsFromObject(fullReport.patientId, out);
  }

  // 5. populatedPatient.* (explicitly passed in)
  pushTherapistFieldsFromObject(populatedPatient, out);

  // 6. livePatient.* (fetched from patientPublicApi / patientApi)
  pushTherapistFieldsFromObject(livePatient, out);

  return out;
}

// Resolves a therapist DISPLAY NAME from the many shapes the API can return.
// Priority:
//   1. report.therapistName         (name only — never a raw ObjectId)
//   2. fullReport.therapistName
//   3. fullReport.patientSnapshot?.therapistName
//   4. populated therapist object's name/fullName
//   5. populated therapistId object's name/fullName
//   6. string therapistId → existing fetchTherapistById()
//   7. existing report therapist information
//   8. "Not Assigned" only as the final fallback
//
// IMPORTANT: A raw string is NEVER accepted as a name. If a string looks like
// a therapistId (ObjectId) OR simply is not a display name, it is routed
// through fetchTherapistById so the actual name ("sameer") is resolved.
async function resolveTherapistName(candidates, fetchTherapistById) {
  const triedIds = new Set();

  // Pass 1: object-shaped names (c.name, c.fullName, ...).
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const direct = extractNameFromTherapistValue(c);
      if (direct) return direct;
    }
  }

  // Pass 2: nested therapist objects (c.therapist.name, c.therapist.fullName).
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const nested = extractNameFromTherapistValue(c.therapist);
      if (nested) return nested;
    }
  }

  // Pass 3: populated therapistId object's name/fullName.
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const nestedId = extractNameFromTherapistValue(c.therapistId);
      if (nestedId) return nestedId;
    }
  }

  // Pass 4: string IDs (including the raw "6a4ccd..." ObjectId from the
  // report.therapistName field) → fetch via the existing resolver.
  // Raw strings are NEVER returned directly as the display name.
  for (const c of candidates) {
    const idStr = extractTherapistIdString(c);
    if (idStr && !triedIds.has(idStr)) {
      triedIds.add(idStr);
      try {
        const resolved = await fetchTherapistById(idStr);
        if (resolved && resolved !== "Not Assigned") return resolved;
      } catch {
        // swallow and continue
      }
    }
  }

  // Pass 5: nested therapist object that itself holds a therapistId string.
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const nestedObj =
        c.therapist && typeof c.therapist === "object" ? c.therapist : null;
      if (nestedObj) {
        const nestedId = extractTherapistIdString(nestedObj.therapistId);
        if (nestedId && !triedIds.has(nestedId)) {
          triedIds.add(nestedId);
          try {
            const resolved = await fetchTherapistById(nestedId);
            if (resolved && resolved !== "Not Assigned") return resolved;
          } catch {
            // swallow
          }
        }
      }
    }
  }

  return "Not Assigned";
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

  function isPublicPatientView() {
    try {
      const stored = JSON.parse(localStorage.getItem("gestureheal-storage") || "{}");
      const hasToken = !!stored?.state?.token;
      return !hasToken;
    } catch {
      return true;
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
  // Tries the admin detail endpoint first (when the user is admin), then
  // falls back to the local therapists cache. Never stringifies an object.
  async function fetchTherapistById(therapistId) {
    if (!therapistId) return "Not Assigned";
    if (typeof therapistId === "object") {
      return "Not Assigned";
    }
    const idStr = String(therapistId).trim();
    if (!idStr || isLikelyObjectId(idStr) === false && idStr.length < 6) {
      // Still allow short non-ObjectId ids through, but reject empties.
      if (!idStr) return "Not Assigned";
    }
    if (therapists[idStr]) return therapists[idStr];

    if (!isAdminUser()) {
      return "Not Assigned";
    }

    try {
      const response = await adminApi.getTherapistDetail(idStr);

      if (response && response.therapist) {
        const name =
          response.therapist.name ||
          response.therapist.fullName ||
          "Unknown Therapist";

        setTherapists(prev => ({
          ...prev,
          [idStr]: name
        }));

        return name;
      }

      return "Unknown Therapist";
    } catch (err) {
      console.warn(`Failed to fetch therapist ${idStr}:`, err);
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

  async function lookupLivePatient(patientIdValue) {
    if (!patientIdValue) return null;
    const idStr = String(patientIdValue);
    const isPublicId = idStr.startsWith("GH-");

    try {
      const patientData = isPublicId
        ? await patientPublicApi.getById(idStr)
        : await patientApi.getById(idStr);
      const patient = patientData?.patient || null;
      if (patient) return patient;
    } catch (err) {
      console.warn(`Patient lookup failed for ${idStr}:`, err);
    }

    try {
      const patientData = isPublicId
        ? await patientApi.getById(idStr)
        : await patientPublicApi.getById(idStr);
      return patientData?.patient || null;
    } catch (err) {
      console.warn(`Fallback patient lookup failed for ${idStr}:`, err);
      return null;
    }
  }

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
        const lookupPromise = lookupLivePatient(patientIdValue);
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
            therapistName:
              extractNameFromTherapistValue(livePatient.therapist) ||
              extractNameFromTherapistValue(livePatient.therapistId) ||
              extractNameFromTherapistValue(livePatient.therapistName) ||
              snap.therapistName ||
              null,
          };
        }

        // ─── ROBUST THERAPIST RESOLUTION ────────────────────────────────
        const populatedPatient =
          rawPatientRef && typeof rawPatientRef === "object" ? rawPatientRef : null;

        const candidates = collectTherapistCandidates({
          report: enriched,
          fullReport: enriched,
          livePatient,
          populatedPatient,
        });

        const resolved = await resolveTherapistName(candidates, fetchTherapistById);

        if (!resolved || resolved === "Not Assigned") {
          console.log("[THERAPIST DEBUG]", {
            patientLookupId: lookupId,
            reportTherapistName: enriched.therapistName,
            reportTherapist: enriched.therapist,
            reportTherapistId: enriched.therapistId,
            patientSnapshot: enriched.patientSnapshot,
            patientId: enriched.patientId,
            livePatient: livePatient,
            livePatientTherapist: livePatient?.therapist,
            livePatientTherapistId: livePatient?.therapistId,
            livePatientTherapistName: livePatient?.therapistName,
            candidateCount: candidates.length,
            candidates: candidates,
          });
        }

        // Never overwrite an already-good name with "Not Assigned".
        // Also: never fall back to a raw ObjectId-shaped string.
        const existingGoodName =
          extractNameFromTherapistValue(enriched.therapist) ||
          extractNameFromTherapistValue(enriched.therapistId) ||
          (typeof enriched.therapistName === "string" &&
            !isLikelyObjectId(enriched.therapistName) &&
            enriched.therapistName !== "Not Assigned" &&
            enriched.therapistName.trim()
            ? enriched.therapistName.trim()
            : null);

        const finalName =
          resolved && resolved !== "Not Assigned"
            ? resolved
            : existingGoodName || "Not Assigned";

        enriched.therapistName = finalName;
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

  async function handleRegenerateReport(report) {
    const sessionRef = report?.sessionId;
    const sessionId =
      sessionRef && typeof sessionRef === "object"
        ? sessionRef._id
        : sessionRef;

    if (!sessionId) {
      toast.error("Session ID not found for this report");
      return;
    }

    const rid = report._id || report.reportId || report.id;
    setGeneratingId(rid);

    try {
      const response = isPublicPatientView()
        ? await reportApi.regeneratePublic(sessionId, patientIdFromUrl)
        : await reportApi.regenerate(sessionId);

      if (!response?.success || !response?.report) {
        throw new Error(response?.message || "Failed to regenerate report");
      }

      const regeneratedReport = response.report;

      const lookupId = extractPatientLookupId(regeneratedReport);
      let livePatient = null;
      if (lookupId) {
        livePatient = await lookupLivePatient(lookupId);
      }

      const populatedPatient =
        regeneratedReport.patientId && typeof regeneratedReport.patientId === "object"
          ? regeneratedReport.patientId
          : null;

      const candidates = collectTherapistCandidates({
        report: regeneratedReport,
        fullReport: regeneratedReport,
        livePatient,
        populatedPatient,
      });
      const resolvedTherapistName = await resolveTherapistName(
        candidates,
        fetchTherapistById
      );

      if (!resolvedTherapistName || resolvedTherapistName === "Not Assigned") {
        console.log("[THERAPIST DEBUG][regenerate]", {
          lookupId,
          reportTherapistName: regeneratedReport.therapistName,
          reportTherapist: regeneratedReport.therapist,
          reportTherapistId: regeneratedReport.therapistId,
          patientSnapshot: regeneratedReport.patientSnapshot,
          patientId: regeneratedReport.patientId,
          livePatient,
          candidates,
        });
      }

      const existingGoodName =
        extractNameFromTherapistValue(report.therapist) ||
        extractNameFromTherapistValue(regeneratedReport.therapist) ||
        extractNameFromTherapistValue(regeneratedReport.therapistId) ||
        (typeof report.therapistName === "string" &&
          !isLikelyObjectId(report.therapistName) &&
          report.therapistName !== "Not Assigned" &&
          report.therapistName.trim()
          ? report.therapistName.trim()
          : null);

      const finalName =
        resolvedTherapistName && resolvedTherapistName !== "Not Assigned"
          ? resolvedTherapistName
          : existingGoodName || "Not Assigned";

      setSelectedReport({
        ...regeneratedReport,
        performance: regeneratedReport.performance || {},
        romAnalysis: regeneratedReport.romAnalysis || [],
        repData: regeneratedReport.repData || [],
        romData: regeneratedReport.romData || null,
        gameType: regeneratedReport.gameType || null,
        therapistName: finalName,
        observations: regeneratedReport.observations || "",
        recommendations: regeneratedReport.recommendations || "",
      });

      setReports((prev) =>
        prev.map((r) =>
          String(r._id || r.reportId || r.id) === String(rid)
            ? { ...regeneratedReport, therapistName: finalName }
            : r
        )
      );

      toast.success("Report regenerated successfully");
    } catch (err) {
      console.error("Report regeneration failed:", err);
      toast.error(
        "Failed to regenerate report: " +
        (err.message || "Unknown error")
      );
    } finally {
      setGeneratingId(null);
    }
  }

  // ─── DOWNLOAD PDF ───────────────────────────────────────────────────────
  async function handleDownloadPDF(report) {
    const rid = report._id || report.reportId || report.id;
    setDownloadingId(rid);
    try {
      const reportRes = await reportApi.getById(rid);
      let fullReport = reportRes?.report || report;

      if (!fullReport || fullReport._id !== rid) {
        const API_URL = import.meta.env.VITE_API_URL || "https://gestureheal-backend.onrender.com/api";
        const storage = JSON.parse(localStorage.getItem('gestureheal-storage') || '{}');
        const token = storage?.state?.token || localStorage.getItem('token');

        const res = await fetch(`${API_URL}/reports/${rid}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
        const data = await res.json();
        fullReport = data?.report || report;
      }

      // ─── RESOLVE LIVE PATIENT RECORD ──────────────────────────────────
      const lookupId = extractPatientLookupId(fullReport);

      let livePatient = null;
      if (lookupId) {
        livePatient = await lookupLivePatient(lookupId);
      }

      const populatedPatient =
        fullReport.patientId && typeof fullReport.patientId === "object"
          ? fullReport.patientId
          : null;

      const sourcePatient = livePatient || populatedPatient;
      const snap = fullReport.patientSnapshot || {};

      const sourceTherapistName =
        extractNameFromTherapistValue(sourcePatient?.therapist) ||
        extractNameFromTherapistValue(sourcePatient?.therapistId) ||
        extractNameFromTherapistValue(sourcePatient?.therapistName) ||
        null;

      if (sourcePatient) {
        fullReport = {
          ...fullReport,
          patientSnapshot: {
            ...snap,
            name:
              snap.name && snap.name !== "Unknown Patient"
                ? snap.name
                : sourcePatient.name || snap.name || "Unknown Patient",
            age: snap.age ?? sourcePatient.age ?? null,
            gender: snap.gender ?? sourcePatient.gender ?? null,
            condition: snap.condition || sourcePatient.condition || null,
            surgeryType: snap.surgeryType || sourcePatient.surgeryType || null,
            surgeryDate: snap.surgeryDate || sourcePatient.surgeryDate || null,
            painLevel: snap.painLevel ?? sourcePatient.painLevel ?? null,
            goals: snap.goals || sourcePatient.goals || null,
            therapistName: snap.therapistName || sourceTherapistName || null,
          },
        };
      }

      // ─── RESOLVE THERAPIST NAME ROBUSTLY ──────────────────────────────
      const candidates = collectTherapistCandidates({
        report,
        fullReport,
        livePatient,
        populatedPatient,
      });

      const resolvedTherapistName = await resolveTherapistName(
        candidates,
        fetchTherapistById
      );

      if (!resolvedTherapistName || resolvedTherapistName === "Not Assigned") {
        console.log("[THERAPIST DEBUG][pdf]", {
          lookupId,
          reportTherapistName: report?.therapistName,
          fullReportTherapistName: fullReport?.therapistName,
          fullReportTherapist: fullReport?.therapist,
          fullReportTherapistId: fullReport?.therapistId,
          patientSnapshot: fullReport?.patientSnapshot,
          patientId: fullReport?.patientId,
          livePatient,
          candidates,
        });
      }

      // Never fall back to a raw ObjectId-shaped string.
      const reportTherapistNameIsGood =
        typeof report?.therapistName === "string" &&
        !isLikelyObjectId(report.therapistName) &&
        report.therapistName !== "Not Assigned" &&
        report.therapistName.trim();

      const fullReportTherapistNameIsGood =
        typeof fullReport?.therapistName === "string" &&
        !isLikelyObjectId(fullReport.therapistName) &&
        fullReport.therapistName !== "Not Assigned" &&
        fullReport.therapistName.trim();

      const snapTherapistNameIsGood =
        typeof fullReport?.patientSnapshot?.therapistName === "string" &&
        !isLikelyObjectId(fullReport.patientSnapshot.therapistName) &&
        fullReport.patientSnapshot.therapistName !== "Not Assigned" &&
        fullReport.patientSnapshot.therapistName.trim();

      const finalName =
        resolvedTherapistName && resolvedTherapistName !== "Not Assigned"
          ? resolvedTherapistName
          : (reportTherapistNameIsGood && report.therapistName.trim()) ||
            (fullReportTherapistNameIsGood && fullReport.therapistName.trim()) ||
            (snapTherapistNameIsGood && fullReport.patientSnapshot.therapistName.trim()) ||
            extractNameFromTherapistValue(fullReport?.therapist) ||
            extractNameFromTherapistValue(fullReport?.therapistId) ||
            "Not Assigned";

      fullReport = {
        ...fullReport,
        therapistName: finalName,
      };

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

    const populatedPatient =
      report.patientId && typeof report.patientId === "object"
        ? report.patientId
        : null;

    // Use the STRICT name extractor so a raw ObjectId in report.therapistName
    // is never displayed. ObjectId-shaped strings are dropped here.
    const reportTherapistNameIsGood =
      typeof report?.therapistName === "string" &&
      !isLikelyObjectId(report.therapistName) &&
      report.therapistName !== "Not Assigned" &&
      report.therapistName.trim();

    const snapTherapistNameIsGood =
      typeof report?.patientSnapshot?.therapistName === "string" &&
      !isLikelyObjectId(report.patientSnapshot.therapistName) &&
      report.patientSnapshot.therapistName !== "Not Assigned" &&
      report.patientSnapshot.therapistName.trim();

    const resolvedTherapist =
      (reportTherapistNameIsGood && report.therapistName.trim()) ||
      (snapTherapistNameIsGood && report.patientSnapshot.therapistName.trim()) ||
      extractNameFromTherapistValue(report.therapist) ||
      extractNameFromTherapistValue(report.therapistId) ||
      extractNameFromTherapistValue(populatedPatient?.therapistName) ||
      extractNameFromTherapistValue(populatedPatient?.therapist) ||
      extractNameFromTherapistValue(populatedPatient?.therapistId) ||
      "Not Assigned";

    if (!resolvedTherapist || resolvedTherapist === "Not Assigned") {
      console.log("[THERAPIST DEBUG][view]", {
        reportTherapistName: report?.therapistName,
        reportTherapist: report?.therapist,
        reportTherapistId: report?.therapistId,
        patientSnapshot: report?.patientSnapshot,
        patientId: report?.patientId,
      });
    }

    const safeReport = {
      ...report,
      performance: report.performance || {},
      romAnalysis: report.romAnalysis || [],
      repData: report.repData || [],
      romData: report.romData || null,
      gameType: report.gameType || null,
      therapistName: resolvedTherapist,
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
    const rawRepData = Array.isArray(report.repData) ? report.repData : [];
    console.log("REPORT REP DATA:", rawRepData);
    console.log("[REPORT DEBUG] report.patientId      =", report.patientId);
console.log("[REPORT DEBUG] report.patientId type =", typeof report.patientId);
console.log("[REPORT DEBUG] report.patientId keys =",
  report.patientId && typeof report.patientId === "object"
    ? Object.keys(report.patientId)
    : null
);
console.log("[REPORT DEBUG] report.patientIdRef   =", report.patientIdRef);
console.log("[REPORT DEBUG] report.patientSnapshot =", report.patientSnapshot);
console.log("[REPORT DEBUG] report (all keys)      =", Object.keys(report));
    const repData = rawRepData.map((r, index) => {
      const rom = toFiniteNumber(r.rom) ?? toFiniteNumber(r.romDegrees);

      const isCorrect = normalizeBoolean(
        r.isCorrect !== undefined ? r.isCorrect : r.success
      );

      return {
        ...r,
        repNumber: r.repNumber ?? r.rep ?? index + 1,
        rom,
        isCorrect,
      };
    });

    const repSummary = summarizeRepData(repData);
    const hasPerRepRom = repData.some(
      (rep) => rep.rom != null && Number.isFinite(Number(rep.rom))
    );
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

    // Resolve therapist display using the STRICT name extractor.
    const populatedPatientForView =
      report.patientId && typeof report.patientId === "object"
        ? report.patientId
        : null;

    const reportTherapistNameIsGood =
      typeof report?.therapistName === "string" &&
      !isLikelyObjectId(report.therapistName) &&
      report.therapistName !== "Not Assigned" &&
      report.therapistName.trim();

    const snapTherapistNameIsGood =
      typeof report?.patientSnapshot?.therapistName === "string" &&
      !isLikelyObjectId(report.patientSnapshot.therapistName) &&
      report.patientSnapshot.therapistName !== "Not Assigned" &&
      report.patientSnapshot.therapistName.trim();

    const therapistName =
      (reportTherapistNameIsGood && report.therapistName.trim()) ||
      (snapTherapistNameIsGood && report.patientSnapshot.therapistName.trim()) ||
      extractNameFromTherapistValue(report.therapist) ||
      extractNameFromTherapistValue(report.therapistId) ||
      extractNameFromTherapistValue(populatedPatientForView?.therapistName) ||
      extractNameFromTherapistValue(populatedPatientForView?.therapist) ||
      extractNameFromTherapistValue(populatedPatientForView?.therapistId) ||
      "Not Assigned";

    if (!therapistName || therapistName === "Not Assigned") {
      console.log("[THERAPIST DEBUG][detail-view]", {
        reportTherapistName: report?.therapistName,
        reportTherapist: report?.therapist,
        reportTherapistId: report?.therapistId,
        patientSnapshot: report?.patientSnapshot,
        patientId: report?.patientId,
        populatedPatient: populatedPatientForView,
      });
    }

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

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleRegenerateReport(report)}
              disabled={generatingId === (report._id || report.reportId || report.id)}
              className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 font-medium disabled:opacity-60"
            >
              {generatingId === (report._id || report.reportId || report.id) ? (
                <><Loader2 size={16} className="animate-spin" /> Regenerating...</>
              ) : (
                <><Activity size={16} /> Regenerate Report</>
              )}
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 font-medium"
            >
              <Printer size={16} />
              Print
            </button>

            <button
              onClick={() => handleDownloadPDF(report)}
              disabled={downloadingId === (report._id || report.reportId || report.id)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-60"
            >
              {downloadingId === (report._id || report.reportId || report.id) ? (
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
              {hasPerRepRom ? (
                <>
                  <p className="text-xs text-slate-400 mb-3">Per-rep ROM in degrees, recorded during the session ({repData.length} reps).</p>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <MetricsChart
                      data={repData}
                      xKey="repNumber"
                      yKey="rom"
                      label="ROM (°)"
                      color="#0ea5e9"
                      height={250}
                    />
                  </div>
                </>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <Info size={14} className="text-slate-400 flex-shrink-0" />
                    Per-repetition ROM data was not recorded for this session.
                  </p>
                </div>
              )}
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
                  <p className="text-lg font-bold text-slate-900">
                    {repSummary.correctnessRecorded
                      ? `${repSummary.correct} / ${repSummary.incorrect}`
                      : "Not recorded"}
                  </p>
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
                  <p className="text-sm text-slate-900">Flexion: <span className="font-semibold">{report.romData.shoulder?.flexion != null ? `${report.romData.shoulder.flexion}°` : 'Not recorded'}</span></p>
                  <p className="text-sm text-slate-900">Extension: <span className="font-semibold">{report.romData.shoulder?.extension != null ? `${report.romData.shoulder.extension}°` : 'Not recorded'}</span></p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Elbow</p>
                  <p className="text-sm text-slate-900">Flexion: <span className="font-semibold">{report.romData.elbow?.flexion != null ? `${report.romData.elbow.flexion}°` : 'Not recorded'}</span></p>
                  <p className="text-sm text-slate-900">Extension: <span className="font-semibold">{report.romData.elbow?.extension != null ? `${report.romData.elbow.extension}°` : 'Not recorded'}</span></p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Wrist</p>
                  <p className="text-sm text-slate-900">Flexion: <span className="font-semibold">{report.romData.wrist?.flexion != null ? `${report.romData.wrist.flexion}°` : 'Not recorded'}</span></p>
                  <p className="text-sm text-slate-900">Extension: <span className="font-semibold">{report.romData.wrist?.extension != null ? `${report.romData.wrist.extension}°` : 'Not recorded'}</span></p>
                  <p className="text-sm text-slate-900">Rotation: <span className="font-semibold">{report.romData.wrist?.rotation != null ? `${report.romData.wrist.rotation}°` : 'Not recorded'}</span></p>
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
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.averageRom != null ? `${ex.averageRom}°` : 'Not recorded'}</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.maxRom != null ? `${ex.maxRom}°` : 'Not recorded'}</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.targetRom != null ? `${ex.targetRom}°` : 'Not recorded'}</td>
                        <td className="py-2 px-3 text-slate-700 border border-slate-200">{ex.percentageAchieved != null ? `${ex.percentageAchieved}%` : 'Not recorded'}</td>
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

              const listTherapistNameIsGood =
                typeof report?.therapistName === "string" &&
                !isLikelyObjectId(report.therapistName) &&
                report.therapistName !== "Not Assigned" &&
                report.therapistName.trim();

              return (
                <div key={rid} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200 cursor-pointer group" onClick={() => handleViewReport(report)}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
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
                        {listTherapistNameIsGood && (<span className="text-slate-400 text-xs">Therapist: {report.therapistName.trim()}</span>)}
                      </div>
                    </div>

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