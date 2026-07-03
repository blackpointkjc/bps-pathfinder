/**
 * Centralized data provider for the dashboard.
 * All components pull from here instead of making their own API calls.
 * Polls DispatchCall every 30s; User fetched independently (non-admin safe).
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';


const DashboardDataContext = createContext(null);

const POLL_INTERVAL_MS = 30_000;        // 30 seconds between auto-refreshes
const RATE_LIMIT_BACKOFF_MS = 60_000;   // 60s wait after 429
const MIN_REFRESH_MS = 10_000;          // Never refresh more than once per 10s

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

        // Throttle: skip if last refresh was < 30s ago (even if forced)
        if (now - lastRefreshTime.current < MIN_REFRESH_MS) {
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
                const resp = await base44.functions.invoke('fetchAllUsers', {});
                usersData = resp?.data?.users || resp?.data || resp?.users || [];
            } catch (usersErr) {
                console.warn(`[CAD ${nowET}] fetchAllUsers failed — continuing without users`);
                usersData = [];
            }

            console.log(`[CAD ${nowET}] Calls fetched: ${callsData?.length ?? 0} | Users: ${usersData?.length ?? 0}`);

            // Phase out calls older than 2 hours (ET). Use the call's actual received
            // time (now reliable from the ingest) when available and not in the future,
            // falling back to created_date. Non-geocoded calls are NOT filtered out here
            // — they still show in the queue while geocoding keeps retrying.
            const twoHoursAgo = now - 2 * 60 * 60 * 1000;
            const callRefTime = (c) => {
                const received = c.time_received ? new Date(c.time_received).getTime() : null;
                if (received && !Number.isNaN(received) && received <= now) return received;
                return c.created_date ? new Date(c.created_date).getTime() : 0;
            };
            const active = (callsData || []).filter(c => callRefTime(c) >= twoHoursAgo);

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

    // Initial load
    useEffect(() => {
        loadData(true);
    }, [loadData]);

    // Auto-poll every 2 minutes
    useEffect(() => {
        const id = setInterval(() => loadData(false), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [loadData]);

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