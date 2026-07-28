import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { patientApi } from "../utils/apiService";
import toast from "react-hot-toast";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import StatCard from "../components/ui/StatCard";
import { User, Zap, AlertCircle, Activity, Calendar, Clipboard } from "lucide-react";

export default function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadPatient();
  }, [id]);

  async function loadPatient() {
    try {
      const data = await patientApi.getById(id);
      setPatient(data.patient);
    } catch (err) {
      toast.error("Failed to load patient");
      navigate("/patients");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading patient..." />;
  if (!patient) return <div>Patient not found</div>;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/patients")}
          className="text-teal-600 hover:underline text-sm mb-4"
        >
          ← Back to Patients
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg">
            {patient.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-slate-500">{patient.condition}</p>
            <p className="text-xs text-slate-400 font-mono">ID: {patient.patientId}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={User}
          title="Age"
          value={patient.age || "-"}
          color="blue"
        />
        <StatCard
          icon={AlertCircle}
          title="Pain Level"
          value={patient.painLevel || 0}
          unit="/10"
          color="orange"
        />
        <StatCard
          icon={Activity}
          title="Sessions"
          value={patient.totalSessions || 0}
          color="teal"
        />
        <StatCard
          icon={Zap}
          title="Avg Accuracy"
          value={patient.averageAccuracy ? `${Math.round(patient.averageAccuracy)}%` : "-"}
          color="purple"
        />
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User size={18} className="text-slate-400" />
            Personal Info
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-500">Gender</p>
              <p className="font-medium text-slate-900 capitalize">{patient.gender || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Contact</p>
              <p className="font-medium text-slate-900">{patient.contactNumber || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Patient ID</p>
              <p className="font-mono font-medium text-slate-900">{patient.patientId}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Clipboard size={18} className="text-slate-400" />
            Medical Info
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-500">Condition</p>
              <p className="font-medium text-slate-900">{patient.condition}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Surgery Type</p>
              <p className="font-medium text-slate-900">{patient.surgeryType || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Surgery Date</p>
              <p className="font-medium text-slate-900">
                {patient.surgeryDate ? new Date(patient.surgeryDate).toLocaleDateString() : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Affected Side</p>
              <p className="font-medium text-slate-900 capitalize">{patient.affectedSide || "-"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Goals & Notes */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mt-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-slate-400" />
          Goals & Notes
        </h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-2">Rehabilitation Goals</p>
            <p className="text-slate-900">{patient.goals || "No goals set"}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-2">Additional Notes</p>
            <p className="text-slate-900">{patient.notes || "No notes"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}