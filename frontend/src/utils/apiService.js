// frontend/src/utils/apiService.js
const API_BASE = import.meta.env.VITE_API_URL || "https://gestureheal-backend.onrender.com/api";

// FIX #4: Fixed getToken function
const getToken = () => {
  try {
    // 1. Look for the direct token
    const directToken = localStorage.getItem("token");
    if (directToken) return directToken;

    // 2. Check the common storage key
    const stored = JSON.parse(localStorage.getItem("gestureheal-storage") || "{}");
    const stateToken = stored?.state?.token || stored?.token;
    if (stateToken) return stateToken;

    // 3. Check other common keys (just in case)
    const otherTokens = [
      "adminToken",
      "therapistToken",
      "authToken",
      "access_token"
    ];
    for (let key of otherTokens) {
      const t = localStorage.getItem(key);
      if (t) return t;
    }

    return null;
  } catch {
    return null;
  }
};

const DEFAULT_TIMEOUT_MS = 15000;
const RETRY_BASE_DELAY_MS = 2000;

// A single fetch attempt. Pulled out of request() so the retry wrapper
// below can call it more than once without duplicating the timeout/401/
// error-shaping logic.
async function performRequest(endpoint, options, timeoutMs) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Without a timeout, a backend that hangs (rather than erroring) leaves
  // this fetch pending forever -- callers awaiting request() then never
  // get to their catch/finally, which is what caused saveReport's
  // "Saving..." button to freeze permanently when publicStart hung.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
        // Only treat this as "your therapist/admin session expired" when
        // there actually was a token to begin with. Public (GH-xxxx)
        // patients never have a token, so a 401 for them just means "this
        // particular endpoint needs auth" -- not "log back in" -- and must
        // never hard-redirect them away from their own session/report pages.
        const hadToken = !!token;
        localStorage.removeItem("gestureheal-storage");
        const path = window.location.pathname;
        const publicPrefixes = [
          "/login", "/", "/patient", "/therapist-login", "/therapist-register",
          "/register", "/session-report", "/reports/patient/", "/patient/dashboard/", "/game/",
        ];
        const isPublicPath = publicPrefixes.some(
          (p) => path === p || path.startsWith(p)
        );
        if (hadToken && !isPublicPath) {
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
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      const timeoutError = new Error("Request timed out - please try again");
      timeoutError.isTimeout = true;
      throw timeoutError;
    }
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      const networkError = new Error("Network error - please check your connection");
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
}

