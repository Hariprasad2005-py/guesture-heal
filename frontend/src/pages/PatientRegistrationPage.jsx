// frontend/src/pages/PatientRegistrationPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { patientPublicApi } from "../utils/apiService";
import toast from "react-hot-toast";
import { Shield, CheckCircle, Copy, ArrowRight, Loader2 } from "lucide-react";

const CONDITIONS = [
  "Hand Surgery Recovery", 
  "Stroke Rehabilitation", 
  "Fracture Recovery",
  "Nerve Injury Rehabilitation", 
  "Wrist Rehabilitation", 
  "Parkinson's", 
  "Rotator Cuff",
];

export default function PatientRegistrationPage() {
  const navigate = useNavigate();
  const { setCurrentPatient } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [generatedId, setGeneratedId] = useState("");
  const [registeredPatient, setRegisteredPatient] = useState(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    age: "",
    gender: "",
    phone: "",
    email: "",
    address: "",
    condition: "",
    injuryType: "",
    emergencyContact: "",
    assignedTherapist: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    
    if (!form.firstName || !form.lastName || !form.age || !form.condition) {
      toast.error("Please fill in all required fields (marked with *)");
      return;
    }

    setLoading(true);
    
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        age: parseInt(form.age),
        gender: form.gender || "Other",
        phone: form.phone || "",
        email: form.email || "",
        address: form.address || "",
        condition: form.condition,
        injuryType: form.injuryType || "",
        emergencyContact: form.emergencyContact || "",
        assignedTherapist: form.assignedTherapist || "",
      };

      const data = await patientPublicApi.selfRegister(payload);
      setGeneratedId(data.patientId);
      setRegisteredPatient(data.patient);
      setShowSuccess(true);
      toast.success("Registration successful!");
    } catch (err) {
      toast.error(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const copyId = () => {
    navigator.clipboard.writeText(generatedId);
    toast.success("ID copied to clipboard!");
  };

  const inputClass = "w-full px-4 py-3 rounded-xl bg-white border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900 placeholder-slate-400 transition-all";
  const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── SUCCESS MODAL ─────────────────────────────────────────────── */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-10 text-center animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={48} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">Registration Complete! 🎉</h2>
            <p className="text-slate-500 mb-6">
              Please save your unique Patient ID. You will need this to access your dashboard later.
            </p>
            
            <div className="bg-slate-50 border-2 border-dashed border-teal-300 rounded-2xl p-6 mb-6">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">
                Your Patient ID
              </span>
              <div className="flex items-center justify-center gap-4">
                <span className="text-4xl font-mono font-black text-teal-600 tracking-tighter">
                  {generatedId}
                </span>
                <button 
                  onClick={copyId}
                  className="p-2 text-slate-400 hover:text-teal-600 transition-colors rounded-lg hover:bg-teal-50"
                >
                  <Copy size={22} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Click the copy icon to save your ID
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  if (registeredPatient) setCurrentPatient(registeredPatient);
                  navigate(`/patient/dashboard/${generatedId}`);
                }}
                className="flex-1 bg-teal-700 text-white py-4 rounded-2xl font-bold text-lg hover:bg-teal-800 transition-all shadow-lg shadow-teal-700/20"
              >
                Continue to Dashboard →
              </button>
              <button
                onClick={() => navigate("/patient")}
                className="flex-1 bg-slate-200 text-slate-700 py-4 rounded-2xl font-semibold hover:bg-slate-300 transition-all"
              >
                Go to Login
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-4">
              🔒 Your Patient ID is unique. Never share it with anyone.
            </p>
          </div>
        </div>
      )}

      {/* ─── MAIN REGISTRATION FORM ────────────────────────────────────── */}
      <div className="flex min-h-screen">
        {/* LEFT PANEL */}
        <div className="hidden md:flex w-80 flex-shrink-0 bg-gradient-to-br from-teal-500 to-blue-600 flex-col justify-between p-8">
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="text-white text-xl">🖐</span>
              </div>
              <span className="text-white font-bold text-lg">GestureHeal</span>
            </div>
            <h1 className="text-3xl font-bold text-white leading-tight mb-4">
              Comprehensive Onboarding.
            </h1>
            <p className="text-teal-100 text-sm">
              Join our network of patients recovering better, faster, and smarter with AI-guided therapy.
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="text-teal-200 w-5 h-5" />
              <span className="text-white font-semibold text-sm">Secure Data</span>
            </div>
            <p className="text-teal-100 text-xs">
              Your medical information is encrypted and stored according to clinical standards.
            </p>
          </div>
        </div>

        {/* RIGHT PANEL - FORM */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Patient Registration</h2>
            <p className="text-slate-500 text-sm mb-8">Please provide complete details for a personalized plan.</p>

            <form onSubmit={handleSubmit}>
              {/* First Row: First Name & Last Name */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    placeholder="Enter first name"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    placeholder="Enter last name"
                    className={inputClass}
                    required
                  />
                </div>
              </div>

              {/* Second Row: Age & Gender */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>
                    Age <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={form.age}
                    onChange={handleChange}
                    placeholder="Enter age"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Gender</label>
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Third Row: Phone & Email */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Enter phone number"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Enter email address"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="mb-4">
                <label className={labelClass}>Full Address</label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Enter full address"
                  className={inputClass}
                />
              </div>

              {/* Medical Condition */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>
                    Medical Condition <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="condition"
                    value={form.condition}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  >
                    <option value="">Select Condition</option>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Emergency Contact & Assigned Therapist */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div>
                  <label className={labelClass}>Emergency Contact</label>
                  <input
                    type="text"
                    name="emergencyContact"
                    value={form.emergencyContact}
                    onChange={handleChange}
                    placeholder="Name & Phone"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Assigned Therapist (Optional)</label>
                  <input
                    type="text"
                    name="assignedTherapist"
                    value={form.assignedTherapist}
                    onChange={handleChange}
                    placeholder="Therapist name"
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-teal-800 transition disabled:opacity-50 text-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    Registering...
                  </>
                ) : (
                  "Complete Registration →"
                )}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-4">
              Already registered?{" "}
              <button
                onClick={() => navigate("/patient")}
                className="text-teal-600 font-semibold hover:underline"
              >
                Enter Patient ID
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}