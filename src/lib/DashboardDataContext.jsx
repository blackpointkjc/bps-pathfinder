/**
 * Centralized data provider for the dashboard.
 * All components pull from here instead of making their own API calls.
 * Keeps the persisted DispatchCall queue synchronized through realtime events,
 * a background watchdog fallback, and explicit wake/recovery refreshes.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getOfficerLocationSnapshot } from '@/lib/officerLocationHub';
import { cadCallFeedIsStale, refreshCadIngestionIfStale } from '@/lib/cadCallFeed';
import { loadActiveDispatchCallRows } from '@/lib/activeDispatchCalls';
import { applyDispatchCallEvent, subscribeDispatchCallChanges } from '@/lib/dispatchCallRealtime';


const DashboardDataContext = createContext(null);
const POLL_INTERVAL_MS = 60_000;       // Realtime subscriptions handle most updates; this is only a fallback
const RATE_LIMIT_BACKOFF_MS = 15_000;   // Brief local pause only; never make CAD appear dead for minutes after one 429
const MIN_REFRESH_MS = 30_000;          // Full-list reads are fallback only; realtime events update the queue directly
const USER_REFRESH_MS = 60_000;         // Unit roster changes slower than calls
const ACTIVE_CALL_CACHE_KEY = 'bps-cad-active-calls-v2';
// Keep the last good queue through a long minimized/idle period. Individual calls
// are still filtered to the one-hour operational window before they are rendered.
const ACTIVE_CALL_CACHE_MAX_AGE_MS = 65 * 60_000;

function readCachedActiveCalls() {
    try {
        const cached = JSON.parse(window.localStorage.getItem(ACTIVE_CALL_CACHE_KEY) || 'null');
        if (!cached || Date.now() - Number(cached.savedAt || 0) > ACTIVE_CALL_CACHE_MAX_AGE_MS || !Array.isArray(cached.calls)) return [];
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        return cached.calls.filter(call => !['Cleared', 'Cancelled'].includes(call?.status) && (getReliableCallTimestamp(call) || 0) >= oneHourAgo);
    } catch {
        return [];
    }
}

function parseServerTimestamp(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getReliableCallTimestamp(call) {
    const createdAt = parseServerTimestamp(call?.created_date);
    const receivedAt = parseServerTimestamp(call?.time_received);

    // GRAC has occasionally supplied a malformed/timezone-shifted time_received.
    // Trust it only when it is reasonably close to the Base44 row creation time;
    // otherwise use created_date so a genuinely new call is not hidden by the 1h filter.
    if (receivedAt && createdAt && Math.abs(receivedAt - createdAt) < 24 * 60 * 60 * 1000) {
        return receivedAt;
    }
    return createdAt || receivedAt;
}

function isRateLimitError(err) {
    return err?.status === 429 || String(err?.message || err).includes('429') || String(err?.message || err).toLowerCase().includes('rate limit');
}

export function DashboardDataProvider({ children }) {
    const initialCallsRef = useRef(null);
    if (initialCallsRef.current === null) initialCallsRef.current = readCachedActiveCalls();
    const [calls, setCalls]           = useState(initialCallsRef.current);
    const [users, setUsers]           = useState([]);
    const [loading, setLoading]       = useState(initialCallsRef.current.length === 0);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [requestCount, setRequestCount] = useState(0);

    const refreshingRef   = useRef(false);
    const rateLimitedUntil = useRef(0);
    const lastRefreshTime  = useRef(0);
    const lastUsersRefreshTime = useRef(0);
    const usersCacheRef = useRef([]);

    const loadData = useCallback(async (force = false) => {
        const now = Date.now();
        if (force) rateLimitedUntil.current = 0;

        // A rate limit must never hide already-persisted CAD data. Continue reading
        // DispatchCall while ingestion is backed off; only syncGrac is paused.

        // Throttle local reads — but always honor a forced/manual refresh. During
        // a known 429 window, background fallbacks stay quiet and preserve the last
        // good queue instead of repeatedly replacing reliability with retries.
        if (!force && (now < rateLimitedUntil.current || now - lastRefreshTime.current < MIN_REFRESH_MS)) {
            return;
        }

        // Never allow a forced/manual refresh to overlap an in-flight load.
        // Overlap was multiplying list requests whenever a popup/subscription fired.
        if (refreshingRef.current) return;
        refreshingRef.current = true;

        const nowET = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });

        console.log(`[CAD ${nowET}] Dashboard load started`);

        try {
            setRequestCount(c => c + 1);

            // Active Calls owns the first startup request. The officer-location
            // snapshot is intentionally not started until calls have painted; on a
            // busy/rate-limited session, launching both together delayed the queue.
            let callsData = [];
            try {
                callsData = await loadActiveDispatchCallRows(100);
                if (cadCallFeedIsStale(callsData)) {
                    // Recovery can involve a full upstream ingestion and must never
                    // block the current queue from painting. Keep the rows we already
                    // have on screen, recover in the background, then refresh once.
                    void refreshCadIngestionIfStale(callsData).then(recovery => {
                        if (recovery?.reason === 'feed_fresh' || recovery?.reason === 'recent_attempt') return;
                        window.setTimeout(() => {
                            lastRefreshTime.current = 0;
                            loadData(true);
                        }, 1500);
                    }).catch(recoveryError => {
                        console.warn('[CAD] Background stale-feed recovery did not complete', recoveryError?.message || recoveryError);
                    });
                }
            } catch (callsErr) {
                console.error(`[CAD ${nowET}] Calls fetch failed:`, callsErr);
                throw callsErr;
            }

            // Keep the live CAD queue to the most recent hour. Preserve the 1-hour
            // requirement, but use the same trustworthy timestamp logic as the UI.
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            const recentCalls = (callsData || []).filter(call => {
                if (['Cleared', 'Cancelled'].includes(call.status)) return false;
                const callTime = getReliableCallTimestamp(call);
                return !callTime || callTime >= oneHourAgo;
            });

            const uniqueCalls = new Map();
            for (const call of recentCalls) {
                const descriptionKey = String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
                const key = call.external_call_id || descriptionKey || call.id;
                const current = uniqueCalls.get(key);
                const currentHasIdentifier = Boolean(current?.agency_cad_number || current?.bps_reference || current?.call_id);
                const candidateHasIdentifier = Boolean(call?.agency_cad_number || call?.bps_reference || call?.call_id);
                const currentHasOfficialCad = Boolean(current?.official_cad_verified && (current?.agency_cad_number || current?.call_id));
                const candidateHasOfficialCad = Boolean(call?.official_cad_verified && (call?.agency_cad_number || call?.call_id));
                if (!current || (!currentHasIdentifier && candidateHasIdentifier) || (!currentHasOfficialCad && candidateHasOfficialCad)) uniqueCalls.set(key, call);
            }
            const active = [...uniqueCalls.values()].sort((a, b) =>
                (getReliableCallTimestamp(b) || 0) - (getReliableCallTimestamp(a) || 0)
            );

            // Paint calls immediately. This makes Active Calls independent of the
            // slower roster request while still allowing units to populate moments later.
            setCalls(active);
            try {
                window.localStorage.setItem(ACTIVE_CALL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), calls: active }));
            } catch {
                // Cache is only a fast first paint; the live entity query remains authoritative.
            }
            setLastRefresh(new Date());
            setRateLimited(false);
            lastRefreshTime.current = Date.now();
            setLoading(false);

            // Debug: newest call time
            if (active.length > 0) {
                const newest = active.reduce((a, b) =>
                    new Date(a.time_received) > new Date(b.time_received) ? a : b
                );
                const newestET = new Date(newest.time_received).toLocaleString('en-US', { timeZone: 'America/New_York' });
                console.log(`[CAD ${nowET}] Active calls after filter: ${active.length} | Newest: ${newestET}`);
            } else {
                console.log(`[CAD ${nowET}] Active calls after filter: 0`);
            }

            const richmondNow = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
            console.log(`[CAD ${nowET}] Current Richmond time: ${richmondNow}`);

            // Roster is secondary and must never keep the Active Calls request or
            // dashboard spinner open.
            if (Date.now() - lastUsersRefreshTime.current >= USER_REFRESH_MS || !usersCacheRef.current.length) {
                setRequestCount(c => c + 1);
                getOfficerLocationSnapshot().then(payload => {
                    usersCacheRef.current = payload.users || [];
                    lastUsersRefreshTime.current = Date.now();
                    setUsers(usersCacheRef.current);
                }).catch(error => console.warn('[CAD] Roster refresh failed', error?.message));
            }

        } catch (err) {
            if (isRateLimitError(err)) {
                rateLimitedUntil.current = Date.now() + RATE_LIMIT_BACKOFF_MS;
                setRateLimited(true);
                console.warn(`[CAD] 429 Rate limit detected. Waiting ${RATE_LIMIT_BACKOFF_MS / 1000}s before next refresh.`);
            } else {
                console.error('[CAD] loadData failed:', err);
            }
        } finally {
            refreshingRef.current = false;
            setLoading(false);
        }
    }, []);

    // GRAC ingestion is owned by one scheduled backend automation. Browsers only
    // read persisted DispatchCall rows and receive realtime updates. This prevents
    // every open dashboard from invoking the same ingestion job concurrently.
    useEffect(() => {
        loadData(true);
    }, [loadData]);

    // Old-call archival is owned by the scheduled Base44 workflow. Browsers do not
    // run maintenance jobs; this keeps operational reads separate from housekeeping.

    // Fallback local CAD refresh. Real-time entity subscriptions handle faster updates.
    useEffect(() => {
        const id = setInterval(() => loadData(false), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [loadData]);

    // Chromium can freeze a minimized/idle page, including subscriptions and
    // window timers. The GPS Worker emits background ticks while the process is
    // still allowed to run, and liveLocationService emits one recovery event when
    // a frozen page wakes. Catch up the queue and roster immediately in both cases.
    useEffect(() => {
        let wakeTimer;
        const recoverOperationalData = () => {
            window.clearTimeout(wakeTimer);
            wakeTimer = window.setTimeout(() => {
                lastUsersRefreshTime.current = 0;
                loadData(true);
            }, 250);
        };
        const backgroundTick = () => {
            if (Date.now() - lastRefreshTime.current >= POLL_INTERVAL_MS) loadData(false);
        };
        window.addEventListener('bps-operational-resume', recoverOperationalData);
        window.addEventListener('bps-background-location-tick', backgroundTick);
        window.addEventListener('online', recoverOperationalData);
        window.addEventListener('pageshow', recoverOperationalData);
        return () => {
            window.clearTimeout(wakeTimer);
            window.removeEventListener('bps-operational-resume', recoverOperationalData);
            window.removeEventListener('bps-background-location-tick', backgroundTick);
            window.removeEventListener('online', recoverOperationalData);
            window.removeEventListener('pageshow', recoverOperationalData);
        };
    }, [loadData]);

    // Clear stale rate limit state on mount (in-memory ref resets anyway, but clear UI state)
    useEffect(() => {
        rateLimitedUntil.current = 0;
        setRateLimited(false);
    }, []);

    // Apply realtime DispatchCall events directly. A create/update/delete now paints
    // immediately without spending another list/function request or waiting for a throttle.
    useEffect(() => {
        let reconcileTimer;
        const unsubscribe = subscribeDispatchCallChanges(event => {
            if (!event?.data && event?.type !== 'delete') {
                window.clearTimeout(reconcileTimer);
                reconcileTimer = window.setTimeout(() => loadData(false), 5000);
                return;
            }
            setCalls(current => {
                const next = applyDispatchCallEvent(current, event, { hideClosed: true, maxAgeMs: 65 * 60_000, limit: 200 });
                try {
                    window.localStorage.setItem(ACTIVE_CALL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), calls: next }));
                } catch {}
                return next;
            });
            setLastRefresh(new Date());
            setRateLimited(false);
        });
        return () => {
            window.clearTimeout(reconcileTimer);
            unsubscribe?.();
        };
    }, [loadData]);

    // Do not reload the full CAD call list for every User update. Officer GPS/status
    // changes can occur every few seconds and were causing a request storm. The
    // periodic user refresh above is sufficient for the dashboard roster.

    const manualRefresh = useCallback(async () => { await loadData(true); }, [loadData]);

    return (
        <DashboardDataContext.Provider value={{ calls, users, loading, lastRefresh, rateLimited, requestCount, manualRefresh }}>
            {children}
        </DashboardDataContext.Provider>
    );
}

export function useDashboardData() {
    const ctx = useContext(DashboardDataContext);
    if (!ctx) throw new Error('useDashboardData must be used inside DashboardDataProvider');
    return ctx;
}