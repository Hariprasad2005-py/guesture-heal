// How many times a patient may play ONE game per day, and which attempt they
// are on. Counted on this device (localStorage) per patient + game + day, so
// the report can say "Attempt 2 of 3 today". Change the number below to change
// the limit for every game.
export const MAX_PLAYS_PER_GAME_PER_DAY = 3;

const dayKey = () => new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
const storageKey = (patientId, gameId) => `gh:plays:${patientId || "guest"}:${gameId}:${dayKey()}`;

function read(patientId, gameId) {
  try {
    const raw = window.localStorage.getItem(storageKey(patientId, gameId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.count === "number") return { count: parsed.count, ids: parsed.ids || [] };
  } catch {
    /* storage blocked: behave as if nothing was played */
  }
  return { count: 0, ids: [] };
}

export function getPlaysToday(patientId, gameId) {
  return read(patientId, gameId).count;
}

// Count a finished session once (the same session id never counts twice).
export function recordPlay(patientId, gameId, sessionId) {
  const cur = read(patientId, gameId);
  const id = sessionId || `anon-${Date.now()}`;
  if (cur.ids.includes(id)) return cur.count;
  const next = { count: cur.count + 1, ids: [...cur.ids, id].slice(-10) };
  try {
    window.localStorage.setItem(storageKey(patientId, gameId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next.count;
}

// The attempt that is being played right now (set when the game opens).
const current = {};

export function beginAttempt(patientId, gameId) {
  const attemptNumber = getPlaysToday(patientId, gameId) + 1;
  current[gameId] = { patientId, attemptNumber, maxAttempts: MAX_PLAYS_PER_GAME_PER_DAY };
  return current[gameId];
}

export function getCurrentAttempt(gameId) {
  return current[gameId] || null;
}

// Fields added to every saved report so repeats are visible in reports.
export function attemptMetrics(gameId) {
  const c = current[gameId];
  if (!c) return {};
  return {
    attemptNumber: c.attemptNumber,
    attemptsAllowedToday: c.maxAttempts,
    isReplay: c.attemptNumber > 1,
  };
}
