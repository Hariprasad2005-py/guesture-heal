// frontend/src/utils/apiService.js
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api";

const getToken = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("gestureheal-storage") || "{}");
    return stored?.state?.token || null;
  } catch {
    return null;
  }
};

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 204) return null;

    let data;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { message: await response.text() };
    }

    if (!response.ok) {
      // Handle token expiry specifically
      if (response.status === 401) {
        // Clear token and redirect to login
        localStorage.removeItem("gestureheal-storage");
        if (window.location.pathname !== "/login" && window.location.pathname !== "/" && window.location.pathname !== "/patient") {
          window.location.href = "/patient";
        }
      }
      const error = new Error(data.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      const networkError = new Error("Network error - please check your connection");
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
}

// Builds a query string from a params object, skipping undefined/null/"" values.
function toQueryString(params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

// ─── Auth API ────────────────────────────────────────────────────────────────
export const authApi = {
  // Therapist/Admin Registration
  register: (payload) => request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Therapist/Admin Login
  login: (payload) => request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // ─── NEW: Patient Login with Patient ID ──────────────────────────────────
  patientLogin: (payload) => request("/auth/patient-login", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Get current user
  me: () => request("/auth/me"),

  // Logout
  logout: () => request("/auth/logout", { method: "POST" }),
};

// ─── Patient API ─────────────────────────────────────────────────────────────
export const patientApi = {
  // Get all patients (therapist only)
  getAll: () => request("/patients"),

  // Get patient by ID
  getById: (id) => request(`/patients/${id}`),

  // Create patient (therapist only)
  create: (payload) => request("/patients", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Update patient
  update: (id, payload) => request(`/patients/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }),

  // Delete patient (soft delete)
  delete: (id) => request(`/patients/${id}`, { method: "DELETE" }),

  // Get rehab plan
  getPlan: (id) => request(`/patients/${id}/plan`),

  // Regenerate rehab plan
  regeneratePlan: (id) => request(`/patients/${id}/regenerate-plan`, {
    method: "POST"
  }),
};

// ─── Session API ─────────────────────────────────────────────────────────────
export const sessionApi = {
  // Get sessions by patient
  getByPatient: (patientId) => request(`/sessions/patient/${patientId}`),

  // Get session by ID
  getById: (id) => request(`/sessions/${id}`),

  // Start session (therapist)
  start: (payload) => request("/sessions/start", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Complete session (therapist)
  complete: (id, payload) => request(`/sessions/${id}/complete`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }),

  // Save rep data
  saveRep: (id, payload) => request(`/sessions/${id}/rep`, {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Delete session
  delete: (id) => request(`/sessions/${id}`, { method: "DELETE" }),

  // ─── Public Session Endpoints (no auth — patientId only) ────────────────

  // Start public session
  publicStart: (payload) => request("/sessions/public/start", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Update public session
  publicUpdate: (payload) => request("/sessions/public/update", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Finish public session
  publicFinish: (payload) => request("/sessions/public/finish", {
    method: "POST",
    body: JSON.stringify(payload)
  }),

  // Get public session by ID
  publicGetById: (sessionId, patientId) =>
    request(`/sessions/public/${sessionId}?patientId=${encodeURIComponent(patientId)}`),
};

// ─── Report API ──────────────────────────────────────────────────────────────
export const reportApi = {
  // Get all reports for the logged-in therapist, optionally filtered by patient
  getAll: (patientId) =>
    request(`/reports${patientId ? `?patientId=${patientId}` : ""}`),

  // Get reports by patient
  getByPatient: (patientId) => request(`/reports/patient/${patientId}`),

  // Generate report
  generate: (sessionId) => request(`/reports/generate/${sessionId}`, {
    method: "POST"
  }),
  // In the reportApi object, add:
  generatePublicReport: (sessionId, patientId) =>
    request(`/reports/public/generate/${sessionId}?patientId=${encodeURIComponent(patientId)}`, {
      method: "POST"
    }),
  // Update therapist notes
  updateNotes: (id, notes) => request(`/reports/${id}/notes`, {
    method: "PUT",
    body: JSON.stringify({ therapistNotes: notes })
  }),

  // Delete report
  delete: (id) => request(`/reports/${id}`, { method: "DELETE" }),
};

// ─── Dashboard API ──────────────────────────────────────────────────────────
export const dashboardApi = {
  // Get dashboard stats
  getStats: () => request("/dashboard"),

  // Get patient progress
  getPatientProgress: (patientId) => request(`/dashboard/patient/${patientId}/progress`),
};

// ─── Public Patient API ─────────────────────────────────────────────────────
export const patientPublicApi = {
  // Get patient by public ID
  getById: (id) => request(`/patients/public/${id}`),

  // Self-register (no auth required)
  selfRegister: (payload) => request("/patients/self-register", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
};

// ─── Exercise API ───────────────────────────────────────────────────────────
export const exerciseApi = {
  // Get all exercises
  getAll: () => request("/exercises"),

  // Get exercise by ID
  getById: (id) => request(`/exercises/${id}`),

  // Get patient day exercises
  getPatientDayExercises: (patientId, day) =>
    request(`/exercises/for-patient/${patientId}/day/${day}`),
};

// ─── Admin API ───────────────────────────────────────────────────────────────
// Maps 1:1 to backend/src/controllers/adminController.js, mounted at /api/admin.
// All routes require protect + adminOnly on the backend.
export const adminApi = {
  // GET /api/admin/stats
  getStats: () => request("/admin/stats"),

  // GET /api/admin/therapists
  getTherapists: () => request("/admin/therapists"),

  // GET /api/admin/therapists/:id
  getTherapistDetail: (id) => request(`/admin/therapists/${id}`),

  // PUT /api/admin/therapists/:id/status
  updateTherapistStatus: (id, isActive) => request(`/admin/therapists/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ isActive }),
  }),

  // GET /api/admin/patients?search=&therapistId=&isActive=&page=&limit=
  getAllPatients: (params) => request(`/admin/patients${toQueryString(params)}`),

  // GET /api/admin/patients/:id  (accepts Mongo _id or GH- patientId)
  getPatientDetail: (id) => request(`/admin/patients/${id}`),

  // GET /api/admin/reports?patientId=&therapistId=&startDate=&endDate=&page=&limit=
  getAllReports: (params) => request(`/admin/reports${toQueryString(params)}`),

  // GET /api/admin/sessions?patientId=&therapistId=&status=&page=&limit=
  getAllSessions: (params) => request(`/admin/sessions${toQueryString(params)}`),
};