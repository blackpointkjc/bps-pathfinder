// Background-friendly timer used by Pathfinder's web location service.
// Browser window timers are aggressively throttled when a Chromium window/tab is
// minimized. A dedicated bundled Web Worker is less dependent on the page timer
// budget and keeps emitting one-minute wake signals for as long as the document
// process is alive.
//
// This improves minimized-window tracking, but browsers can still freeze an entire
// web page/process under memory pressure, OS sleep, or aggressive power-saving.

let worker = null;
let callback = null;

function supported() {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export function startBackgroundLocationScheduler(onTick, intervalMs = 60000) {
  callback = typeof onTick === 'function' ? onTick : null;
  if (!supported()) return () => {};

  if (!worker) {
    worker = new Worker(new URL('./backgroundLocationWorker.js', import.meta.url), {
      type: 'module',
      name: 'bps-location-watchdog',
    });
    worker.onmessage = event => {
      if (event?.data?.type === 'tick') {
        try { callback?.(event.data); } catch (_) {}
      }
    };
    worker.onerror = () => {
      // The normal geolocation watch and window lifecycle events remain active if
      // a browser or CSP blocks blob-backed workers.
    };
  }

  worker.postMessage({ type: 'start', intervalMs });

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try { worker?.postMessage({ type: 'stop' }); } catch (_) {}
    callback = null;
  };
}

export function nudgeBackgroundLocationScheduler() {
  try { worker?.postMessage({ type: 'ping' }); } catch (_) {}
}
