// frontend/src/pages/RehabPage.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { sessionApi } from "../utils/apiService";
import { useAppStore } from "../store/appStore";
import toast from "react-hot-toast";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { Play, ClipboardList, Activity, ArrowRight } from "lucide-react";

export default function RehabPage() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  const { setCurrentSession, setCurrentPatient, token, publicPatientId } = useAppStore();

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  async function loadSession() {
    try {
      if (sessionId) {
        // Determine which API to use based on authentication
        let data;
        if (token) {
          // Authenticated user - use protected endpoint
          data = await sessionApi.getById(sessionId);
        } else {
          // Public user - need patient ID from URL or store
          const patientId = publicPatientId || useAppStore.getState().currentPatient?.patientId
          if (!patientId) {
            toast.error("Patient ID not found. Please log in or use a valid patient link.");
            navigate("/patient");
            return;
          }
          data = await sessionApi.publicGetById(sessionId, patientId);
        }
        
        const sessionData = data.session || data;
        
        if (!sessionData) {
          toast.error("Session not found or access denied");
          navigate("/dashboard");
          return;
        }
        
        setSession(sessionData);
        setCurrentSession(sessionData);
        if (sessionData.patientId) setCurrentPatient(sessionData.patientId);
      }
    } catch (err) {
      toast.error("Failed to load session: " + (err.message || "Unknown error"));
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  const handleStartExercises = () => {
    // Validate session exists before navigating
    if (!session) {
      toast.error("No active session found");
      return;
    }
    navigate("/games");
  };

  if (loading) return <LoadingSpinner text="Initializing session..." />;

  if (!session) return (
    <div className="p-12 text-center">
      <ClipboardList size={64} className="mx-auto text-slate-300 mb-4" />
      <h2 className="text-2xl font-bold text-slate-800">No active session found</h2>
      <button onClick={() => navigate("/dashboard")} className="mt-4 text-teal-600 font-bold hover:underline">
        Return to Dashboard
      </button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.2em] text-teal-400 mb-2 block">Active Session</span>
              <h1 className="text-3xl font-black mb-1">Recovery Phase</h1>
              <p className="text-slate-400 font-medium">Session ID: {session.sessionId || session._id}</p>
            </div>
            <div className="bg-teal-500/10 border border-teal-500/20 p-3 rounded-2xl">
              <Activity className="text-teal-400" />
            </div>
          </div>
        </div>

        <div className="p-8 md:p-12 text-center">
          <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-8">
            <Play size={40} className="text-teal-600 ml-1" />
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 mb-4">Ready to begin?</h2>
          <p className="text-slate-500 text-lg mb-10 max-w-md mx-auto leading-relaxed">
            Ensure you have a clear area for movement and your camera is unobstructed.
          </p>

          <button
            onClick={handleStartExercises}
            className="w-full md:w-auto px-12 py-5 bg-teal-600 hover:bg-teal-500 text-white rounded-[2rem] font-black text-xl transition-all shadow-xl shadow-teal-500/20 flex items-center justify-center gap-3 mx-auto"
          >
            Start Exercises <Play size={20} fill="currentColor" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Last Score" value={session.score || 0} color="amber" />
        <StatBox label="Accuracy" value={`${session.accuracy || 0}%`} color="teal" />
        <StatBox label="Combo" value={`×${session.combo || 0}`} color="blue" />
        <StatBox label="Level" value={session.level || 1} color="purple" />
      </div>
    </div>
  );
}

const StatBox = ({ label, value, color }) => {
  const colors = {
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    teal: "bg-teal-50 text-teal-600 border-teal-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  }
  return (
    <div className={`p-6 rounded-3xl border-2 text-center ${colors[color]}`}>
      <span className="text-[10px] font-black uppercase tracking-widest block mb-1 opacity-60">{label}</span>
      <span className="text-2xl font-black">{value}</span>
    </div>
  )
}