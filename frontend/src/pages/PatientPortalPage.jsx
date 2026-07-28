// frontend/src/pages/PatientPortalPage.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  UserCircle, ArrowRight, Copy, Loader2, 
  Shield, Sparkles, Activity, Heart, 
  Calendar, CheckCircle2, Fingerprint,
  Globe, Lock, Zap, Award, TrendingUp,
  ChevronRight, Mic, Camera, Monitor,
  Brain, Target, Dumbbell, Stethoscope,
  Waves, Sparkle
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../utils/apiService";
import { useAppStore } from "../store/appStore";

export default function PatientPortalPage() {
  const [patientId, setPatientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const navigate = useNavigate();
  const { setAuth, setCurrentPatient } = useAppStore();
  const inputRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    const cleanId = patientId.trim().toUpperCase();
    if (!cleanId) {
      toast.error("Please enter your Patient ID");
      return;
    }

    if (!cleanId.startsWith("GH-") || cleanId.length < 8) {
      toast.error("Please enter a valid Patient ID (e.g., GH-12345)");
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.patientLogin({ patientId: cleanId });
      
      if (response.success && response.patient) {
        setCurrentPatient(response.patient);
        if (response.token) {
          setAuth(response.patient, response.token);
        }
        toast.success(`Welcome back, ${response.patient.name || 'Patient'}! 🎉`);
        navigate(`/patient/dashboard/${cleanId}`);
      } else {
        toast.error("Patient not found. Please check your ID.");
      }
    } catch (err) {
      toast.error(err.message || "Patient ID not found. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(patientId.toUpperCase());
    toast.success("Patient ID copied to clipboard!");
  };

  const features = [
    { icon: Brain, label: "AI Motion Tracking", desc: "Real-time pose analysis" },
    { icon: Activity, label: "Progress Analytics", desc: "Visual recovery metrics" },
    { icon: Shield, label: "HIPAA Compliant", desc: "Enterprise-grade security" },
    { icon: Calendar, label: "Smart Scheduling", desc: "Automated session planning" },
  ];

  const stats = [
    { value: "96%", label: "Accuracy Rate" },
    { value: "12k+", label: "Active Patients" },
    { value: "4.9", label: "Patient Rating" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-200/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-200/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-100/10 rounded-full blur-3xl" />
        
        {/* Floating Orbs */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-teal-400/30 rounded-full"
            animate={{
              x: [0, Math.random() * 100 - 50, 0],
              y: [0, Math.random() * 100 - 50, 0],
            }}
            transition={{
              duration: 4 + Math.random() * 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
            }}
          />
        ))}
      </div>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center"
      >
        {/* Left Side - Brand & Features */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-8"
        >
          {/* Logo */}
          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.02 }}
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-xl shadow-teal-500/30">
                <Activity className="w-7 h-7 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-teal-400 rounded-full animate-ping" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">GestureHeal</h1>
              <p className="text-xs text-slate-500 font-medium">AI Rehabilitation Platform</p>
            </div>
          </motion.div>

          {/* Hero Text */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs font-semibold text-teal-700">
                <Sparkle className="w-3 h-3" />
                Secure Patient Portal
              </span>
            </motion.div>
            
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-tight tracking-tight">
              Your Recovery,
              <br />
              <span className="bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
                Reimagined
              </span>
            </h2>
            
            <p className="text-slate-600 text-lg leading-relaxed max-w-md">
              Access your personalized rehabilitation plan, track progress in real-time, 
              and connect with your care team—all from one intelligent dashboard.
            </p>
          </div>

          {/* Stats */}
          <motion.div 
            className="flex gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {stats.map((stat, i) => (
              <div key={i} className="relative">
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
                {i < stats.length - 1 && (
                  <div className="absolute -right-4 top-0 h-full w-px bg-slate-200" />
                )}
              </div>
            ))}
          </motion.div>

          {/* Features Grid */}
          <motion.div 
            className="grid grid-cols-2 gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {features.map((feature, i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.02, y: -2 }}
                className="bg-white/60 backdrop-blur-sm border border-slate-200/50 rounded-xl p-3 hover:border-teal-200 transition-all shadow-sm hover:shadow-md"
              >
                <feature.icon className="w-4 h-4 text-teal-600 mb-1.5" />
                <div className="text-xs font-semibold text-slate-700">{feature.label}</div>
                <div className="text-[10px] text-slate-400">{feature.desc}</div>
              </motion.div>
            ))}
          </motion.div>

          {/* Trust Badges */}
          <motion.div 
            className="flex items-center gap-4 pt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {[
              { icon: Shield, label: "HIPAA Compliant" },
              { icon: Lock, label: "256-bit Encryption" },
              { icon: Award, label: "FDA Cleared" },
            ].map((badge, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <badge.icon className="w-3 h-3 text-teal-600" />
                <span className="text-[10px] text-slate-500 font-medium">{badge.label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right Side - Login Card */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative"
        >
          {/* Glow Effect */}
          <div 
            className="absolute -inset-1 bg-gradient-to-r from-teal-400/20 to-blue-400/20 rounded-3xl blur-xl"
            style={{
              transform: `translate(${mousePosition.x * 0.01}px, ${mousePosition.y * 0.01}px)`
            }}
          />

          <div className="relative bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-slate-200/50 border border-white/50 p-8 overflow-hidden">
            {/* Decorative Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 via-teal-500 to-blue-500" />
            
            {/* Decorative Pattern */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-teal-500/5 rounded-full blur-2xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/5 rounded-full blur-2xl" />

            <div className="relative">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-teal-500/30 relative">
                  <UserCircle className="w-10 h-10 text-white" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 rounded-full border-2 border-white flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Welcome Back</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
                  Enter your Patient ID to access your personalized rehabilitation dashboard
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Fingerprint className="w-3 h-3" />
                    Patient ID
                  </label>
                  <div className={`relative group transition-all duration-300 ${
                    isFocused ? 'scale-[1.02]' : ''
                  }`}>
                    <div className={`absolute inset-0 rounded-xl bg-gradient-to-r from-teal-400 to-blue-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300 ${
                      isFocused ? 'opacity-30' : ''
                    }`} />
                    <div className="relative">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-teal-500 transition-colors" />
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="GH-12345"
                        value={patientId}
                        onChange={(e) => setPatientId(e.target.value.toUpperCase())}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        className="w-full pl-12 pr-12 py-4 rounded-xl bg-slate-50/80 border-2 border-slate-200 focus:outline-none focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 font-mono text-lg uppercase text-slate-900 placeholder:text-slate-300"
                        autoFocus
                        disabled={loading}
                      />
                      {patientId && patientId.length > 5 && (
                        <button
                          type="button"
                          onClick={copyId}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-600 transition-colors p-1 hover:bg-teal-50 rounded-lg"
                          aria-label="Copy Patient ID"
                        >
                          <Copy size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <span className="inline-block w-1 h-1 bg-slate-300 rounded-full" />
                      Format: GH-XXXXX
                    </p>
                    <motion.button
                      type="button"
                      className="text-xs text-teal-600 font-medium hover:underline flex items-center gap-1"
                      whileHover={{ x: 2 }}
                    >
                      Need help? <ChevronRight className="w-3 h-3" />
                    </motion.button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  disabled={loading || !patientId}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative w-full bg-gradient-to-r from-teal-600 to-teal-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-teal-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Access Dashboard</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </motion.button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-4 bg-white text-slate-400">or</span>
                </div>
              </div>

              {/* Register Link */}
              <div className="text-center">
                <p className="text-sm text-slate-500 mb-3">New to GestureHeal?</p>
                <motion.button
                  onClick={() => navigate("/patient/register")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 transition-all group"
                >
                  <UserCircle className="w-4 h-4 text-teal-600" />
                  Create New Patient Profile
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </motion.button>
              </div>

              {/* Security Notice */}
              <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-700">Secure Access</p>
                    <p className="text-xs text-amber-600/80">
                      Your Patient ID was provided after registration. Keep it confidential.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Tips */}
              <motion.div 
                className="mt-4 flex items-center justify-center gap-4 text-[10px] text-slate-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <span className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-teal-400 rounded-full" />
                  End-to-end encrypted
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-teal-400 rounded-full" />
                  HIPAA compliant
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-teal-400 rounded-full" />
                  24/7 support
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Floating Action Hint */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-lg border border-white/50"
      >
        <Sparkles className="w-3 h-3 text-teal-500" />
        <span className="text-xs text-slate-600 font-medium">AI-powered rehabilitation • v3.0</span>
        <div className="w-1 h-1 bg-teal-400 rounded-full" />
        <span className="text-xs text-slate-400">Secure • Private • Smart</span>
      </motion.div>
    </div>
  );
}