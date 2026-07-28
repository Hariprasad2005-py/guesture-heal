import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { patientApi } from "../utils/apiService";
import { Plus, Search, User, Activity, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import LoadingSpinner from "../components/ui/LoadingSpinner";

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPatients();
  }, []);

  async function loadPatients() {
    try {
      const data = await patientApi.getAll();
      setPatients(data.patients || []);
    } catch (err) {
      toast.error("Failed to load patients");
    } finally {
      setLoading(false);
    }
  }

  const filtered = patients.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.patientId?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner text="Loading patients..." />;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Patients</h1>
          <p className="text-slate-500 mt-1">Manage your patient roster and their rehabilitation progress.</p>
        </div>
        <button
          onClick={() => navigate("/intake")}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
        >
          <Plus size={18} />
          Add Patient
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* Patients Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={32} className="text-slate-400" />
          </div>
          <p className="text-slate-500 text-lg">No patients found</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your search or add a new patient.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((patient) => (
            <div
              key={patient._id || patient.id}
              onClick={() => navigate(`/patients/${patient._id || patient.id}`)}
              className="bg-white rounded-lg border border-slate-200 p-6 cursor-pointer hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  {patient.name?.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-slate-400 font-mono">{patient.patientId}</span>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">{patient.name}</h3>
              <p className="text-sm text-slate-500 mb-4">{patient.condition}</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Age:</span>
                  <span className="font-medium text-slate-900">{patient.age || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Sessions:</span>
                  <span className="font-medium text-slate-900">{patient.totalSessions || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Avg Accuracy:</span>
                  <span className="font-medium text-teal-600">
                    {patient.averageAccuracy ? `${Math.round(patient.averageAccuracy)}%` : "-"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}