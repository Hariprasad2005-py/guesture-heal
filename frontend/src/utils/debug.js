// Debug logging that is OFF by default (per-frame console.log calls slow the
// page and flood the console). To turn it on while debugging, run once in the
// browser console:   localStorage.setItem('gh_debug','1')   then reload.
// Turn off again:    localStorage.removeItem('gh_debug')
let enabled = false;
try {
  enabled = typeof localStorage !== 'undefined' && localStorage.getItem('gh_debug') === '1';
} catch (e) { /* storage blocked: stay off */ }

export const dlog = (...args) => { if (enabled) console.log(...args); };
