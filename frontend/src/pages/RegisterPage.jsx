import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { authApi } from "../utils/apiService";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "therapist",
  });

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAppStore();

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await authApi.register(form);
      setAuth(res.user, res.token);
      toast.success("Registration successful!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const roles = [
    {
      id: "therapist",
      label: "Therapist",
      desc: "Manage patients & rehabilitation journeys",
      icon: "🩺",
    },
    {
      id: "admin",
      label: "Admin",
      desc: "System oversight, compliance & governance",
      icon: "🛡️",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4 py-10">
      
      {/* ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-120px] left-[-100px] w-[400px] h-[400px] bg-blue-100/30 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-100px] w-[400px] h-[400px] bg-indigo-100/20 blur-3xl rounded-full" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">

          {/* HEADER */}
          <div className="px-8 pt-10 pb-8 bg-gradient-to-br from-slate-900 to-slate-800 text-center">
            <div className="text-3xl mb-3">🫀</div>

            <h1 className="text-xl font-semibold text-white tracking-tight">
              Create your GestureHeal account
            </h1>

            <p className="text-sm text-white/60 mt-2">
              A clinical onboarding experience built for care teams
            </p>
          </div>

          {/* FORM */}
          <form onSubmit={handleRegister} className="px-8 py-8 space-y-6">

            {/* NAME */}
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Full Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition"
                placeholder="Dr. Alex Rivera"
                required
              />
            </div>

            {/* EMAIL */}
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition"
                placeholder="you@clinic.com"
                required
              />
            </div>

            {/* PASSWORD */}
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>

            {/* ROLE SELECTION */}
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Select Role
              </label>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {roles.map((r) => {
                  const active = form.role === r.id;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setForm({ ...form, role: r.id })}
                      className={[
                        "relative text-left p-4 rounded-xl border transition-all duration-200",
                        "hover:shadow-md hover:-translate-y-0.5",
                        active
                          ? "border-blue-500 bg-blue-50 shadow-md scale-[1.02]"
                          : "border-slate-200 bg-white",
                      ].join(" ")}
                    >
                      <div className="text-lg">{r.icon}</div>

                      <div className="mt-2 font-semibold text-slate-800">
                        {r.label}
                      </div>

                      <div className="text-xs text-slate-500 mt-1 leading-snug">
                        {r.desc}
                      </div>

                      {active && (
                        <div className="absolute top-3 right-3 w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-medium transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>

            {/* LOGIN */}
            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link
                to="/login"
                className="text-slate-900 font-medium hover:text-blue-600 transition"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>

        {/* FOOTNOTE */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Encrypted · HIPAA-ready architecture
        </p>
      </div>
    </div>
  );
}