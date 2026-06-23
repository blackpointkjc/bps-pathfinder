/**
 * Centralized data provider for the dashboard.
 * All components pull from here instead of making their own API calls.
 * Polls DispatchCall + User once per 60 seconds max. Manual refresh allowed anytime.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const DashboardDataContext = createContext(null);

const POLL_INTERVAL_MS = 60_000;        // 60s between auto-refreshes
const RATE_LIMIT_BACKOFF_MS = 90_000;   // 90s wait after 429

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

        // Throttle: skip if last refresh was < 60s ago (unless forced)
        if (!force && now - lastRefreshTime.current < POLL_INTERVAL_MS) {
            return;
        }

        if (refreshingRef.current) return;
        refreshingRef.current = true;

        const nowET = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });

        console.log(`[CAD ${nowET}] Dashboard load started`);

        try {
            setRequestCount(c => c + 2);
            const [callsData, usersData] = await Promise.all([
                base44.entities.DispatchCall.list('-time_received', 500),
                base44.entities.User.list()
            ]);

            console.log(`[CAD ${nowET}] Requests made: 2 | Calls fetched: ${callsData?.length ?? 0}`);

            // Show ALL calls — no time window, no status filter, no geo requirement
            const active = (callsData || []);

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

    // Auto-poll every 60s
    useEffect(() => {
        const id = setInterval(() => loadData(false), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [loadData]);

    // Real-time subscription — reload on any DispatchCall change, throttled
    useEffect(() => {
        const unsubscribe = base44.entities.DispatchCall.subscribe(() => {
            loadData(false);
        });
        return unsubscribe;
    }, [loadData]);

    const manualRefresh = useCallback(() => loadData(true), [loadData]);

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