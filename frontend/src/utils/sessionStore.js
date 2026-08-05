// frontend/src/utils/sessionStore.js

const DB_NAME = 'GestureHealDB';
const SESSION_STORE = 'sessions';
const REPORT_STORE = 'reports';
// Bumped from 2 -> 3: browsers that already opened this DB via ReportDB
// first ended up with ONLY the 'reports' store created (see fix below),
// permanently missing 'sessions'. Bumping the version forces
// onupgradeneeded to run again so the missing store gets created.
const DB_VERSION = 3;

class SessionDB {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create sessions store
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          const store = db.createObjectStore(SESSION_STORE, { keyPath: 'sessionId' });
          store.createIndex('patientId', 'patientId', { unique: false });
          store.createIndex('gameId', 'gameId', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('patientId_gameId', ['patientId', 'gameId'], { unique: false });
        }
        
        // Create reports store
        if (!db.objectStoreNames.contains(REPORT_STORE)) {
          const store = db.createObjectStore(REPORT_STORE, { keyPath: 'reportId' });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('patientId', 'patientId', { unique: false });
          store.createIndex('gameId', 'gameId', { unique: false });
          store.createIndex('generatedAt', 'generatedAt', { unique: false });
          store.createIndex('patientId_gameId', ['patientId', 'gameId'], { unique: false });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.initialized = true;
        resolve();
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // ─── SESSION METHODS ──────────────────────────────────────────────────────

  async saveSession(sessionData) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([SESSION_STORE], 'readwrite');
      const store = transaction.objectStore(SESSION_STORE);
      const request = store.put({
        ...sessionData,
        savedAt: new Date().toISOString(),
      });
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSession(sessionId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([SESSION_STORE], 'readonly');
      const store = transaction.objectStore(SESSION_STORE);
      const request = store.get(sessionId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSessions(options = {}) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([SESSION_STORE], 'readonly');
      const store = transaction.objectStore(SESSION_STORE);
      let request;
      
      if (options.patientId && options.gameId) {
        const index = store.index('patientId_gameId');
        request = index.getAll([options.patientId, options.gameId]);
      } else if (options.patientId) {
        const index = store.index('patientId');
        request = index.getAll(options.patientId);
      } else if (options.gameId) {
        const index = store.index('gameId');
        request = index.getAll(options.gameId);
      } else {
        request = store.getAll();
      }
      
      request.onsuccess = () => {
        let results = request.result || [];
        if (options.fromDate) {
          const fromDate = new Date(options.fromDate);
          results = results.filter(s => new Date(s.date) >= fromDate);
        }
        if (options.toDate) {
          const toDate = new Date(options.toDate);
          results = results.filter(s => new Date(s.date) <= toDate);
        }
        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(sessionId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([SESSION_STORE], 'readwrite');
      const store = transaction.objectStore(SESSION_STORE);
      const request = store.delete(sessionId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSessionsByPatient(patientId) {
    return this.getAllSessions({ patientId });
  }

  async getSessionsByGame(gameId) {
    return this.getAllSessions({ gameId });
  }

  async getSessionsByPatientAndGame(patientId, gameId) {
    return this.getAllSessions({ patientId, gameId });
  }

  async clearAllSessions() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([SESSION_STORE], 'readwrite');
      const store = transaction.objectStore(SESSION_STORE);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSessionStats(patientId) {
    const sessions = await this.getAllSessions({ patientId });
    const games = {};
    let totalSessions = sessions.length;
    let totalScore = 0;
    let totalAccuracy = 0;
    let totalRom = 0;
    
    sessions.forEach(s => {
      const gameId = s.gameId || 'unknown';
      if (!games[gameId]) {
        games[gameId] = { 
          count: 0, 
          totalScore: 0, 
          totalAccuracy: 0,
          totalRom: 0,
        };
      }
      games[gameId].count++;
      games[gameId].totalScore += s.score || 0;
      games[gameId].totalAccuracy += s.accuracyPercent || 0;
      games[gameId].totalRom += s.romData?.averageRomDegrees || 0;
      totalScore += s.score || 0;
      totalAccuracy += s.accuracyPercent || 0;
      totalRom += s.romData?.averageRomDegrees || 0;
    });
    
    Object.keys(games).forEach(key => {
      games[key].avgScore = Math.round(games[key].totalScore / games[key].count);
      games[key].avgAccuracy = Math.round(games[key].totalAccuracy / games[key].count);
      games[key].avgRom = Math.round(games[key].totalRom / games[key].count);
    });
    
    return {
      totalSessions,
      totalScore,
      avgAccuracy: totalSessions ? Math.round(totalAccuracy / totalSessions) : 0,
      avgRom: totalSessions ? Math.round(totalRom / totalSessions) : 0,
      byGame: games,
    };
  }
}

// ─── REPORT STORE ──────────────────────────────────────────────────────────

class ReportDB {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // NOTE: this must create BOTH stores, not just 'reports'. Whichever
        // of SessionDB / ReportDB happens to call indexedDB.open() first is
        // the one whose onupgradeneeded actually runs -- it only fires once
        // per DB name+version, ever. If this handler only created its own
        // store, the other one would silently never exist in that browser,
        // causing every future transaction on it to throw NotFoundError.
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          const sessionStore = db.createObjectStore(SESSION_STORE, { keyPath: 'sessionId' });
          sessionStore.createIndex('patientId', 'patientId', { unique: false });
          sessionStore.createIndex('gameId', 'gameId', { unique: false });
          sessionStore.createIndex('date', 'date', { unique: false });
          sessionStore.createIndex('patientId_gameId', ['patientId', 'gameId'], { unique: false });
        }
        if (!db.objectStoreNames.contains(REPORT_STORE)) {
          const store = db.createObjectStore(REPORT_STORE, { keyPath: 'reportId' });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('patientId', 'patientId', { unique: false });
          store.createIndex('gameId', 'gameId', { unique: false });
          store.createIndex('generatedAt', 'generatedAt', { unique: false });
          store.createIndex('patientId_gameId', ['patientId', 'gameId'], { unique: false });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.initialized = true;
        resolve();
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async saveReport(reportData) {
    await this.init();
    const report = {
      reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      ...reportData,
      generatedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
    };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([REPORT_STORE], 'readwrite');
      const store = transaction.objectStore(REPORT_STORE);
      const request = store.put(report);
      
      request.onsuccess = () => resolve(report);
      request.onerror = () => reject(request.error);
    });
  }

  async getReport(reportId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([REPORT_STORE], 'readonly');
      const store = transaction.objectStore(REPORT_STORE);
      const request = store.get(reportId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getReports(options = {}) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([REPORT_STORE], 'readonly');
      const store = transaction.objectStore(REPORT_STORE);
      let request;
      
      if (options.patientId && options.gameId) {
        const index = store.index('patientId_gameId');
        request = index.getAll([options.patientId, options.gameId]);
      } else if (options.patientId) {
        const index = store.index('patientId');
        request = index.getAll(options.patientId);
      } else if (options.gameId) {
        const index = store.index('gameId');
        request = index.getAll(options.gameId);
      } else {
        request = store.getAll();
      }
      
      request.onsuccess = () => {
        let results = request.result || [];
        if (options.fromDate) {
          const fromDate = new Date(options.fromDate);
          results = results.filter(r => new Date(r.generatedAt) >= fromDate);
        }
        if (options.toDate) {
          const toDate = new Date(options.toDate);
          results = results.filter(r => new Date(r.generatedAt) <= toDate);
        }
        results.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getReportsByPatient(patientId) {
    return this.getReports({ patientId });
  }

  async getReportsByGame(gameId) {
    return this.getReports({ gameId });
  }

  async getReportsByPatientAndGame(patientId, gameId) {
    return this.getReports({ patientId, gameId });
  }

  async deleteReport(reportId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([REPORT_STORE], 'readwrite');
      const store = transaction.objectStore(REPORT_STORE);
      const request = store.delete(reportId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllReports() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([REPORT_STORE], 'readwrite');
      const store = transaction.objectStore(REPORT_STORE);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getReportStats(patientId) {
    const reports = await this.getReports({ patientId });
    const games = {};
    let totalReports = reports.length;
    let totalScore = 0;
    let totalAccuracy = 0;
    let totalRom = 0;
    
    reports.forEach(r => {
      const gameId = r.gameId || 'unknown';
      if (!games[gameId]) {
        games[gameId] = { 
          count: 0, 
          totalScore: 0, 
          totalAccuracy: 0,
          totalRom: 0,
        };
      }
      games[gameId].count++;
      games[gameId].totalScore += r.score || 0;
      games[gameId].totalAccuracy += r.accuracyPercent || 0;
      games[gameId].totalRom += r.romData?.averageRomDegrees || 0;
      totalScore += r.score || 0;
      totalAccuracy += r.accuracyPercent || 0;
      totalRom += r.romData?.averageRomDegrees || 0;
    });
    
    Object.keys(games).forEach(key => {
      games[key].avgScore = Math.round(games[key].totalScore / games[key].count);
      games[key].avgAccuracy = Math.round(games[key].totalAccuracy / games[key].count);
      games[key].avgRom = Math.round(games[key].totalRom / games[key].count);
    });
    
    return {
      totalReports,
      totalScore,
      avgAccuracy: totalReports ? Math.round(totalAccuracy / totalReports) : 0,
      avgRom: totalReports ? Math.round(totalRom / totalReports) : 0,
      byGame: games,
    };
  }
}

// ─── EXPORT SINGLETON INSTANCES ────────────────────────────────────────────

export const sessionDB = new SessionDB();
export const reportDB = new ReportDB();

// ─── CONVENIENCE FUNCTIONS ─────────────────────────────────────────────────

export async function saveSessionAndReport(sessionData, reportData) {
  const sessionId = sessionData.sessionId || `session_${Date.now()}`;
  const session = { ...sessionData, sessionId };
  
  await sessionDB.saveSession(session);
  
  const report = {
    sessionId,
    patientId: sessionData.patientId,
    gameId: sessionData.gameId,
    ...reportData,
  };
  
  return await reportDB.saveReport(report);
}

export async function getPatientSummary(patientId) {
  const [sessions, reports] = await Promise.all([
    sessionDB.getAllSessions({ patientId }),
    reportDB.getReports({ patientId }),
  ]);
  
  return {
    sessions,
    reports,
    sessionStats: await sessionDB.getSessionStats(patientId),
    reportStats: await reportDB.getReportStats(patientId),
  };
}

export default {
  sessionDB,
  reportDB,
  saveSessionAndReport,
  getPatientSummary,
};