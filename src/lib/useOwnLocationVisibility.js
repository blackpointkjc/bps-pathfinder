import { useEffect, useRef, useState } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';

export const HIERS_PRIVACY_USER_ID = '6a72bbee2842d6338cbae513';
const key = 'bps:hiers-live-location-hidden';
export function announceOwnLocationVisibility(userId, hidden, email = '') {
  if (userId !== HIERS_PRIVACY_USER_ID || typeof hidden !== 'boolean') return;
  try { localStorage.setItem(key, JSON.stringify(hidden)); } catch {}
  window.dispatchEvent(new CustomEvent('bps-live-location-visibility-changed', { detail: { user_id: userId, hidden, email } }));
}
export function useOwnLocationHidden(userId) {
  // Until confirmed visible, do not flash Hiers's device marker during startup.
  const [hidden, setHidden] = useState(userId === HIERS_PRIVACY_USER_ID);
  const version = useRef(0);
  useEffect(() => {
    if (userId !== HIERS_PRIVACY_USER_ID) { setHidden(false); return; }
    let active = true;
    let email = '';
    const apply = value => { ++version.current; if (active) setHidden(value); };
    const refresh = async () => {
      const requestVersion = ++version.current;
      clearBase44ReadCacheMatching('function:manageLiveLocationPrivacy:');
      try {
        const { data } = await base44.functions.invoke('manageLiveLocationPrivacy', { action: 'get' });
        if (active && requestVersion === version.current && data?.success) {
          email = String(data.email || '').toLowerCase();
          setHidden(data.hidden === true);
        }
      } catch { /* Keep the last confirmed visibility; never reveal a hidden marker on an error. */ }
    };
    const changed = event => {
      if (event?.detail?.user_id !== userId || typeof event.detail.hidden !== 'boolean') return;
      if (event.detail.email) email = String(event.detail.email).toLowerCase();
      apply(event.detail.hidden);
    };
    const stored = event => {
      if (event.key !== key) return;
      try { const value = JSON.parse(event.newValue); if (typeof value === 'boolean') apply(value); } catch {}
    };
    const unsubscribe = subscribeOfficerLocationChanges(event => {
      const row = event?.data || event?.record;
      if (!row || typeof row.live_location_hidden !== 'boolean') return;
      if ((email && String(row.officer_email || '').toLowerCase() === email)
          || row.live_location_privacy_user_id === userId) apply(row.live_location_hidden);
    });
    refresh();
    window.addEventListener('bps-live-location-visibility-changed', changed);
    window.addEventListener('storage', stored);
    window.addEventListener('focus', refresh);
    return () => {
      active = false; ++version.current; unsubscribe?.();
      window.removeEventListener('bps-live-location-visibility-changed', changed);
      window.removeEventListener('storage', stored);
      window.removeEventListener('focus', refresh);
    };
  }, [userId]);
  return userId === HIERS_PRIVACY_USER_ID && hidden;
}

