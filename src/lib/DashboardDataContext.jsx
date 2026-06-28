/**
 * Centralized data provider for the dashboard.
 * All components pull from here instead of making their own API calls.
 * Polls DispatchCall + User once per 60 seconds max. Manual refresh allowed anytime.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Geocode calls missing lat/lng via Nominatim (1 req/sec limit)
async function geocodeUnmappedCalls(calls, setCalls) {
    const unmapped = calls.filter(c => !c.latitude || !c.longitude || c.latitude === 0);
    if (!unmapped.length) return;
    console.log(`[GEO] Starting geocode for ${unmapped.length} unmapped calls`);

    for (const call of unmapped.slice(0, 15)) {
        if (!call.location) continue;
        try {
            const q = encodeURIComponent(`${call.location}, Richmond VA`);
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
                { headers: { 'User-Agent': 'CommandCAD/1.0' } }
            );
            const data = await resp.json();
            if (data?.[0]) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                await base44.entities.DispatchCall.update(call.id, {
                    latitude: lat,
                    longitude: lon,
                    geo_confidence: 'medium',
                    geo_method: 'street'
                });
                // Update local state immediately so map pin appears without waiting for next poll
                setCalls(prev => prev.map(c => c.id === call.id ? { ...c, latitude: lat, longitude: lon } : c));
                console.log(`[GEO] ✓ ${call.incident} @ ${call.location} → ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
            } else {
                console.log(`[GEO] ✗ No result for: ${call.location}`);
            }
        } catch (e) {
            console.warn(`[GEO] Error geocoding ${call.location}:`, e?.message);
        }
        // Nominatim rate limit: max 1 req/sec
        await new Promise(r => setTimeout(r, 1200));
    }
}

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
        const oneHourAgo = now - 60 * 60 * 1000;

        console.log(`[CAD ${nowET}] Dashboard load started`);

        try {
            setRequestCount(c => c + 2);
            const [callsData, usersData] = await Promise.all([
                base44.entities.DispatchCall.list('-time_received', 500),
                base44.entities.User.list()
            ]);

            console.log(`[CAD ${nowET}] Requests made: 2 | Calls fetched: ${callsData?.length ?? 0}`);

            // Show active (non-cleared) calls up to 8 hours old, cleared/closed only within 1 hour
            const eightHoursAgo = now - 8 * 60 * 60 * 1000;
            const CLOSED = new Set(['Cleared', 'Cancelled', 'Closed', 'Unfounded', 'Cancelled']);
            const active = (callsData || []).filter(c => {
                if (!c.time_received) return false;
                const t = new Date(c.time_received).getTime();
                if (CLOSED.has(c.status)) return t >= oneHourAgo;   // cleared: 1h window
                return t >= eightHoursAgo;                           // active: 8h window
            });

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

            // Background geocode unmapped calls (non-blocking)
            geocodeUnmappedCalls(active, setCalls).catch(() => {});
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