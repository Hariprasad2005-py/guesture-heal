  import { useEffect, useState } from "react";
  import { useParams } from "react-router-dom";
  import { reportApi, sessionApi, patientApi } from "../utils/apiService";
  import { generatePDFReport } from "../utils/reportGenerator";
  import LoadingSpinner from "../components/ui/LoadingSpinner";
  import { Download, FileText, Loader2 } from "lucide-react";
  import toast from "react-hot-toast";

  export default function ReportsPage() {
    const { patientId: patientIdFromUrl } = useParams();
    const [selectedPatientId, setSelectedPatientId] = useState(patientIdFromUrl || "");
    const [patients, setPatients] = useState([]);
    const [reports, setReports] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState(null);
    const [generatingId, setGeneratingId] = useState(null);

    const isGlobalView = !patientIdFromUrl;

    useEffect(() => {
      if (isGlobalView) {
        patientApi.getAll()
          .then((data) => setPatients(data?.patients || []))
          .catch(() => toast.error("Failed to load patient list"));
      }
    }, [isGlobalView]);

    useEffect(() => {
      loadData();
    }, [patientIdFromUrl, selectedPatientId]);

    async function loadData() {
      setLoading(true);
      try {
        if (isGlobalView) {
          // Global view: reports for all patients, or filtered to one via dropdown
          const reportsData = await reportApi.getAll(selectedPatientId || undefined);
          setReports(reportsData?.reports || []);
          setSessions([]); // no pending-sessions section in global view
        } else {
          const isPublicId = patientIdFromUrl.startsWith("GH-");
          if (isPublicId) {
            // No token available for public-ID patients — use the unauthenticated endpoint.
            // Sessions can't be fetched here (sessionApi.getByPatient requires auth),
            // so the "Sessions Awaiting Reports" section is skipped for this flow.
            const reportsData = await reportApi.getByPublicPatient(patientIdFromUrl);
            setReports(reportsData?.reports || []);
            setSessions([]);
          } else {
            const [reportsData, sessionsData] = await Promise.all([
              reportApi.getByPatient(patientIdFromUrl),
              sessionApi.getByPatient(patientIdFromUrl),
            ]);
            setReports(reportsData?.reports || []);
            setSessions(sessionsData?.sessions || []);
          }
        }
      } catch (err) {
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
        toast.error("Failed to generate report");
      } finally {
        setGeneratingId(null);
      }
    }

    async function handleDownloadPDF(report) {
      setDownloadingId(report._id || report.id);
      try {
        let fullReport = report;
        if (!report.romAnalysis) {
          fullReport = await reportApi.getById(report._id || report.id);
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

    if (loading) return <LoadingSpinner text="Loading reports..." />;

    const reportedSessionIds = new Set(reports.map(r => String(r.sessionId?._id || r.sessionId)));
    const pendingSessions = sessions.filter(
      s => s.status === "completed" && !reportedSessionIds.has(String(s._id || s.id))
    );

    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Reports</h1>

          {isGlobalView && (
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
            >
              <option value="">All Patients</option>
              {patients.map((p) => (
                <option key={p._id || p.id} value={p._id || p.id}>
                  {p.name} ({p.patientId})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Sessions awaiting reports — only in single-patient context */}
        {!isGlobalView && pendingSessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Sessions Awaiting Reports
            </h2>
            <div className="space-y-3">
              {pendingSessions.map((session) => {
                const sid = session._id || session.id;
                return (
                  <div
                    key={sid}
                    className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">Session — Day {session.day}</p>
                      <p className="text-sm text-slate-600">
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

        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            {isGlobalView ? "All Reports" : "Generated Reports"}
          </h2>
          {reports.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <FileText size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No reports yet</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {reports.map((report) => {
                const rid = report._id || report.id;
                const perf = report.performance || {};
                const isDownloading = downloadingId === rid;
                const patientName = report.patientId?.name;

                return (
                  <div
                    key={rid}
                    className="bg-white rounded-lg border border-slate-200 p-6 flex items-center justify-between hover:shadow-md transition"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {report.reportNumber || `Report #${rid.slice(-6)}`}
                        {isGlobalView && patientName && (
                          <span className="ml-2 text-sm font-normal text-slate-500">— {patientName}</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-600">
                        {new Date(report.generatedAt || report.createdAt).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        <span className="text-slate-600">
                          Score: <span className="font-semibold text-slate-900">{perf.score?.toLocaleString() || 0}</span>
                        </span>
                        <span className="text-slate-600">
                          Accuracy: <span className="font-semibold text-slate-900">{perf.accuracy || 0}%</span>
                        </span>
                        <span className="text-slate-600">
                          Day: <span className="font-semibold text-slate-900">{perf.day || "—"}</span>
                        </span>
                        <span className="text-slate-600">
                          Reps: <span className="font-semibold text-slate-900">{perf.totalReps || "—"}</span>
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadPDF(report)}
                      disabled={isDownloading}
                      className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-60 transition-colors"
                    >
                      {isDownloading ? (
                        <><Loader2 size={18} className="animate-spin" /> Generating PDF...</>
                      ) : (
                        <><Download size={18} /> Download PDF</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }