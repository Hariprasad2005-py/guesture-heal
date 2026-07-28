import { useEffect, useState } from "react";
import { Routes, Route, Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { adminApi } from "../utils/apiService";
import { generatePDFReport } from "../utils/reportGenerator";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import {
  Users, UserCog, Activity, FileText, TrendingUp, TrendingDown, PauseCircle,
  ChevronRight, ChevronLeft, ArrowLeft, Search, Download, Loader2,
  AlertTriangle, Clock, Gamepad2,
} from "lucide-react";
import toast from "react-hot-toast";

/* ════════════════════════════════════════════════════════════════════════
   AdminPage — single entry point mounted at /admin/* in the app router.
   Combines: Dashboard, Therapists (list + detail), Patients (list + detail),
   Reports. Sub-views keep their original absolute-path <Link>s, so mount
   this file with:  <Route path="/admin/*" element={<AdminPage />} />
   ════════════════════════════════════════════════════════════════════════ */

const LIMIT = 20;

/* ─── Dashboard ──────────────────────────────────────────────────────── */

const DONUT_COLORS = ["#0d9488", "#2f84ff", "#7b2d8b", "#f59e0b", "#ef4444"];

function KpiCard({ label, value, icon: Icon, accent, trend, index }) {
  const isUp = trend != null && trend >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: "easeOut" }}
      className="bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-shadow p-5"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon size={22} />
        </div>
        {trend != null && (
          <span
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              isUp ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
            }`}
          >
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-4">{value?.toLocaleString?.() ?? value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </motion.div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [engagement, setEngagement] = useState([]);
  const [dauSessions, setDauSessions] = useState([]);
  const [completionRates, setCompletionRates] = useState([]);
  const [atRiskPatients, setAtRiskPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [statsData, sessionsData, engagementData, dauData, completionData, atRiskData] =
        await Promise.all([
          adminApi.getStats(),
          adminApi.getAllSessions({ limit: 8 }),
          adminApi.getEngagementTrends(30),
          adminApi.getDauVsSessions(14),
          adminApi.getCompletionRates(),
          adminApi.getAtRiskPatients(5),
        ]);
      setStats(statsData?.stats || null);
      setRecentSessions(sessionsData?.sessions || []);
      setEngagement(engagementData?.series || []);
      setDauSessions(dauData?.series || []);
      setCompletionRates(completionData?.gameTypes || []);
      setAtRiskPatients(atRiskData?.patients || []);
    } catch (err) {
      toast.error("Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  // Derived trend: today vs yesterday, from real engagement series (not fabricated).
  const todayEngagement = engagement[engagement.length - 1];
  const yesterdayEngagement = engagement[engagement.length - 2];
  const sessionsTrend =
    todayEngagement && yesterdayEngagement && yesterdayEngagement.sessionsCount > 0
      ? Math.round(
          ((todayEngagement.sessionsCount - yesterdayEngagement.sessionsCount) /
            yesterdayEngagement.sessionsCount) *
            100
        )
      : null;
  const engagementTrend =
    todayEngagement && yesterdayEngagement
      ? Math.round((todayEngagement.engagementRate - yesterdayEngagement.engagementRate) * 10) / 10
      : null;

  const kpis = [
    {
      label: "Total Active Patients",
      value: stats?.activePatients ?? 0,
      icon: Users,
      accent: "text-teal-600 bg-teal-50",
      trend: null,
    },
    {
      label: "Today's Sessions",
      value: todayEngagement?.sessionsCount ?? 0,
      icon: Activity,
      accent: "text-primary-600 bg-primary-50",
      trend: sessionsTrend,
    },
    {
      label: "Engagement Rate",
      value: `${todayEngagement?.engagementRate ?? 0}%`,
      icon: TrendingUp,
      accent: "text-emerald-600 bg-emerald-50",
      trend: engagementTrend,
    },
    {
      label: "Total Sessions",
      value: stats?.totalSessions ?? 0,
      icon: Gamepad2,
      accent: "text-purple-600 bg-purple-50",
      trend: null,
    },
    {
      label: "Risk Alerts",
      value: atRiskPatients.filter((p) => p.status === "at-risk").length,
      icon: AlertTriangle,
      accent: "text-rose-600 bg-rose-50",
      trend: null,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time overview across all patients and therapists</p>
      </div>

      {/* ─── KPI Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} {...k} index={i} />
        ))}
      </div>

      {/* ─── Charts Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Engagement line chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Patient Engagement — Last 30 Days</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={engagement}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 11, fill: "#64748b" }}
                interval={Math.ceil(engagement.length / 8)}
              />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelFormatter={(d) => `Date: ${d}`}
              />
              <Line
                type="monotone"
                dataKey="activePatients"
                name="Active Patients"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="sessionsCount"
                name="Sessions"
                stroke="#2f84ff"
                strokeWidth={2.5}
                dot={false}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Completion rates donut */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Therapy Completion Rates</h2>
          {completionRates.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-16">No session data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={completionRates}
                  dataKey="completionRate"
                  nameKey="gameType"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {completionRates.map((entry, i) => (
                    <Cell key={entry.gameType} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={(value, name) => [`${value}%`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── DAU vs Sessions bar chart ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6 mb-8">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Daily Active Users vs Sessions — Last 14 Days</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dauSessions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="dau" name="Daily Active Users" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="sessions" name="Sessions" fill="#2f84ff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ─── At-Risk + Recent Activity ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* At-Risk Patients widget */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-500" /> At-Risk Patients
          </h2>
          {atRiskPatients.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No at-risk patients right now</p>
          ) : (
            <div className="space-y-3">
              {atRiskPatients.map((p) => (
                <Link
                  key={p._id}
                  to={`/admin/patients/${p._id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.condition}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ml-2 ${
                      p.riskScore >= 80
                        ? "bg-rose-100 text-rose-700"
                        : p.riskScore >= 65
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.riskScore}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity — redesigned */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Recent Activity</h2>
          {recentSessions.length === 0 ? (
            <div className="text-center py-12">
              <Activity size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No sessions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentSessions.map((s) => {
                const initial = (s.patientId?.name || "?").charAt(0).toUpperCase();
                const statusColor =
                  s.status === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : s.status === "in_progress"
                    ? "bg-primary-100 text-primary-700"
                    : "bg-slate-100 text-slate-600";
                return (
                  <div key={s._id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {s.patientId?.name || "Unknown patient"}
                          <span className="text-slate-400 font-normal ml-1">({s.patientId?.patientId})</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Day {s.day} · {s.therapistId?.name || "Self-registered"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor}`}>
                        {s.status.replace("_", " ")}
                      </span>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 justify-end">
                        <Clock size={11} /> {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Therapists: list ───────────────────────────────────────────────── */
function TherapistsList() {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getTherapists();
      setTherapists(data?.therapists || []);
    } catch (err) {
      toast.error("Failed to load therapists");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(therapist) {
    setTogglingId(therapist._id);
    try {
      const nextActive = !therapist.isActive;
      await adminApi.updateTherapistStatus(therapist._id, nextActive);
      setTherapists((prev) =>
        prev.map((t) => (t._id === therapist._id ? { ...t, isActive: nextActive } : t))
      );
      toast.success(`Therapist ${nextActive ? "activated" : "deactivated"}`);
    } catch (err) {
      toast.error("Failed to update therapist status");
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <LoadingSpinner text="Loading therapists..." />;

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Therapists</h1>

      {therapists.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <UserCog size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No therapists yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Patients</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Last Login</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {therapists.map((t) => (
                <tr key={t._id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-5 py-3 text-slate-600">{t.email}</td>
                  <td className="px-5 py-3 text-slate-600">{t.patientCount}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleToggleStatus(t)}
                      disabled={togglingId === t._id}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-60 ${
                        t.isActive
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                    >
                      {t.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {t.lastLogin ? new Date(t.lastLogin).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/admin/therapists/${t._id}`}
                      className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium"
                    >
                      View <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Therapists: detail ─────────────────────────────────────────────── */
function TherapistDetail() {
  const { id } = useParams();
  const [therapist, setTherapist] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getTherapistDetail(id);
      setTherapist(data?.therapist || null);
      setPatients(data?.patients || []);
    } catch (err) {
      toast.error("Failed to load therapist");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus() {
    if (!therapist) return;
    setToggling(true);
    try {
      const nextActive = !therapist.isActive;
      const data = await adminApi.updateTherapistStatus(therapist._id, nextActive);
      setTherapist(data?.therapist || { ...therapist, isActive: nextActive });
      toast.success(`Therapist ${nextActive ? "activated" : "deactivated"}`);
    } catch (err) {
      toast.error("Failed to update therapist status");
    } finally {
      setToggling(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading therapist..." />;
  if (!therapist) return <p className="text-slate-600">Therapist not found.</p>;

  return (
    <div>
      <Link to="/admin/therapists" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft size={16} /> Back to Therapists
      </Link>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{therapist.name}</h1>
          <p className="text-slate-500">{therapist.email}</p>
          <p className="text-sm text-slate-400 mt-1">
            Joined {new Date(therapist.createdAt).toLocaleDateString()}
            {therapist.lastLogin && ` · Last login ${new Date(therapist.lastLogin).toLocaleDateString()}`}
          </p>
        </div>
        <button
          onClick={handleToggleStatus}
          disabled={toggling}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${
            therapist.isActive
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          }`}
        >
          {therapist.isActive ? "Active — Deactivate" : "Inactive — Activate"}
        </button>
      </div>

      <h2 className="text-lg font-semibold text-slate-900 mb-4">Patients ({patients.length})</h2>
      {patients.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Users size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No patients assigned to this therapist</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Patient</th>
                <th className="text-left px-5 py-3 font-medium">Condition</th>
                <th className="text-left px-5 py-3 font-medium">Progress</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{p.patientId}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.condition}</td>
                  <td className="px-5 py-3 text-slate-600">Day {p.currentDay}/7 · {p.averageAccuracy || 0}% acc.</td>
                  <td className="px-5 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    }`}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/admin/patients/${p._id}`}
                      className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium"
                    >
                      View <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Patients: list ─────────────────────────────────────────────────── */
function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "", "true", "false"
  const [page, setPage] = useState(1);

  useEffect(() => {
    adminApi.getTherapists()
      .then((data) => setTherapists(data?.therapists || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, therapistId, statusFilter]);

  useEffect(() => {
    load();
  }, [debouncedSearch, therapistId, statusFilter, page]);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getAllPatients({
        search: debouncedSearch || undefined,
        therapistId: therapistId || undefined,
        isActive: statusFilter || undefined,
        page,
        limit: LIMIT,
      });
      setPatients(data?.patients || []);
      setPagination(data?.pagination || { total: 0, page: 1, pages: 1 });
    } catch (err) {
      toast.error("Failed to load patients");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Patients</h1>

        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, condition..."
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white w-64"
            />
          </div>
          <select
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
          >
            <option value="">All Therapists</option>
            {therapists.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading patients..." />
      ) : patients.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Users size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No patients found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Patient</th>
                  <th className="text-left px-5 py-3 font-medium">Condition</th>
                  <th className="text-left px-5 py-3 font-medium">Therapist</th>
                  <th className="text-left px-5 py-3 font-medium">Progress</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.patientId}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.condition}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.therapistId?.name || <span className="text-slate-400 italic">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">Day {p.currentDay}/7 · {p.averageAccuracy || 0}% acc.</td>
                    <td className="px-5 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}>
                        {p.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/admin/patients/${p._id}`}
                        className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium"
                      >
                        View <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
              <p>
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Patients: detail ───────────────────────────────────────────────── */
function PatientDetail() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [reports, setReports] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    load();
    adminApi.getTherapists()
      .then((data) => setTherapists(data?.therapists || []))
      .catch(() => {});
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getPatientDetail(id);
      setPatient(data?.patient || null);
      setSessions(data?.sessions || []);
      setReports(data?.reports || []);
    } catch (err) {
      toast.error("Failed to load patient");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignTherapist(e) {
    const newTherapistId = e.target.value || null;
    setAssigning(true);
    try {
      const data = await adminApi.assignTherapist(patient._id, newTherapistId);
      setPatient(data?.patient || patient);
      toast.success(newTherapistId ? "Therapist assigned" : "Therapist unassigned");
    } catch (err) {
      toast.error("Failed to assign therapist");
    } finally {
      setAssigning(false);
    }
  }

  async function handleDownloadPDF(report) {
    setDownloadingId(report._id || report.id);
    try {
      // Admin routes don't expose a single-report lookup — the list already
      // includes everything except patientSnapshot, so generate from what we have.
      await generatePDFReport(report);
      toast.success("PDF downloaded!");
    } catch (err) {
      toast.error("PDF generation failed: " + (err.message || "unknown error"));
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <LoadingSpinner text="Loading patient..." />;
  if (!patient) return <p className="text-slate-600">Patient not found.</p>;

  const completedDays = (patient.rehabPlan || []).filter((d) => d.isCompleted).length;
  const totalDays = (patient.rehabPlan || []).length || 7;

  return (
    <div>
      <Link to="/admin/patients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft size={16} /> Back to Patients
      </Link>

      {/* ─── Profile ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-sm text-slate-400 font-mono">{patient.patientId}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            patient.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
          }`}>
            {patient.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Age / Gender</span>
            <span className="font-medium text-slate-900">{patient.age} · {patient.gender}</span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Condition</span>
            <span className="font-medium text-slate-900">{patient.condition}</span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Surgery Type</span>
            <span className="font-medium text-slate-900">{patient.surgeryType || "—"}</span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Pain Level</span>
            <span className="font-medium text-slate-900">{patient.painLevel}/10</span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500 mb-1">Therapist</span>
            <select
              value={patient.therapistId?._id || ""}
              onChange={handleAssignTherapist}
              disabled={assigning}
              className="w-full text-sm font-medium text-slate-900 bg-white border border-slate-200 rounded-lg px-2 py-1.5 disabled:opacity-60"
            >
              <option value="">Unassigned</option>
              {therapists.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Sessions</span>
            <span className="font-medium text-slate-900">{patient.totalSessions}</span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Avg Accuracy</span>
            <span className="font-medium text-slate-900">{patient.averageAccuracy || 0}%</span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="block text-slate-500">Rehab Progress</span>
            <span className="font-medium text-slate-900">Day {patient.currentDay}/7 · {completedDays}/{totalDays} done</span>
          </div>
        </div>

        {patient.goals && (
          <div className="mt-4">
            <span className="block text-sm text-slate-500 mb-1">Goals</span>
            <p className="text-sm text-slate-700">{patient.goals}</p>
          </div>
        )}
      </div>

      {/* ─── Session History ─────────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Session History ({sessions.length})</h2>
      {sessions.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-lg mb-8">
          <Activity size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-600">No sessions yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Day</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Score</th>
                <th className="text-left px-5 py-3 font-medium">Accuracy</th>
                <th className="text-left px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s._id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-900 font-medium">Day {s.day}</td>
                  <td className="px-5 py-3 text-slate-600 capitalize">{s.status.replace("_", " ")}</td>
                  <td className="px-5 py-3 text-slate-600">{s.score || 0}</td>
                  <td className="px-5 py-3 text-slate-600">{s.accuracy || 0}%</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Reports ──────────────────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Reports ({reports.length})</h2>
      {reports.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-lg">
          <FileText size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-600">No reports yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => {
            const rid = report._id || report.id;
            const perf = report.performance || {};
            const isDownloading = downloadingId === rid;
            return (
              <div
                key={rid}
                className="bg-white rounded-lg border border-slate-200 p-6 flex items-center justify-between hover:shadow-md transition"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {report.reportNumber || `Report #${rid.slice(-6)}`}
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
  );
}

/* ─── Reports: global list ───────────────────────────────────────────── */
function ReportsList() {
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const [patientId, setPatientId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [therapists, setTherapists] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    adminApi.getTherapists()
      .then((data) => setTherapists(data?.therapists || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [patientId, therapistId, startDate, endDate]);

  useEffect(() => {
    load();
  }, [patientId, therapistId, startDate, endDate, page]);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getAllReports({
        patientId: patientId || undefined,
        therapistId: therapistId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: LIMIT,
      });
      setReports(data?.reports || []);
      setPagination(data?.pagination || { total: 0, page: 1, pages: 1 });
    } catch (err) {
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPDF(report) {
    setDownloadingId(report._id || report.id);
    try {
      await generatePDFReport(report);
      toast.success("PDF downloaded!");
    } catch (err) {
      toast.error("PDF generation failed: " + (err.message || "unknown error"));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Reports</h1>

        <div className="flex flex-wrap gap-3">
          <select
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
          >
            <option value="">All Therapists</option>
            {therapists.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading reports..." />
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <FileText size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No reports found</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {reports.map((report) => {
              const rid = report._id || report.id;
              const perf = report.performance || {};
              const isDownloading = downloadingId === rid;
              return (
                <div key={rid}>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 px-1">
                    <Link
                      to={`/admin/patients/${report.patientId?._id}`}
                      className="font-medium text-teal-600 hover:text-teal-700"
                    >
                      {report.patientId?.name || "Unknown patient"}
                    </Link>
                    <span className="font-mono">({report.patientId?.patientId})</span>
                    <span>·</span>
                    <span>{report.therapistId?.name || "Self-registered"}</span>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-6 flex items-center justify-between hover:shadow-md transition">
                    <div>
                      <p className="font-medium text-slate-900">
                        {report.reportNumber || `Report #${rid.slice(-6)}`}
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
                </div>
              );
            })}
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
              <p>
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Default export: mounts nested routes ───────────────────────────── */
export default function AdminPage() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="therapists" element={<TherapistsList />} />
      <Route path="therapists/:id" element={<TherapistDetail />} />
      <Route path="patients" element={<PatientsList />} />
      <Route path="patients/:id" element={<PatientDetail />} />
      <Route path="reports" element={<ReportsList />} />
    </Routes>
  );
}