// Retry wrapper around performRequest(). Only retries on timeout/network
// errors (never on a real HTTP error response like 400/401/404/500) --
// retrying those wouldn't help and could mask a genuine failure.
//
// options.timeoutMs   -- per-attempt timeout, defaults to 15s.
// options.retry       -- set to false to disable retry for this call.
//                         Non-idempotent POSTs (like publicStart, which
//                         creates a new Session document) opt out of this
//                         because a retry after a false-timeout (server
//                         actually finished, client just gave up first)
//                         would create a duplicate record. Endpoints that
//                         are safe to retry -- either because they're
//                         naturally idempotent (e.g. publicFinish, guarded
//                         server-side by session.status === "completed")
//                         or read-only -- can use the default (retry: true).
async function request(endpoint, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.retry === false ? 0 : 1;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await performRequest(endpoint, options, timeoutMs);
    } catch (error) {
      lastError = error;
      const isRetryable = error.isTimeout || error.isNetworkError;
      if (!isRetryable || attempt === maxRetries) throw error;

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt); // 2s for the one retry
      console.warn(
        `[apiService] ${endpoint} failed (${error.message}) -- retrying in ${delay}ms (attempt ${attempt + 2}/${maxRetries + 1})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
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
    body: JSON.stringify(payload),
    timeoutMs: 45000, // cold-start allowance
  }),
  complete: (id, payload) => request(`/sessions/${id}/complete`, {
    method: "PUT",
    body: JSON.stringify(payload),
    timeoutMs: 45000, // cold-start allowance
  }),
  saveRep: (id, payload) => request(`/sessions/${id}/rep`, {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  delete: (id) => request(`/sessions/${id}`, { method: "DELETE" }),
  publicStart: (payload) => request("/sessions/public/start", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 45000, // cold-start allowance
    // Not retried automatically: this POST creates a new Session document
    // server-side, so retrying after a client-side timeout (the server
    // may have actually finished) risks creating a duplicate in-progress
    // session. useSessionTelemetry.js already has its own retry-before-
    // complete logic for this exact case, gated on whether a real backend
    // session was actually returned -- that's the right layer to retry at.
    retry: false,
  }),
  publicUpdate: (payload) => request("/sessions/public/update", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  publicFinish: (payload) => request("/sessions/public/finish", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 45000, // cold-start allowance
    // Safe to retry: finishPublicSession checks session.status ===
    // "completed" server-side and returns a 400 (not a hang) if a prior
    // attempt already went through, so a retry after a timeout can never
    // double-complete a session -- worst case it gets a clean 400 back.
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

// ─── REPORT API ─────────────────────────────────────────────────────────────
export const reportApi = {
  getAll: (patientId) =>
    request(`/reports${patientId ? `?patientId=${patientId}` : ""}`),
  getByPatient: (patientId) => request(`/reports/patient/${patientId}`),
  getByPublicPatient: (patientId) => request(`/reports/public/${patientId}`),
  getById: (id) => request(`/reports/${id}`),
  generate: (sessionId) => request(`/reports/generate/${sessionId}`, { method: "POST" }),
  updateNotes: (id, notes) => request(`/reports/${id}/notes`, {
    method: "PUT",
    body: JSON.stringify({ therapistNotes: notes })
  }),
  delete: (id) => request(`/reports/${id}`, { method: "DELETE" }),

  // ─── LOCAL STORAGE METHODS (IndexedDB) ──────────────────────────────────
  // These use the sessionStore for offline persistence
  saveLocalReport: async (reportData) => {
    try {
      const { reportDB } = await import('./sessionStore');
      return await reportDB.saveReport(reportData);
    } catch (err) {
      console.warn('Failed to save local report:', err);
      return null;
    }
  },
  getLocalReports: async (options) => {
    try {
      const { reportDB } = await import('./sessionStore');
      return await reportDB.getReports(options || {});
    } catch (err) {
      console.warn('Failed to get local reports:', err);
      return [];
    }
  },
  getLocalReport: async (reportId) => {
    try {
      const { reportDB } = await import('./sessionStore');
      return await reportDB.getReport(reportId);
    } catch (err) {
      console.warn('Failed to get local report:', err);
      return null;
    }
  },
  deleteLocalReport: async (reportId) => {
    try {
      const { reportDB } = await import('./sessionStore');
      return await reportDB.deleteReport(reportId);
    } catch (err) {
      console.warn('Failed to delete local report:', err);
      return null;
    }
  },
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

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
// Fire-and-forget ping used to wake a sleeping Render free-tier instance
// before the user reaches a real save. Deliberately bypasses request()'s
// timeout/retry machinery -- a slow or failed warm-up must never surface
// an error or block anything in the UI. Requires a lightweight, unauthed
// GET /api/health route on the backend; if you don't have one yet, add:
//   router.get("/health", (req, res) => res.sendStatus(200));
export const healthApi = {
  ping: () => {
    fetch(`${API_BASE}/health`, { method: "GET" }).catch(() => {
      // Intentionally swallowed -- this is best-effort warm-up only.
    });
  },
};

// ─── EXPORT ALL ──────────────────────────────────────────────────────────────
export default {
  authApi,
  patientApi,
  sessionApi,
  dashboardApi,
  patientPublicApi,
  reportApi,
  adminApi,
  healthApi,
};