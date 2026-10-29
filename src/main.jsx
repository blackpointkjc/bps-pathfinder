import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/responsive.css'
import '@/field-readability.css'
import { installRequiredPrintFooter } from '@/utils/requiredPrintFooter'
import { installGlobalRuntimeIssueCapture } from '@/utils/appDiagnostics'

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

// Keep the offline app shell available without waiting for someone to press the
// offline button: register the worker after load and let it cache what is fetched.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pathfinder-sw.js', { scope: '/' }).catch(error => {
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