import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "../utils/apiService";
import {
  User,
  GraduationCap,
  Brain,
  CalendarDays,
  Mail,
  Phone,
  Hospital,
  ClipboardList,
  Clock,
  BadgeCheck,
  CheckCircle2,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Copy,
} from "lucide-react";

const CONDITIONS = [
  "Stroke Rehabilitation",
  "Hand Surgery Recovery",
  "Fracture Recovery",
  "Nerve Injury Rehabilitation",
  "Wrist Rehabilitation",
  "Parkinson's",
  "Rotator Cuff",
];

const THERAPY_AREAS = [
  "Upper Limb Rehabilitation",
  "Hand Therapy",
  "Neurological Rehabilitation",
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const QUALIFICATIONS = [
  "Bachelor of Physiotherapy (BPT)",
  "Master of Physiotherapy (MPT)",
  "Doctor of Physical Therapy (DPT)",
  "Bachelor of Occupational Therapy (BOT)",
  "Master of Occupational Therapy (MOT)",
  "MSc Occupational Therapy",
  "MD Physical Medicine & Rehabilitation (PM&R)",
  "Diploma in Physiotherapy (DPT - Diploma)",
  "Other",
];
const SPECIALIZATIONS = [
  "Neurological Rehabilitation",
  "Orthopedic Rehabilitation",
  "Hand Rehabilitation",
  "Stroke Rehabilitation",
  "Pain Management",
];
const DEPARTMENTS = [
  "Physiotherapy",
  "Occupational Therapy",
  "Physical Medicine & Rehabilitation (PM&R)",
  "Neurology",
  "Orthopedics",
  "Rehabilitation Medicine",
  "Outpatient Rehabilitation",
];

// Recovery-spine section metadata: icon + a completion check drives the
// signature progress rail, which now also doubles as step navigation.
const SECTIONS = [
  { key: "basic", label: "Basic Information", icon: User },
  { key: "professional", label: "Professional Information", icon: GraduationCap },
  { key: "expertise", label: "Rehabilitation Expertise", icon: Brain },
  { key: "availability", label: "Availability", icon: CalendarDays },
];

const FONT_IMPORTS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
`;

export default function TherapistRegister() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [generatedId, setGeneratedId] = useState(null);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    name: "", gender: "", phone: "", email: "",
    qualification: "", specialization: "", yearsOfExperience: "",
    department: "", bio: "",
    conditionsTreated: [], therapyAreas: [], workingDays: [],
    workingHours: { start: "", end: "" },
  });

  const toggle = (key, value) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  };

  // Completion state per section, used to light up the progress rail.
  const completion = {
    basic: Boolean(form.name && form.gender && form.phone && form.email),
    professional: Boolean(form.qualification || form.specialization || form.hospitalOrClinicName),
    expertise: Boolean(form.conditionsTreated.length || form.therapyAreas.length),
    availability: Boolean(form.workingDays.length && form.workingHours.start && form.workingHours.end),
  };
  const completedCount = Object.values(completion).filter(Boolean).length;
  const isLastStep = step === SECTIONS.length - 1;
  const isFirstStep = step === 0;

  const requiredMet = {
    basic: Boolean(form.name && form.gender && form.phone && form.email),
    professional: true,
    expertise: true,
    availability: true,
  };

  const goNext = () => {
    if (!requiredMet[SECTIONS[step].key]) {
      toast.error("Please fill the required fields before continuing");
      return;
    }
    if (!isLastStep) setStep((s) => s + 1);
  };

  const goBack = () => {
    if (!isFirstStep) setStep((s) => s - 1);
  };

  const jumpTo = (i) => {
    // Allow jumping backward freely, or to any already-reached step.
    if (i <= step) setStep(i);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLastStep) {
      goNext();
      return;
    }
    setSubmitting(true);
    try {
      const res = await authApi.therapistRegister(form);
      setGeneratedId(res.therapistId);
      toast.success(`Registered! Your Therapist ID is ${res.therapistId}`);
    } catch (err) {
      toast.error(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(generatedId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — silently ignore, ID is still visible on screen.
    }
  };

  const inputClass =
    "w-full h-[52px] bg-slate-50 border border-slate-200 rounded-xl px-4 text-[15px] text-[#0F172A] " +
    "placeholder:text-[#94A3B8] transition-all duration-200 focus:outline-none focus:ring-2 " +
    "focus:ring-[#2563EB] focus:border-[#2563EB] focus:bg-white";

  if (generatedId) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-12" style={{ fontFamily: "'Inter', sans-serif" }}>
        <style>{FONT_IMPORTS}</style>
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-md p-8 md:p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-9 h-9 text-[#22C55E]" strokeWidth={1.75} />
            </div>

            <h2
              className="text-[#0F172A] mb-2"
              style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: "26px" }}
            >
              Registration Successful
            </h2>
            <p className="text-[#64748B] text-sm mb-8">
              Save your Therapist ID — you'll need it every time you log in.
            </p>

            <div className="mb-8">
              <p className="text-xs font-medium tracking-wide uppercase text-[#64748B] mb-2">
                Your Therapist ID
              </p>
              <div className="relative flex items-center justify-between gap-3 bg-blue-50 border-2 border-dashed border-[#2563EB] rounded-2xl px-5 py-4">
                <span
                  className="text-[#0F172A] tracking-wider truncate"
                  style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: "20px" }}
                >
                  {generatedId}
                </span>
                <button
                  type="button"
                  onClick={copyId}
                  className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-[#2563EB] bg-white border border-[#BFDBFE] rounded-lg px-3 py-2 hover:bg-blue-100 transition-all duration-200"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <button
              onClick={() => navigate("/therapist-login")}
              className="w-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white rounded-xl py-3.5 font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2"
            >
              Go to Login
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORTS}</style>

      {/* Mobile progress bar — tappable */}
      <div className="lg:hidden sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-[#E2E8F0] px-4 py-3">
        <div className="flex items-center justify-center gap-2 max-w-2xl mx-auto">
          {SECTIONS.map((s, i) => (
            <button
              type="button"
              key={s.key}
              onClick={() => jumpTo(i)}
              className="flex items-center flex-1 max-w-[90px]"
            >
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                  i === step ? "bg-[#2563EB]" : completion[s.key] ? "bg-[#0F766E]" : "bg-slate-200"
                }`}
              />
              {i < SECTIONS.length - 1 && (
                <div className={`h-[2px] flex-1 mx-1 transition-colors duration-200 ${completion[s.key] ? "bg-[#0F766E]" : "bg-slate-200"}`} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10 lg:py-14">
        {/* Page header */}
        <div className="relative overflow-hidden bg-white rounded-3xl border border-[#E2E8F0] shadow-md px-6 sm:px-10 py-8 sm:py-10 mb-8">
          <div
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-10"
            style={{ background: "linear-gradient(135deg, #2563EB, #06B6D4)" }}
          />
          <div className="relative flex items-start gap-4">
            <div
              className="hidden sm:flex w-14 h-14 rounded-2xl items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #2563EB, #06B6D4)" }}
            >
              <BadgeCheck className="w-7 h-7 text-white" strokeWidth={1.75} />
            </div>
            <div>
              <h1
                className="text-[#0F172A] mb-2"
                style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: "32px", lineHeight: 1.2 }}
              >
                Therapist Registration
              </h1>
              <p className="text-[#334155] text-base max-w-xl">
                Complete your professional profile to begin managing rehabilitation sessions and monitoring patient recovery.
              </p>
            </div>
          </div>
        </div>

        {/* Desktop horizontal stepper */}
        <div className="hidden lg:flex items-center mb-10 px-2">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            const done = completion[s.key];
            const current = i === step;
            const reachable = i <= step;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  disabled={!reachable}
                  className={`flex flex-col items-center gap-2 ${reachable ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
                      current
                        ? "bg-[#2563EB] ring-4 ring-blue-100"
                        : done
                        ? "bg-[#0F766E]"
                        : "bg-white border-2 border-slate-200"
                    }`}
                  >
                    {done && !current ? (
                      <Check className="w-5 h-5 text-white" strokeWidth={3} />
                    ) : (
                      <Icon className={`w-5 h-5 ${current ? "text-white" : "text-[#94A3B8]"}`} strokeWidth={1.75} />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      current ? "text-[#0F172A]" : done ? "text-[#334155]" : "text-[#94A3B8]"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
                {i < SECTIONS.length - 1 && (
                  <div className={`h-[2px] flex-1 mx-3 mb-6 transition-colors duration-200 ${done ? "bg-[#0F766E]" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="lg:hidden text-sm font-medium text-[#64748B]">
            Step {step + 1} of {SECTIONS.length} · {completedCount}/4 sections complete
          </p>

          {/* Only the current step's section renders */}
          {step === 0 && (
            <section className="bg-white rounded-3xl border border-[#E2E8F0] shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-6 sm:p-8 space-y-5">
              <SectionHeading icon={User} title="Basic Information" />
              <Field label="Full name">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                  <input
                    required
                    placeholder="Jordan Ramirez"
                    className={`${inputClass} pl-11`}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Gender">
                  <select
                    required
                    className={inputClass}
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="">Select</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Phone number">
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <input
                      required
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="9876543210"
                      className={`${inputClass} pl-11`}
                      value={form.phone}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setForm({ ...form, phone: digitsOnly });
                      }}
                    />
                  </div>
                </Field>
              </div>
              <Field label="Email address">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                  <input
                    required
                    type="email"
                    placeholder="you@clinic.com"
                    className={`${inputClass} pl-11`}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </Field>
            </section>
          )}

          {step === 1 && (
            <section className="bg-white rounded-3xl border border-[#E2E8F0] shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-6 sm:p-8 space-y-5">
              <SectionHeading icon={GraduationCap} title="Professional Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Qualification">
                  <select
                    className={inputClass}
                    value={form.qualification}
                    onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                  >
                    <option value="">Select qualification</option>
                    {QUALIFICATIONS.map((q) => (
                      <option key={q}>{q}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Specialization">
                  <select
                    className={inputClass}
                    value={form.specialization}
                    onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                  >
                    <option value="">Select specialization</option>
                    {SPECIALIZATIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Years of experience">
                  <input
                    type="number"
                    min="0"
                    placeholder="5"
                    className={inputClass}
                    value={form.yearsOfExperience}
                    onChange={(e) => setForm({ ...form, yearsOfExperience: e.target.value })}
                  />
                </Field>
                <Field label="Department">
                  <select
                    className={inputClass}
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  >
                    <option value="">Select department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Hospital / clinic name">
                <div className="relative">
                  <Hospital className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                  <input
                    placeholder="e.g. Sunrise Rehab Center"
                    className={`${inputClass} pl-11`}
                    value={form.hospitalOrClinicName}
                    onChange={(e) => setForm({ ...form, hospitalOrClinicName: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Bio / about">
                <textarea
                  placeholder="A short note patients will see on your profile"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] resize-none transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] focus:bg-white"
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </Field>
            </section>
          )}

          {step === 2 && (
            <section className="bg-white rounded-3xl border border-[#E2E8F0] shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-6 sm:p-8 space-y-6">
              <SectionHeading icon={Brain} title="Rehabilitation Expertise" />
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-[#0F172A] mb-3">
                  <ClipboardList className="w-4 h-4 text-[#64748B]" />
                  Conditions treated
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((c) => (
                    <Pill
                      key={c}
                      active={form.conditionsTreated.includes(c)}
                      onClick={() => toggle("conditionsTreated", c)}
                    >
                      {c}
                    </Pill>
                  ))}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-[#0F172A] mb-3">
                  <Brain className="w-4 h-4 text-[#64748B]" />
                  Therapy areas
                </p>
                <div className="flex flex-wrap gap-2">
                  {THERAPY_AREAS.map((a) => (
                    <Pill
                      key={a}
                      active={form.therapyAreas.includes(a)}
                      onClick={() => toggle("therapyAreas", a)}
                    >
                      {a}
                    </Pill>
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="bg-white rounded-3xl border border-[#E2E8F0] shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-6 sm:p-8 space-y-6">
              <SectionHeading icon={CalendarDays} title="Availability" />
              <div>
                <p className="text-sm font-medium text-[#0F172A] mb-3">Working days</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <Pill
                      key={d}
                      active={form.workingDays.includes(d)}
                      onClick={() => toggle("workingDays", d)}
                    >
                      {d.slice(0, 3)}
                    </Pill>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <Field label="Start time">
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                      <input
                        type="time"
                        className={`${inputClass} pl-11 bg-white`}
                        value={form.workingHours.start}
                        onChange={(e) => setForm({ ...form, workingHours: { ...form.workingHours, start: e.target.value } })}
                      />
                    </div>
                  </Field>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <Field label="End time">
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                      <input
                        type="time"
                        className={`${inputClass} pl-11 bg-white`}
                        value={form.workingHours.end}
                        onChange={(e) => setForm({ ...form, workingHours: { ...form.workingHours, end: e.target.value } })}
                      />
                    </div>
                  </Field>
                </div>
              </div>
            </section>
          )}

          {/* Step navigation */}
          <div className="flex items-center gap-3">
            {!isFirstStep && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2563EB] text-[#2563EB] bg-white px-5 py-3.5 font-medium hover:bg-blue-50 transition-all duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <button
              disabled={submitting}
              type="submit"
              className="flex-1 bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white rounded-xl py-3.5 font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLastStep ? (submitting ? "Registering..." : "Register as Therapist") : "Continue"}
              {!submitting && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.1), rgba(6,182,212,0.1))" }}
      >
        <Icon className="w-5 h-5 text-[#2563EB]" strokeWidth={1.75} />
      </div>
      <h2
        className="text-[#0F172A]"
        style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: "22px" }}
      >
        {title}
      </h2>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[#334155] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200 active:scale-95 ${
        active
          ? "bg-[#2563EB] text-white border-[#2563EB]"
          : "bg-white text-[#334155] border-slate-300 hover:border-[#2563EB] hover:bg-blue-50"
      }`}
    >
      {active && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}