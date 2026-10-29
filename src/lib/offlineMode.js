import { useEffect, useState } from 'react';

/* Offline mode is automatic. The device decides it is offline from the network
   itself; nothing here waits for an officer to press a button. */
const PRIME_KEY = 'pathfinder-offline-prime-v1';
const PRIME_INTERVAL = 12 * 3600000;

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function useOfflineMode() {
  const [offline, setOffline] = useState(isOffline);
  useEffect(() => {
    const sync = () => setOffline(isOffline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return offline;
}

async function saveCurrentAssets() {
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active || registration.waiting;
  if (!worker) return 0;
  const origin = window.location.origin;
  const urls = [
    origin + '/',
    origin + '/index.html',
    ...performance.getEntriesByType('resource').map(entry => entry.name),
    ...[...document.querySelectorAll('script[src],link[href]')].map(node => node.src || node.href),
  ].filter(url => url && url.startsWith(origin) && !url.includes('/api/') && !url.includes('/functions/'));
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(0); }, 20000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.saved || 0); };
    worker.postMessage({ type: 'SAVE_ASSETS', urls }, [channel.port2]);
  });
}

/* Quietly keeps the pages this device has opened available for the next time the
   connection drops. Runs on its own, at most twice a day. */
export async function primeOfflinePages({ force = false } = {}) {
  if (!('serviceWorker' in navigator) || isOffline()) return false;
  try {
    const last = Number(localStorage.getItem(PRIME_KEY) || 0);
    if (!force && Date.now() - last < PRIME_INTERVAL) return false;
    await navigator.storage?.persist?.();
    await saveCurrentAssets();
    localStorage.setItem(PRIME_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}