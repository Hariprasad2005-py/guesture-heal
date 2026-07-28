// frontend/src/utils/apiService.js
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api";

// FIX #4: Fixed getToken function
const getToken = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("gestureheal-storage") || "{}");
    // Check both state and root level for token
    return stored?.state?.token || stored?.token || null;
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
      if (response.status === 401) {
        localStorage.removeItem("gestureheal-storage");
        const path = window.location.pathname;
        const publicPaths = ["/login", "/", "/patient", "/therapist-login", "/therapist-register", "/register"];
        if (!publicPaths.includes(path)) {
          if (path.startsWith("/patient")) {
            window.location.href = "/patient";
          } else if (path.startsWith("/admin")) {
            window.location.href = "/login";
          } else {
            window.location.href = "/therapist-login";
          }
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

// ─── AUTH API ────────────────────────────────────────────────────────────────
export const authApi = {
  register: (payload) => request("/auth/register", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  login: (payload) => request("/auth/login", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  // inside authApi:
therapistRegister: (payload) => request("/auth/therapist-register", {
  method: "POST",
  body: JSON.stringify(payload),
}),

therapistLogin: (payload) => request("/auth/therapist-login", {
  method: "POST",
  body: JSON.stringify(payload),
}),
  patientLogin: (payload) => request("/auth/patient-login", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
};

// ─── PATIENT API ─────────────────────────────────────────────────────────────
export const patientApi = {
  getAll: () => request("/patients"),
  getById: (id) => request(`/patients/${id}`),
  create: (payload) => request("/patients", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  update: (id, payload) => request(`/patients/${id}`, { 
    method: "PUT", 
    body: JSON.stringify(payload) 
  }),
  delete: (id) => request(`/patients/${id}`, { method: "DELETE" }),
  getPlan: (id) => request(`/patients/${id}/plan`),
  regeneratePlan: (id) => request(`/patients/${id}/regenerate-plan`, { 
    method: "POST" 
  }),
};

// ─── SESSION API ─────────────────────────────────────────────────────────────
export const sessionApi = {
  getByPatient: (patientId) => request(`/sessions/patient/${patientId}`),
  getById: (id) => request(`/sessions/${id}`),
  start: (payload) => request("/sessions/start", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  complete: (id, payload) => request(`/sessions/${id}/complete`, { 
    method: "PUT", 
    body: JSON.stringify(payload) 
  }),
  saveRep: (id, payload) => request(`/sessions/${id}/rep`, { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  delete: (id) => request(`/sessions/${id}`, { method: "DELETE" }),
  publicStart: (payload) => request("/sessions/public/start", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  publicUpdate: (payload) => request("/sessions/public/update", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  publicFinish: (payload) => request("/sessions/public/finish", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
  publicGetById: (sessionId, patientId) => 
    request(`/sessions/public/${sessionId}?patientId=${encodeURIComponent(patientId)}`),
};

// ─── DASHBOARD API ──────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => request("/dashboard"),
  getPatientProgress: (patientId) => request(`/dashboard/patient/${patientId}/progress`),
};

// ─── PUBLIC PATIENT API ─────────────────────────────────────────────────────
export const patientPublicApi = {
  getById: (id) => request(`/patients/public/${id}`),
  selfRegister: (payload) => request("/patients/self-register", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  }),
};
export const reportApi = {
  getAll: (patientId) => 
    request(`/reports${patientId ? `?patientId=${patientId}` : ""}`),
  getByPatient: (patientId) => request(`/reports/patient/${patientId}`),
  getByPublicPatient: (patientId) => request(`/reports/public/${patientId}`),  // ← new
  getById: (id) => request(`/reports/${id}`),
  generate: (sessionId) => request(`/reports/generate/${sessionId}`, { method: "POST" }),
  updateNotes: (id, notes) => request(`/reports/${id}/notes`, { method: "PUT", body: JSON.stringify({ therapistNotes: notes }) }),
  delete: (id) => request(`/reports/${id}`, { method: "DELETE" }),
};
// ─── EXERCISE API ────────────────────────────────────────────────────────────
// Builds a query string from a params object, skipping undefined/null/"" values.
function toQueryString(params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

// ─── ADMIN API ───────────────────────────────────────────────────────────────
export const adminApi = {
  getStats: () => request("/admin/stats"),
  getTherapists: () => request("/admin/therapists"),
  getTherapistDetail: (id) => request(`/admin/therapists/${id}`),
  updateTherapistStatus: (id, isActive) => request(`/admin/therapists/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ isActive }),
  }),
  getAllPatients: (params) => request(`/admin/patients${toQueryString(params)}`),
  getPatientDetail: (id) => request(`/admin/patients/${id}`),
  assignTherapist: (patientId, therapistId) => request(`/admin/patients/${patientId}/assign-therapist`, {
    method: "PUT",
    body: JSON.stringify({ therapistId }),
  }),
  getAllReports: (params) => request(`/admin/reports${toQueryString(params)}`),
  getAllSessions: (params) => request(`/admin/sessions${toQueryString(params)}`),
  getEngagementTrends: (days) => request(`/admin/analytics/engagement${toQueryString({ days })}`),
  getDauVsSessions: (days) => request(`/admin/analytics/dau-sessions${toQueryString({ days })}`),
  getCompletionRates: () => request("/admin/analytics/completion-rates"),
  getAtRiskPatients: (limit) => request(`/admin/analytics/at-risk${toQueryString({ limit })}`),
  getSessionHeatmap: (days) => request(`/admin/analytics/heatmap${toQueryString({ days })}`),
};