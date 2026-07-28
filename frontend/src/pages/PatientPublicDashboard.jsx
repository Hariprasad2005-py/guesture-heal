// frontend/src/pages/PatientPublicDashboard.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { patientPublicApi, sessionApi } from "../utils/apiService";
import { useAppStore } from "../store/appStore";
import toast from "react-hot-toast";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import StatCard from "../components/ui/StatCard";
import { 
  Zap, 
  Activity, 
  Calendar, 
  Award, 
  PlayCircle, 
  User, 
  TrendingUp
} from "lucide-react";

export default function PatientPublicDashboard() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const navigate = useNavigate();
  const { setCurrentPatient, setPublicPatientId, publicPatientId } = useAppStore();

  useEffect(() => {
    const storedId = publicPatientId || useAppStore.getState().currentPatient?.patientId
    
    if (id && storedId && id === storedId && useAppStore.getState().currentPatient) {
      setPatient(useAppStore.getState().currentPatient)
      setLoading(false)
      return
    }
    
    loadPatient()
  }, [id, publicPatientId])

  async function loadPatient() {
    try {
      const data = await patientPublicApi.getById(id);
      const patientData = data.patient;
      
      if (!patientData) {
        toast.error("Patient not found");
        navigate("/patient");
        return;
      }
      
      setPatient(patientData);
      setCurrentPatient(patientData);
      setPublicPatientId(patientData.patientId);
      
      if (patientData?._id) {
        try {
          const sessionData = await sessionApi.getByPatient(patientData._id);
          setSessions(sessionData?.sessions || []);
        } catch (err) {
          console.error("Failed to load sessions:", err);
        }
      }
    } catch (err) {
      toast.error("Invalid Patient ID or session expired");
      navigate("/patient");
    } finally {
      setLoading(false);
    }
  }

  const handleStartSession = () => {
    if (patient) {
      setCurrentPatient(patient);
      setPublicPatientId(patient.patientId);
    }
    navigate("/games");
  };

  if (loading) return <LoadingSpinner text="Loading your recovery dashboard..." />;
  if (!patient) return <div className="p-8 text-center">Profile not found. Please check your ID.</div>;

  const completedDays = patient.rehabPlan?.filter(d => d.isCompleted).length || 0;
  const totalDays = patient.rehabPlan?.length || 7;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 to-blue-700 text-white p-8 md:p-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-black mb-2">Hello, {patient.name?.split(' ')[0] || 'Patient'}! 👋</h1>
            <p className="text-teal-100 opacity-90">Ready for today's recovery session? You're doing great.</p>
          </div>
          <button 
            onClick={handleStartSession}
            className="bg-white text-teal-700 px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-2 shadow-lg hover:scale-105 transition-transform"
          >
            <PlayCircle size={24} /> Start Exercises
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 md:p-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            icon={Activity}
            title="Current Progress"
            value={`Day ${patient.currentDay || 1}`}
            unit={`/ ${totalDays}`}
            color="teal"
          />
          <StatCard
            icon={Award}
            title="Sessions"
            value={patient.totalSessions || 0}
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            title="Avg Accuracy"
            value={`${patient.averageAccuracy || 0}%`}
            color="purple"
          />
          <StatCard
            icon={Zap}
            title="Total Score"
            value={patient.totalScore || 0}
            color="amber"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Rehab Plan */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="text-teal-600" /> Your 7-Day Rehab Plan
            </h2>
            
            <div className="grid gap-4">
              {patient.rehabPlan?.map((day) => (
                <div 
                  key={day.day}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    day.day === patient.currentDay 
                    ? 'bg-white border-teal-500 shadow-md ring-4 ring-teal-500/10' 
                    : day.isCompleted
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-slate-50 border-slate-200 opacity-70'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 inline-block ${
                        day.day === patient.currentDay ? 'bg-teal-100 text-teal-700' : 
                        day.isCompleted ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-200 text-slate-500'
                      }`}>
                        Day {day.day}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">
                        {day.exercises.length} Exercises
                      </h3>
                    </div>
                    {day.isCompleted && (
                      <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">✅ COMPLETED</span>
                    )}
                    {day.day === patient.currentDay && !day.isCompleted && (
                      <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-bold">📌 TODAY</span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {day.exercises.map(ex => (
                      <span key={ex.exerciseId} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm text-slate-600">
                        {ex.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Profile Sidebar */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <User className="text-teal-600" size={20} />
                Profile Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Patient ID</label>
                  <p className="font-mono text-lg font-bold text-slate-800">{patient.patientId}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Medical Condition</label>
                  <p className="font-semibold text-slate-700">{patient.condition}</p>
                </div>
                {patient.surgeryDate && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Surgery Date</label>
                    <p className="font-semibold text-slate-700">{new Date(patient.surgeryDate).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Pain Level</label>
                  <p className="font-semibold text-slate-700">{patient.painLevel}/10</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Progress</label>
                  <div className="mt-1">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{completedDays} days completed</span>
                      <span>{Math.round((completedDays / totalDays) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${(completedDays / totalDays) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
              <h3 className="text-lg font-bold mb-2">Need Help?</h3>
              <p className="text-slate-400 text-sm mb-4">If you experience pain during exercises, please stop immediately and contact your therapist.</p>
              <button className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors">
                Contact Care Team
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}