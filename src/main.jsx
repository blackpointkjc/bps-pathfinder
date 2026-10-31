import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/responsive.css'
import '@/field-readability.css'
import { installRequiredPrintFooter } from '@/utils/requiredPrintFooter'
import { installGlobalRuntimeIssueCapture } from '@/utils/appDiagnostics'
import { primeOfflinePages } from '@/lib/offlineMode'
import { installDailyCacheRotation } from '@/lib/dailyCacheRotation'

// "ResizeObserver loop completed with undelivered notifications." is a benign
// browser notification from libraries (recharts, Leaflet, Radix) whose resize
// callback lands a frame late. It carries no actionable content and every real
// error still reports normally, so keep it out of the error overlay.
const RESIZE_OBSERVER_LOOP_ERRORS = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]);
window.addEventListener('error', event => {
  if (RESIZE_OBSERVER_LOOP_ERRORS.has(event?.message)) {
    event.stopImmediatePropagation();
    event.preventDefault?.();
  }
});

installRequiredPrintFooter()
installGlobalRuntimeIssueCapture()
installDailyCacheRotation()

// Offline mode is automatic: the worker registers on its own, saves the pages
// this device has opened, and takes over as soon as the network drops.
const isBuilderPreview = /^(?:preview-sandbox--|preview--)/i.test(window.location.hostname)
  || window.location.hostname.endsWith('.base44.app') && window.location.hostname.startsWith('preview-');
// Preview serves live Vite/HMR module URLs. An offline service worker must not
// cache these: a stale transformed module mixed with a newer dependency can
// cause "Failed to fetch dynamically imported module" in Admin Center.
if (isBuilderPreview && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations=>Promise.all(registrations
      .filter(reg=>reg.active?.scriptURL?.includes('/pathfinder-sw.js'))
      .map(reg=>reg.unregister()))).catch(()=>{});
}
if (!isBuilderPreview && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/pathfinder-sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        // Saving offline assets can consume bandwidth and CPU while officers
        // are opening the live map. Prime quietly after the first usable paint.
        const primeWhenIdle = () => {
          if ('requestIdleCallback' in window) window.requestIdleCallback(() => primeOfflinePages(), { timeout: 15000 });
          else window.setTimeout(() => primeOfflinePages(), 8000);
        };
        primeWhenIdle();
        window.addEventListener('online', primeWhenIdle);
      })
      .catch(error => {
        console.warn('[Pathfinder] Offline worker registration skipped:', error?.message || error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}