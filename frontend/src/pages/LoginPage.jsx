import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { authApi } from "../utils/apiService";
import { Eye, EyeOff, Activity, Shield, Heart } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@gestureheal.com");
  const [password, setPassword] = useState("demo1234");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAppStore();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      setAuth(res.user, res.token);
      toast.success("Login successful!");
      navigate(res.user?.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── LEFT PANEL ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex-col items-start justify-between p-14 overflow-hidden">
        {/* Decorative rings */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full border border-white/5" />
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full border border-white/5" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-blue-700/20 blur-3xl" />

        {/* Logo */}
        <div className="flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
            <Activity size={20} className="text-blue-300" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">GestureHeal</span>
        </div>

        {/* Center tagline */}
        <div className="z-10">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Precision Rehab.<br />
            <span className="text-blue-300">Measurable Results.</span>
          </h2>
          <p className="text-blue-200/70 text-base leading-relaxed max-w-sm">
            A clinical-grade platform helping therapists track patient progress, generate reports, and drive better outcomes through motion-based rehabilitation.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 mt-8">
            {[
              { icon: Shield, label: "HIPAA-Aligned" },
              { icon: Activity, label: "Real-Time Motion" },
              { icon: Heart, label: "Patient-Centered" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-1.5 rounded-full border border-white/10">
                <Icon size={13} className="text-blue-300" />
                <span className="text-xs text-blue-100 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <p className="text-blue-300/50 text-xs z-10">
          © {new Date().getFullYear()} GestureHeal. All rights reserved.
        </p>
      </div>

      {/* ─── RIGHT PANEL ─────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Activity size={18} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-xl">GestureHeal</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to your clinical dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="you@clinic.com"
                required
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-11"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold text-sm transition-all duration-150 shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-200 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            New to GestureHeal?{" "}
            <Link to="/register" className="text-blue-600 font-semibold hover:underline">
              Create account
            </Link>
          </p>

          {/* Demo badge */}
          <div className="mt-6 p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-0.5">Demo Credentials</p>
            <p className="text-xs text-blue-600 font-mono">demo@gestureheal.com / demo1234</p>
          </div>
        </div>
      </div>
    </div>
  );
}