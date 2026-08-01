import { useEffect, useState } from "react";
import { dashboardApi } from "../utils/apiService";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "../components/ui/StatCard";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { Users, Activity, TrendingUp, Target, Clock, Award } from "lucide-react";
import { Link } from 'react-router-dom';
import toast from "react-hot-toast";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch (err) {
      toast.error("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const chartData = (stats?.sessionTrend || []).map((d) => ({
    date: d._id,
    sessions: d.count,
    avgAccuracy: Math.round(d.avgAccuracy || 0),
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome back! Here's your practice overview.</p>
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-3">
            <Link to="/qa-tests" className="inline-block px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold">Open QA Tests (dev)</Link>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Users}
          title="Total Patients"
          value={stats?.stats?.totalPatients || 0}
          color="teal"
        />
        <StatCard
          icon={Activity}
          title="Sessions Completed"
          value={stats?.stats?.totalSessions || 0}
          color="blue"
        />
        <StatCard
          icon={Target}
          title="Avg Accuracy"
          value={stats?.stats?.avgAccuracy ? `${Math.round(stats.stats.avgAccuracy)}%` : "-"}
          color="purple"
        />
        <StatCard
          icon={Clock}
          title="Active Patients"
          value={stats?.stats?.activePatients || 0}
          color="orange"
        />
      </div>

      {/* 7-Day Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">7-Day Session Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#14b8a6"
                strokeWidth={2}
                dot={{ fill: "#14b8a6", r: 4 }}
                name="Sessions"
              />
              <Line
                type="monotone"
                dataKey="avgAccuracy"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                name="Avg Accuracy %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Patients */}
      {stats?.recentPatients?.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Patients</h2>
          <div className="space-y-3">
            {stats.recentPatients.map((patient) => (
              <div
                key={patient._id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-slate-900">{patient.name}</p>
                  <p className="text-sm text-slate-500">{patient.condition}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">
                    {patient.totalSessions || 0} sessions
                  </p>
                  <p className="text-xs text-slate-500">
                    {patient.averageAccuracy ? `${Math.round(patient.averageAccuracy)}%` : "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}