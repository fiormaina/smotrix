const DEBUG_KEY = 'movieTrackerDebug';

export function isDebugEnabled() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function log(...args) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[movie-tracker]', ...args);
}

export function warn(...args) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn('[movie-tracker]', ...args);
}