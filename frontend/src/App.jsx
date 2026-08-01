import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "./store/appStore";
import Layout from "./components/Layout";
import Toast from "./components/ui/Toast";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import PatientsPage from "./pages/PatientsPage";
import PatientDetailPage from "./pages/PatientDetailPage";
import IntakePage from "./pages/IntakePage";
import RehabPage from "./pages/RehabPage";
import ReportsPage from "./pages/ReportsPage";
import SessionReportPage from "./pages/SessionReportPage";
import PatientPortalPage from "./pages/PatientPortalPage";
import PatientRegistrationPage from "./pages/PatientRegistrationPage";
import PatientPublicDashboard from "./pages/PatientPublicDashboard";
import GameEngine from './pages/GameEngine';
import GameSelectPage from './pages/GameSelectPage';
// Dev-only QA test page (lazy-loaded to avoid bundling in production)
let PatientDashboardTest = null;
if (import.meta.env.DEV) {
  PatientDashboardTest = React.lazy(() => import('./pages/PatientDashboardTest'));
}
import AdminPage from "./pages/AdminPage";
import TherapistRegister from "./pages/TherapistRegister";
import TherapistLogin from "./pages/TherapistLogin";

function ProtectedRoute({ children }) {
  const { token, user } = useAppStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { token, user } = useAppStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function WithLayout({ children }) {
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toast />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Patient Routes */}
        <Route path="/patient" element={<PatientPortalPage />} />
        <Route path="/patient/register" element={<PatientRegistrationPage />} />
        <Route path="/patient/dashboard/:id" element={<WithLayout><PatientPublicDashboard /></WithLayout>} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><WithLayout><DashboardPage /></WithLayout></ProtectedRoute>} />
        <Route path="/patients" element={<ProtectedRoute><WithLayout><PatientsPage /></WithLayout></ProtectedRoute>} />
        <Route path="/patients/:id" element={<ProtectedRoute><WithLayout><PatientDetailPage /></WithLayout></ProtectedRoute>} />
        <Route path="/intake" element={<ProtectedRoute><WithLayout><IntakePage /></WithLayout></ProtectedRoute>} />
        <Route path="/rehab/:sessionId" element={<ProtectedRoute><WithLayout><RehabPage /></WithLayout></ProtectedRoute>} />
        <Route path="/rehab" element={<ProtectedRoute><WithLayout><RehabPage /></WithLayout></ProtectedRoute>} />
        <Route path="/admin/*" element={<AdminRoute><WithLayout><AdminPage /></WithLayout></AdminRoute>} />
        <Route path="/therapist-register" element={<TherapistRegister />} />
        <Route path="/therapist-login" element={<TherapistLogin />} />

        {/* Public Routes with Layout */}
        <Route path="/games" element={<WithLayout><GameSelectPage /></WithLayout>} />
        <Route path="/game/:gameId" element={<GameEngine />} />
        {/* FIX: this route was missing entirely. Every game's onSessionEnd
            navigates to /session-report — with no route defined, the
            catch-all below sent every completed session straight to "/",
            silently dropping the session summary. Deliberately NOT wrapped
            in ProtectedRoute: public (GH-xxxx) patients with no token must
            be able to land here too. */}
        <Route path="/session-report" element={<WithLayout><SessionReportPage /></WithLayout>} />
        {import.meta.env.DEV && PatientDashboardTest && (
          <Route path="/qa-tests" element={<WithLayout><Suspense fallback={null}><PatientDashboardTest /></Suspense></WithLayout>} />
        )}

        <Route path="/reports/patient/:patientId" element={<ProtectedRoute><WithLayout><ReportsPage /></WithLayout></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><WithLayout><ReportsPage /></WithLayout></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}