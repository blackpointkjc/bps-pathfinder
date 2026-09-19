// Screen Wake Lock keeper for signed-in operational sessions.
// A sleeping device suspends JavaScript timers, the GPS watch, and alert audio,
// which is the main reason live tracking "goes stale" on in-vehicle laptops and
// phones. The Screen Wake Lock API keeps the display awake while Pathfinder is
// the active screen; the browser releases it while the tab is hidden, so it is
// re-acquired automatically whenever the tab becomes visible again.

let lock = null;
let wanted = false;
let listenersInstalled = false;

const dispatchChange = () => {
  window.dispatchEvent(new CustomEvent('bps-wake-lock-change', {
    detail: { active: Boolean(lock) && lock.released !== true },
  }));
};

async function acquire() {
  if (!wanted || lock || !('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    const mine = lock;
    mine.addEventListener?.('release', () => {
      if (lock === mine) lock = null;
      dispatchChange();
    });
    dispatchChange();
  } catch {
    lock = null;
  }
}

export function requestOperationalWakeLock() {
  if (typeof window === 'undefined' || !('wakeLock' in navigator)) return;
  wanted = true;
  if (!listenersInstalled) {
    listenersInstalled = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') acquire();
    });
  }
  if (document.visibilityState === 'visible') acquire();
}

export function releaseOperationalWakeLock() {
  wanted = false;
  try { lock?.release?.(); } catch { /* already released */ }
  lock = null;
  dispatchChange();
}

export function isWakeLockActive() {
  return Boolean(lock) && lock.released !== true;
}