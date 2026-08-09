/**
 * Centralized data provider for the dashboard.
 * All components pull from here instead of making their own API calls.
 * Keeps DispatchCall synchronized with GRAC every 10s while the dashboard is open.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';


const DashboardDataContext = createContext(null);

const POLL_INTERVAL_MS = 20_000;        // Realtime subscriptions handle most updates; this is only a fallback
const GRAC_SYNC_INTERVAL_MS = 20_000;   // One app-wide GRAC sync owner; do not duplicate this on pages
const RATE_LIMIT_BACKOFF_MS = 60_000;   // Give Base44 room to recover after a 429 instead of retry-storming
const MIN_REFRESH_MS = 5_000;           // Prevent subscription bursts from causing repeated list calls
const USER_REFRESH_MS = 30_000;         // Unit roster changes slower than calls

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
    const lastUsersRefreshTime = useRef(0);
    const usersCacheRef = useRef([]);

    const loadData = useCallback(async (force = false) => {
        const now = Date.now();

        // A rate limit must never hide already-persisted CAD data. Continue reading
        // DispatchCall while ingestion is backed off; only syncGrac is paused.

        // Throttle local reads — but always honor a forced/manual refresh
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
            if (Date.now() - lastUsersRefreshTime.current >= USER_REFRESH_MS || usersCacheRef.current.length === 0) {
                try {
                    const allUsers = await base44.entities.User.list('-last_updated', 200);
                    usersData = (allUsers || []).filter(u => {
                        const roles = Array.isArray(u.additional_roles) ? u.additional_roles.map(role => String(role).toLowerCase()) : [];
                        const isCadOfficer = roles.includes('cad_access') && roles.includes('officer');
                        return isCadOfficer && Boolean(u.status);
                    });
                    usersCacheRef.current = usersData;
                    lastUsersRefreshTime.current = Date.now();
                } catch (usersErr) {
                    console.warn(`[CAD ${nowET}] direct User fetch failed — continuing with cached users`, usersErr);
                    usersData = usersCacheRef.current;
                }
            } else {
                usersData = usersCacheRef.current;
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
        const now = Date.now();
        if (syncingGracRef.current || document.hidden || now < rateLimitedUntil.current) return;
        syncingGracRef.current = true;
        try {
            await base44.functions.invoke('ingestGractivecalls', {});
            rateLimitedUntil.current = 0;
            setRateLimited(false);
            await loadData(true);
        } catch (error) {
            if (isRateLimitError(error)) {
                rateLimitedUntil.current = Date.now() + RATE_LIMIT_BACKOFF_MS;
                setRateLimited(true);
                console.warn(`[CAD] Ingestion rate limited. Backing off ${RATE_LIMIT_BACKOFF_MS / 1000}s while continuing to display saved calls.`);
            } else {
                console.warn('[CAD] GRAC sync failed:', error?.message);
            }
            // Even if ingestion fails, refresh persisted DispatchCall rows so the
            // dashboard never falsely falls to zero just because the feed is delayed.
            await loadData(true).catch(() => null);
        } finally {
            syncingGracRef.current = false;
        }
    }, [loadData]);

    // Initial sync/load
    useEffect(() => {
        syncGrac();
    }, [syncGrac]);

    // Fallback local CAD refresh. Real-time entity subscriptions handle faster updates.
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