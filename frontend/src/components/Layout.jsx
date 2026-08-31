// frontend/src/components/Layout.jsx
import { useState, useEffect } from "react";
import { useNavigate, NavLink, useLocation } from "react-router-dom";
import { useAppStore } from "../store/appStore";
import { Menu, X, LogOut, Users, Home, Activity, FileText, Gamepad2, User, UserRound, Calendar, Award, ClipboardList } from "lucide-react";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, currentPatient, token, publicPatientId, setCurrentPatient } = useAppStore();

  // currentPatient is persisted straight to localStorage (see appStore.js)
  // with no backend validation on load — a stale/deleted/never-actually-
  // saved patient from a past session renders here forever otherwise,
  // showing a full sidebar (name, condition, patient ID) for a patient
  // that doesn't exist in MongoDB. Verify it against the backend once on
  // mount whenever we're relying on a public (GH-xxxx) id with no token.
  useEffect(() => {
    const idToVerify = currentPatient?.patientId || publicPatientId;
    if (!idToVerify || !idToVerify.startsWith("GH-") || token) return;
    let cancelled = false;
    import("../utils/apiService").then(({ patientPublicApi }) => {
      patientPublicApi.getById(idToVerify).catch((err) => {
        if (cancelled) return;
        console.warn("[Layout] Cached currentPatient failed backend verification, clearing:", err);
        setCurrentPatient(null);
        useAppStore.getState().setPublicPatientId?.(null);
      });
    });
    return () => { cancelled = true; };
  }, [currentPatient?.patientId, publicPatientId, token, setCurrentPatient]);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine user type
const isPatient = (!token && (currentPatient || publicPatientId)) || (token && user?.patientId && !user?.role);  const isTherapist = token && user?.role === "therapist";
  const isAdmin = token && user?.role === "admin";

  // Debug logging
  useEffect(() => {
    console.log("Layout Debug:", { isPatient, isTherapist, isAdmin, token, user, currentPatient, publicPatientId });
  }, [isPatient, isTherapist, isAdmin, token, user, currentPatient, publicPatientId]);

  const handleLogout = () => {
    logout();
    if (isPatient) {
      navigate("/patient");
    } else {
      navigate("/login");
    }
  };

  // ─── Patient Sidebar Items ──────────────────────────────────────────────
  const patientNavItems = [
    { label: "Dashboard", to: `/patient/dashboard/${currentPatient?.patientId || publicPatientId || ""}`, icon: Home },
    { label: "My Games", to: "/games", icon: Gamepad2 },
    { label: "My Reports", to: `/reports/patient/${currentPatient?.patientId || publicPatientId || user?.patientId || ""}`, icon: FileText },
  ];

  // ─── Therapist Sidebar Items ─────────────────────────────────────────────
  const therapistNavItems = [
    { label: "Home", to: "/", icon: Home },
    { label: "Dashboard", to: "/dashboard", icon: Activity },
    { label: "Patients", to: "/patients", icon: Users },
    { label: "Reports", to: "/reports", icon: FileText },
  ];

  // ─── Admin Sidebar Items ────────────────────────────────────────────────
  const adminNavItems = [
    { label: "Dashboard", to: "/admin", icon: Activity },
    { label: "Therapists", to: "/admin/therapists", icon: Users },
    { label: "Patients", to: "/admin/patients", icon: UserRound },
    { label: "Reports", to: "/admin/reports", icon: FileText },
  ];

  // Select the right nav items
  let navItems = therapistNavItems;
  if (isPatient) navItems = patientNavItems;
  if (isAdmin) navItems = adminNavItems;

  // ─── Patient Info for Sidebar ───────────────────────────────────────────
  const renderPatientInfo = () => {
    const patient = currentPatient;
    if (!isPatient || !patient) return null;
    
    return (
      <div className="mb-6 p-4 bg-teal-50 rounded-xl border border-teal-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-lg">
            {patient.name?.charAt(0).toUpperCase() || "P"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 truncate">{patient.name || "Patient"}</p>
            <p className="text-xs text-teal-600 font-mono">{patient.patientId || publicPatientId}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/70 rounded-lg p-2 text-center col-span-2">
            <span className="block text-slate-500">Condition</span>
            <span className="block font-medium text-slate-800 truncate">{patient.condition || "—"}</span>
          </div>
          <div className="bg-white/70 rounded-lg p-2 text-center">
            <span className="block text-slate-500">Day</span>
            <span className="font-medium text-slate-800">{patient.currentDay || 1}/7</span>
          </div>
          <div className="bg-white/70 rounded-lg p-2 text-center">
            <span className="block text-slate-500">Sessions</span>
            <span className="font-medium text-slate-800">{patient.totalSessions || 0}</span>
          </div>
          <div className="bg-white/70 rounded-lg p-2 text-center">
            <span className="block text-slate-500">Accuracy</span>
            <span className="font-medium text-slate-800">{patient.averageAccuracy || 0}%</span>
          </div>
        </div>
      </div>
    );
  };

  // ─── Therapist/Admin User Info ──────────────────────────────────────────
  const renderUserInfo = () => {
    if (!user || isPatient) return null;
    
    return (
      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
        <p className="text-xs text-slate-500">Logged in as</p>
        <p className="text-sm font-medium text-slate-900">{user.name}</p>
        <p className="text-xs text-slate-500 capitalize">{user.role}</p>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* ─── SIDEBAR ────────────────────────────────────────────────────── */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 shadow-sm transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } z-40 md:z-0 overflow-y-auto`}
      >
        <div className="p-6 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold">
              G
            </div>
            <h1 className="font-bold text-lg text-slate-900">GestureHeal</h1>
          </div>

          {/* ─── Patient Info (if patient) ────────────────────────────── */}
          {renderPatientInfo()}

          {/* ─── Navigation ────────────────────────────────────────────── */}
          <nav className="space-y-1 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-teal-100 text-teal-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* ─── Footer ────────────────────────────────────────────────── */}
          <div className="pt-6 border-t border-slate-200">
            {renderUserInfo()}

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
              {isPatient ? "Sign Out" : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE OVERLAY ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── MAIN CONTENT ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="font-bold text-slate-900">GestureHeal</h1>
          <div className="w-10" />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}