import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { authApi } from "../utils/apiService";
import { Eye, EyeOff } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold mx-auto mb-4">
              G
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Login to GestureHeal</h1>
            <p className="text-sm text-slate-500 mt-1">Welcome back!</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-teal-600 font-semibold hover:underline">
              Register
            </Link>
          </p>

          <p className="text-xs text-slate-500 text-center mt-4 p-3 bg-slate-50 rounded-lg">
            Demo: demo@gestureheal.com / demo1234
          </p>
        </div>
      </div>
    </div>
  );
}