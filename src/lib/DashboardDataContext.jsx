/**
 * Centralized data provider for the dashboard.
 * All components pull from here instead of making their own API calls.
 * Keeps DispatchCall synchronized with GRAC every 10s while the dashboard is open.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';


const DashboardDataContext = createContext(null);

const POLL_INTERVAL_MS = 15_000;        // Read local entity changes every 15 seconds
const GRAC_SYNC_INTERVAL_MS = 20_000;   // Credit-free direct GRAC sync every 20 seconds
const RATE_LIMIT_BACKOFF_MS = 60_000;   // 60s wait after 429
const MIN_REFRESH_MS = 1_500;           // Prevent overlapping local refreshes

function isRateLimitError(err) {
    return err?.status === 429 || String(err?.message || err).includes('429') || String(err?.message || err).toLowerCase().includes('rate limit');
}

export function DashboardDataProvider({ children }) {
    const [calls, setCalls]           = useState([]);
    const [users, setUsers]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [requestCount, setRequestCount] = useState(0);

    const refreshingRef   = useRef(false);
    const syncingGracRef  = useRef(false);
    const rateLimitedUntil = useRef(0);
    const lastRefreshTime  = useRef(0);

    const loadData = useCallback(async (force = false) => {
        const now = Date.now();

        // Block if rate limited
        if (now < rateLimitedUntil.current) {
            const waitSec = Math.ceil((rateLimitedUntil.current - now) / 1000);
            console.log(`[CAD] Rate limit active — waiting ${waitSec}s before retrying`);
            return;
        }

        // Throttle: skip if last refresh was < 10s ago — but always honor a forced/manual refresh
        if (!force && now - lastRefreshTime.current < MIN_REFRESH_MS) {
            return;
        }

        if (refreshingRef.current && !force) return;
        refreshingRef.current = true;

        const nowET = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });

        console.log(`[CAD ${nowET}] Dashboard load started`);

        try {
            setRequestCount(c => c + 2);

            // Fetch calls and users independently — User.list() can 403 for non-admins,
            // but that must NOT block calls from loading.
            let callsData = [];
            let usersData = [];
            try {
                callsData = await base44.entities.DispatchCall.list('-time_received', 200);
            } catch (callsErr) {
                console.error(`[CAD ${nowET}] Calls fetch failed:`, callsErr);
                throw callsErr; // re-throw — calls are the critical payload
            }
            try {
                const allUsers = await base44.entities.User.list('-last_updated', 200);
                const cutoff = Date.now() - 12 * 60 * 60 * 1000;
                usersData = (allUsers || []).filter(u => {
                    const updated = u.last_updated ? new Date(u.last_updated).getTime() : 0;
                    return updated >= cutoff && u.status;
                });
            } catch (usersErr) {
                console.warn(`[CAD ${nowET}] direct User fetch failed — continuing without users`, usersErr);
                usersData = [];
            }

            console.log(`[CAD ${nowET}] Calls fetched: ${callsData?.length ?? 0} | Users: ${usersData?.length ?? 0}`);

            // DispatchCall is synchronized to GRAC's current active-call list.
            // Do not hide calls based on age; a call remains visible until ingestion
            // marks it Closed/Cleared/Cancelled after it disappears from GRAC.
            const uniqueCalls = new Map();
            for (const call of callsData || []) {
                const descriptionKey = String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
                const key = call.external_call_id || descriptionKey || call.id;
                const current = uniqueCalls.get(key);
                const currentHasIdentifier = Boolean(current?.agency_cad_number || current?.bps_reference || current?.call_id);
                const candidateHasIdentifier = Boolean(call?.agency_cad_number || call?.bps_reference || call?.call_id);
                const currentHasOfficialCad = Boolean(current?.official_cad_verified && (current?.agency_cad_number || current?.call_id));
                const candidateHasOfficialCad = Boolean(call?.official_cad_verified && (call?.agency_cad_number || call?.call_id));
                if (!current || (!currentHasIdentifier && candidateHasIdentifier) || (!currentHasOfficialCad && candidateHasOfficialCad)) uniqueCalls.set(key, call);
            }
            const active = [...uniqueCalls.values()].filter(c =>
                !['Cleared', 'Cancelled'].includes(c.status)
            );

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

            setCalls(active);
            setUsers(usersData || []);
            setLastRefresh(new Date());
            setRateLimited(false);
            lastRefreshTime.current = Date.now();


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

    // Pull GRAC into DispatchCall with the local backend function, then refresh the CAD.
    // This uses direct HTTP/server code and does not consume integration credits.
    const syncGrac = useCallback(async () => {
        if (syncingGracRef.current || document.hidden) return;
        syncingGracRef.current = true;
        try {
            await base44.functions.invoke('ingestGractivecalls', {});
            await loadData(true);
        } catch (error) {
            console.warn('[CAD] GRAC sync failed:', error?.message);
        } finally {
            syncingGracRef.current = false;
        }
    }, [loadData]);

    // Initial sync/load
    useEffect(() => {
        syncGrac();
    }, [syncGrac]);

    // Refresh local entity data every 2 seconds for near-real-time CAD updates.
    useEffect(() => {
        const id = setInterval(() => loadData(false), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [loadData]);

    // Near-real-time foreground synchronization. Pauses when the tab is hidden.
    useEffect(() => {
        const id = setInterval(syncGrac, GRAC_SYNC_INTERVAL_MS);
        const onVisibility = () => {
            if (!document.hidden) syncGrac();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [syncGrac]);

    // Clear stale rate limit state on mount (in-memory ref resets anyway, but clear UI state)
    useEffect(() => {
        rateLimitedUntil.current = 0;
        setRateLimited(false);
    }, []);

    // Real-time subscription — reload on DispatchCall changes, but throttled to MIN_REFRESH_MS
    useEffect(() => {
        const unsubscribe = base44.entities.DispatchCall.subscribe(() => {
            const now = Date.now();
            if (now - lastRefreshTime.current >= MIN_REFRESH_MS && now >= rateLimitedUntil.current) {
                loadData(false);
            }
        });
        return unsubscribe;
    }, [loadData]);

    // Real-time subscription — reload on User changes (unit status/location updates)
    useEffect(() => {
        const unsubscribe = base44.entities.User.subscribe(() => {
            const now = Date.now();
            if (now - lastRefreshTime.current >= MIN_REFRESH_MS && now >= rateLimitedUntil.current) {
                loadData(false);
            }
        });
        return unsubscribe;
    }, [loadData]);

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