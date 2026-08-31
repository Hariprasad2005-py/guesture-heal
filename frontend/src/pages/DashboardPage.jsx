import { useEffect, useState } from "react";
import { dashboardApi } from "../utils/apiService";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import {
  Users, Activity, Target, Clock, TrendingUp, ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accentColor = "blue" }) {
  const colors = {
    blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-100" },
    teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-teal-100" },
    violet: { bg: "bg-violet-50", icon: "text-violet-600", border: "border-violet-100" },
    amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-amber-100" },
  };
  const c = colors[accentColor] || colors.blue;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-start gap-4 hover:shadow-md transition-shadow duration-200">
      <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${c.bg} ${c.border} border flex items-center justify-center`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="text-slate-500 font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    try {
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch {
      toast.error("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading dashboard…" />;

  const chartData = (stats?.sessionTrend || []).map((d) => ({
    date: d._id,
    Sessions: d.count,
    "Accuracy %": Math.round(d.avgAccuracy || 0),
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Practice overview for today</p>
        </div>
        {process.env.NODE_ENV === "development" && (
          <Link
            to="/qa-tests"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-semibold border border-amber-200 hover:bg-amber-200 transition"
          >
            QA Tests
          </Link>
        )}
      </div>

      {/* ─── Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          icon={Users}
          label="Total Patients"
          value={stats?.stats?.totalPatients ?? 0}
          sub="across all therapists"
          accentColor="blue"
        />
        <StatCard
          icon={Activity}
          label="Sessions Completed"
          value={stats?.stats?.totalSessions ?? 0}
          sub="all time"
          accentColor="teal"
        />
        <StatCard
          icon={Target}
          label="Avg Accuracy"
          value={stats?.stats?.avgAccuracy ? `${Math.round(stats.stats.avgAccuracy)}%` : "—"}
          sub="movement accuracy"
          accentColor="violet"
        />
        <StatCard
          icon={Clock}
          label="Active Patients"
          value={stats?.stats?.activePatients ?? 0}
          sub="in rehabilitation"
          accentColor="amber"
        />
      </div>

      {/* ─── Chart ───────────────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Session Trend</h2>
              <p className="text-xs text-slate-400 mt-0.5">Last 7 days</p>
            </div>
            <div className="flex items-center gap-5 text-xs">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="inline-block w-3 h-0.5 rounded bg-blue-500" />Sessions
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="inline-block w-3 h-0.5 rounded bg-violet-400" />Accuracy %
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="Sessions" stroke="#3b82f6" strokeWidth={2.5}
                dot={{ fill: "#3b82f6", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Accuracy %" stroke="#8b5cf6" strokeWidth={2.5}
                dot={{ fill: "#8b5cf6", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Recent Patients ─────────────────────────────────────────── */}
      {stats?.recentPatients?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent Patients</h2>
            <Link to="/patients" className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {stats.recentPatients.map((patient) => (
              <div key={patient._id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                    {(patient.name || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{patient.name}</p>
                    <p className="text-xs text-slate-400">{patient.condition || "No condition recorded"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{patient.totalSessions || 0}</p>
                  <p className="text-xs text-slate-400">sessions</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}