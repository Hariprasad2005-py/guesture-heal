import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "../utils/apiService";
import { useAppStore } from "../store/appStore";
import { BadgeCheck, Loader2, ChevronRight } from "lucide-react";

const FONT_IMPORTS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
`;

export default function TherapistLogin() {
  const navigate = useNavigate();
  const [therapistId, setTherapistId] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAppStore((s) => s.setAuth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.therapistLogin({ therapistId: therapistId.trim().toUpperCase() });

      // Use your existing store setter so useAppStore's token/user stay in sync
      // (this also keeps whatever Zustand persistence you already have working).
      if (typeof setAuth === "function") {
        setAuth(res.therapist, res.token);
      } else {
        // Fallback: write directly to the same localStorage key apiService reads.
        localStorage.setItem(
          "gestureheal-storage",
          JSON.stringify({ state: { token: res.token, user: res.therapist } })
        );
      }

      toast.success(`Welcome back, ${res.therapist.name}`);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-12" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORTS}</style>
      <div className="max-w-sm w-full">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-[#E2E8F0] shadow-md p-8 space-y-5"
        >
          <div className="flex flex-col items-center text-center mb-2">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg, #2563EB, #06B6D4)" }}
            >
              <BadgeCheck className="w-7 h-7 text-white" strokeWidth={1.75} />
            </div>
            <h1
              className="text-[#0F172A] mb-1"
              style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: "24px" }}
            >
              Therapist Login
            </h1>
            <p className="text-[#64748B] text-sm">
              Enter your Therapist ID to access your dashboard
            </p>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-[#334155] mb-1.5">Therapist ID</span>
            <input
              placeholder="TH-XXXXX"
              className="w-full h-[52px] bg-slate-50 border border-slate-200 rounded-xl px-4 text-[15px] font-mono tracking-wide text-[#0F172A] placeholder:text-[#94A3B8] placeholder:font-sans transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] focus:bg-white"
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              required
            />
          </label>

          <button
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white rounded-xl py-3.5 font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Logging in..." : "Log In"}
            {!loading && <ChevronRight className="w-4 h-4" />}
          </button>

          <p className="text-center text-sm text-[#64748B]">
            New here?{" "}
            <a href="/therapist-register" className="text-[#2563EB] font-medium hover:underline">
              Register as a therapist
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}