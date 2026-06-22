import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { playDispatchAlert, stopDispatchAlert, setDispatchAlertMuted, shouldAlertForGeofence } from '@/utils/alertUtils';
import { classifyCall } from '@/lib/cadCallTypes';
import { cleanIncident } from '@/utils/callUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressBanner from '@/components/dispatch/OfficerDistressBanner';
import { RefreshCw, Volume2, VolumeX, Zap, MapPin, Users, TrendingUp, Shield, AlertTriangle, Radio, ChevronRight, RotateCcw, CheckCheck } from 'lucide-react';

const PRIORITY_CONFIG = {
    critical: { label: 'P1', color: '#ef4444', bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500', row: 'bg-red-950/30 hover:bg-red-950/50', badge: 'bg-red-500/20 text-red-300 border-red-500/40' },
    high:     { label: 'P2', color: '#f97316', bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500', row: 'bg-orange-950/20 hover:bg-orange-950/40', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
    medium:   { label: 'P3', color: '#eab308', bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500', row: 'bg-slate-900 hover:bg-slate-800/60', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
    low:      { label: 'P4', color: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500', row: 'bg-slate-900 hover:bg-slate-800/60', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
};

const UNIT_STATUS_COLORS = {
    Available:        { dot: 'bg-green-400',  text: 'text-green-300',  badge: 'bg-green-900/40 text-green-300 border-green-600/50' },
    Enroute:          { dot: 'bg-yellow-400', text: 'text-yellow-300', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-600/50' },
    'On Scene':       { dot: 'bg-blue-400',   text: 'text-blue-300',   badge: 'bg-blue-900/40 text-blue-300 border-blue-600/50' },
    Busy:             { dot: 'bg-orange-400', text: 'text-orange-300', badge: 'bg-orange-900/40 text-orange-300 border-orange-600/50' },
    'Out of Service': { dot: 'bg-gray-500',   text: 'text-gray-400',   badge: 'bg-gray-900/40 text-gray-400 border-gray-600/50' },
};

const MY_STATUSES = ['Available', 'Enroute', 'On Scene', 'Busy', 'Out of Service'];

function getCallPriority(call) {
    if (call.priority_override && call.priority) return call.priority;
    const classification = classifyCall(`${call.incident || ''} ${call.description || ''}`);
    if (classification.matched_type) return classification.matched_type.priority;
    return call.priority || 'medium';
}

function fmtTime(dateStr) {
    if (!dateStr) return '----';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function elapsed(dateStr) {
    if (!dateStr) return '';
    const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs/60)}m ${secs%60}s`;
    return `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m`;
}

function LiveClock() {
    const [t, setT] = useState(new Date());
    useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
    return (
        <div className="text-right">
            <div className="text-white font-mono font-bold text-lg leading-none">
                {t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            <div className="text-slate-500 font-mono text-[10px] tracking-widest">
                {t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </div>
        </div>
    );
}

function PanelHeader({ children, count, accent = 'gold' }) {
    const accents = {
        gold: 'border-t-gold',
        red: 'border-t-red-500',
        blue: 'border-t-blue-500',
        green: 'border-t-green-500',
    };
    return (
        <div className={`bg-slate-800 border-b border-slate-700 border-t-2 ${accents[accent]} px-3 py-2 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-gold rounded-sm flex-shrink-0" />
                <span className="text-white font-mono font-bold text-xs tracking-widest">{children}</span>
            </div>
            {count !== undefined && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-700 border border-slate-600 text-slate-300 rounded">{count}</span>
            )}
        </div>
    );
}

export default function CommandDashboard() {
    const navigate = useNavigate();
    const [calls, setCalls] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [monitoredProperties, setMonitoredProperties] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [, setTick] = useState(0);
    const soundEnabledRef = useRef(true);
    const currentUserRef = useRef(null);
    const monitoredPropertiesRef = useRef([]);
    const knownCallIdsRef = useRef(null);

    // Re-render every second for live elapsed timers
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const anyStoredMute = Object.keys(localStorage).find(k => k.startsWith('bps_alerts_'));
        if (anyStoredMute) {
            const val = localStorage.getItem(anyStoredMute) === 'true';
            setSoundEnabled(val);
            soundEnabledRef.current = val;
            setDispatchAlertMuted(!val);
        }
        base44.auth.me().then(user => {
            setCurrentUser(user);
            currentUserRef.current = user;
            const stored = localStorage.getItem(`bps_alerts_${user?.id}`);
            if (stored !== null) {
                const val = stored === 'true';
                setSoundEnabled(val);
                soundEnabledRef.current = val;
                setDispatchAlertMuted(!val);
            }
        }).catch(() => {});
        loadData();
        loadMonitoredProperties();
        const interval = setInterval(() => { loadData(); loadMonitoredProperties(); }, 20000);
        return () => clearInterval(interval);
    }, []);

    const loadMonitoredProperties = async () => {
        try {
            const props = await base44.entities.MonitoredProperty.list();
            const enabled = props?.filter(p => p.enabled) || [];
            setMonitoredProperties(enabled);
            monitoredPropertiesRef.current = enabled;
        } catch {}
    };

    const loadData = async () => {
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`[CAD ${ts}] loadData: starting fetch...`);
        try {
            const [callsData, usersData] = await Promise.all([
                base44.entities.DispatchCall.list('-created_date', 200),
                base44.entities.User.list()
            ]);
            console.log(`[CAD ${ts}] loadData: fetched ${callsData?.length ?? 0} calls, ${usersData?.length ?? 0} users`);
            const active = (callsData || []).filter(c =>
                !['Closed', 'Cleared', 'Cancelled'].includes(c.status)
            );
            console.log(`[CAD ${ts}] loadData: ${active.length} active calls after filter`);
            const currentIds = new Set(active.map(c => c.id));
            if (knownCallIdsRef.current === null) {
                knownCallIdsRef.current = currentIds;
            } else {
                const newCallIds = [...currentIds].filter(id => !knownCallIdsRef.current.has(id));
                if (newCallIds.length > 0) {
                    console.log(`[CAD ${ts}] loadData: ${newCallIds.length} new call(s) detected:`, newCallIds);
                    if (soundEnabledRef.current) {
                        const newCall = active.find(c => c.id === newCallIds[0]);
                        if (newCall) {
                            const inGeofence = shouldAlertForGeofence(newCall, currentUserRef.current, monitoredPropertiesRef.current);
                            if (inGeofence) {
                                console.log(`[CAD ${ts}] loadData: alert triggered for call`, newCall.incident, '@', newCall.location);
                                playDispatchAlert();
                                window.dispatchEvent(new CustomEvent('bps-new-call', { detail: newCall }));
                            }
                        }
                    }
                }
                knownCallIdsRef.current = currentIds;
            }
            setCalls(active);
            setUnits(usersData || []);
            setLastRefresh(new Date());
            console.log(`[CAD ${ts}] loadData: ✓ complete`);
        } catch (e) {
            console.error(`[CAD ${ts}] loadData: ✗ FAILED`, e);
        }
        finally { setLoading(false); }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleStatusChange = async (newStatus) => {
        setCurrentUser(prev => ({ ...prev, status: newStatus }));
    };

    const toggleSound = () => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        soundEnabledRef.current = next;
        if (currentUser?.id) localStorage.setItem(`bps_alerts_${currentUser.id}`, String(next));
        setDispatchAlertMuted(!next);
    };

    const activeUnits = units.filter(u => u.status && u.status !== 'Out of Service' && u.last_updated && Date.now() - new Date(u.last_updated) < 12 * 3600000);
    const sortedCalls = [...calls].sort((a, b) =>
        new Date(b.time_received || b.created_date) - new Date(a.time_received || a.created_date)
    );

    const criticalCalls = calls.filter(c => getCallPriority(c) === 'critical');
    const highCalls = calls.filter(c => getCallPriority(c) === 'high');
    const unassigned = calls.filter(c => (!c.assigned_units || c.assigned_units.length === 0) && !c.source);
    const availUnits = activeUnits.filter(u => u.status === 'Available');
    const enrouteUnits = activeUnits.filter(u => u.status === 'Enroute');
    const onSceneUnits = activeUnits.filter(u => u.status === 'On Scene');
    const busyUnits = activeUnits.filter(u => u.status === 'Busy');

    const isAdmin = currentUser?.role === 'admin';
    const isDispatchOrAdmin = isAdmin || currentUser?.is_supervisor || currentUser?.dispatch_role;

    const handlePriorityOverride = async (call, e) => {
        e.stopPropagation();
        const order = ['critical', 'high', 'medium', 'low'];
        const current = getCallPriority(call);
        const nextIdx = (order.indexOf(current) + 1) % order.length;
        const next = order[nextIdx];
        await base44.entities.DispatchCall.update(call.id, { priority: next, priority_override: true });
        loadData();
    };

    const handleMarkCleared = async (call, e) => {
        e.stopPropagation();
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`[CAD ${ts}] MARK CLEARED: call ${call.id} — ${call.incident} @ ${call.location}`);
        try {
            await base44.entities.DispatchCall.update(call.id, { status: 'Cleared', time_cleared: new Date().toISOString() });
            console.log(`[CAD ${ts}] MARK CLEARED: ✓ success`);
        } catch (err) {
            console.error(`[CAD ${ts}] MARK CLEARED: ✗ FAILED`, err);
        }
        loadData();
    };

    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    const handleSyncAndPrune = async () => {
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`[CAD ${ts}] SYNC FEED: initiated by user`);
        setSyncing(true);
        setSyncResult(null);
        try {
            await loadData();
            console.log(`[CAD ${ts}] SYNC FEED: ✓ success`);
            setSyncResult('Feed refreshed.');
        } catch (err) {
            console.error(`[CAD ${ts}] SYNC FEED: ✗ FAILED`, err);
            setSyncResult('Sync failed.');
        }
        setSyncing(false);
        setTimeout(() => setSyncResult(null), 4000);
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" />
                <p className="text-gold font-mono text-xs tracking-widest">INITIALIZING COMMAND SYSTEM...</p>
            </div>
        </div>
    );

    return (
        <div className="bg-slate-950 min-h-full flex flex-col">
            <OfficerDistressBanner currentUser={currentUser} isDispatchOrAdmin={isDispatchOrAdmin} />

            {/* ── SYSTEM HEADER BAR ── */}
            <div className="flex-none bg-slate-900 border-b-2 border-gold/60 px-4 py-2 flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-green-400 font-mono text-[10px] font-bold tracking-widest">SYSTEM ONLINE</span>
                    </div>
                    <div className="w-px h-4 bg-slate-700" />
                    <span className="text-slate-500 font-mono text-[10px]">REFRESHED {fmtTime(lastRefresh)}</span>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                    {isDispatchOrAdmin && (
                        <button onClick={toggleSound} title={soundEnabled ? 'Mute' : 'Unmute'}
                            className={`h-7 w-7 flex items-center justify-center rounded border font-mono text-[10px] font-bold transition-all flex-shrink-0 ${soundEnabled ? 'bg-slate-800 border-green-600/40 text-green-400' : 'bg-slate-800 border-red-600/40 text-red-400'}`}>
                            {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                        </button>
                    )}
                    <button onClick={handleSyncAndPrune} disabled={syncing}
                        title="Sync with live feed & remove stale calls"
                        className={`h-7 flex items-center gap-1 px-2 rounded border font-mono text-[10px] font-bold transition-all flex-shrink-0 ${syncing ? 'bg-blue-900/40 border-blue-500/40 text-blue-300 animate-pulse' : 'bg-slate-800 border-blue-500/40 text-blue-400 hover:bg-blue-900/30'}`}>
                        <RotateCcw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'SYNCING...' : 'SYNC FEED'}
                    </button>
                    {syncResult && (
                        <span className="text-green-400 font-mono text-[10px] animate-pulse">{syncResult}</span>
                    )}
                    <button onClick={() => navigate(createPageUrl('DispatchCenter'))}
                        className="h-7 flex items-center gap-1 px-2 bg-gold text-black font-mono font-bold text-[10px] rounded hover:bg-yellow-400 transition-colors flex-shrink-0">
                        <Zap className="w-3 h-3" />DISPATCH CTR
                    </button>
                    <OfficerDistressButton currentUser={currentUser} />
                </div>
                <LiveClock />
            </div>

            {/* ── MASTER STATUS TILES ── */}
            <div className="flex-none grid grid-cols-4 md:grid-cols-8 border-b border-slate-800">
                {[
                    { label: 'ACTIVE CALLS', val: calls.length, color: 'text-gold', bg: 'bg-gold/10', border: 'border-r border-slate-800' },
                    { label: 'P1 CRITICAL', val: criticalCalls.length, color: criticalCalls.length > 0 ? 'text-red-400' : 'text-slate-500', bg: criticalCalls.length > 0 ? 'bg-red-950/40' : '', border: 'border-r border-slate-800', flash: criticalCalls.length > 0 },
                    { label: 'P2 HIGH', val: highCalls.length, color: highCalls.length > 0 ? 'text-orange-400' : 'text-slate-500', bg: '', border: 'border-r border-slate-800' },
                    { label: 'UNASSIGNED', val: unassigned.length, color: unassigned.length > 0 ? 'text-yellow-400' : 'text-slate-500', bg: unassigned.length > 0 ? 'bg-yellow-950/20' : '', border: 'border-r border-slate-800' },
                    { label: 'AVAILABLE', val: availUnits.length, color: 'text-green-400', bg: '', border: 'border-r border-slate-800' },
                    { label: 'EN ROUTE', val: enrouteUnits.length, color: 'text-yellow-400', bg: '', border: 'border-r border-slate-800' },
                    { label: 'ON SCENE', val: onSceneUnits.length, color: 'text-blue-400', bg: '', border: 'border-r border-slate-800' },
                    { label: 'BUSY', val: busyUnits.length, color: 'text-orange-400', bg: '', border: '' },
                ].map(({ label, val, color, bg, border, flash }) => (
                    <div key={label} className={`${bg} ${border} px-3 py-2.5 flex flex-col items-center justify-center ${flash ? 'animate-pulse' : ''}`}>
                        <span className={`text-2xl font-mono font-bold leading-none ${color}`}>{val}</span>
                        <span className="text-[9px] text-slate-500 font-mono tracking-widest mt-0.5 text-center">{label}</span>
                    </div>
                ))}
            </div>

            {/* ── MY STATUS BAR (officers) ── */}
            {currentUser && (
                <div className="flex-none flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border-b border-slate-800">
                    <span className="text-slate-500 font-mono text-[10px] tracking-widest flex-shrink-0">
                        {currentUser.unit_number ? `UNIT-${currentUser.unit_number}` : currentUser.full_name?.toUpperCase()} STATUS:
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                        {MY_STATUSES.map(s => {
                            const cfg = UNIT_STATUS_COLORS[s];
                            const isActive = currentUser.status === s;
                            return (
                                <button key={s} onClick={() => handleStatusChange(s)}
                                    className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold border transition-all ${
                                        isActive ? `${cfg.badge} ring-1 ring-offset-1 ring-offset-slate-900 ring-current` : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                                    }`}>
                                    {s.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── CRITICAL INCIDENT FLASH BANNER ── */}
            {criticalCalls.length > 0 && (
                <div className="flex-none flex items-center gap-3 bg-red-900/80 border-b-2 border-red-500 px-4 py-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-300 animate-pulse flex-shrink-0" />
                    <span className="text-red-200 font-mono font-bold text-xs tracking-wider">
                        ⚠ {criticalCalls.length} CRITICAL INCIDENT{criticalCalls.length > 1 ? 'S' : ''} ACTIVE
                    </span>
                    <span className="text-red-300/70 font-mono text-xs flex-1 truncate">
                        {criticalCalls.slice(0, 2).map(c => `${cleanIncident(c)} @ ${c.location}`).join('  |  ')}
                    </span>
                    <button onClick={() => navigate(createPageUrl('Navigation'))}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-[10px] rounded border border-red-400 transition-colors">
                        MAP <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* ── MAIN GRID ── */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 min-h-0">

                {/* ── CALL QUEUE (3 cols) ── */}
                <div className="lg:col-span-3 flex flex-col border-r border-slate-800 min-h-0">
                    <PanelHeader count={calls.length}>ACTIVE INCIDENT QUEUE</PanelHeader>

                    {/* Column Headers */}
                    <div className="flex items-center bg-slate-900 border-b border-slate-700 px-3 py-1 text-[9px] font-mono text-slate-500 tracking-widest flex-none">
                        <div className="w-8 flex-shrink-0">PRI</div>
                        <div className="w-16 flex-shrink-0">TIME</div>
                        <div className="w-20 flex-shrink-0 hidden md:block">ELAPSED</div>
                        <div className="flex-1">INCIDENT / LOCATION</div>
                        <div className="w-24 flex-shrink-0 hidden lg:block">AGENCY</div>
                        <div className="w-20 flex-shrink-0 text-center">STATUS</div>
                        <div className="w-16 flex-shrink-0 text-center">UNITS</div>
                        {isDispatchOrAdmin && <div className="w-14 flex-shrink-0 text-center">MARK</div>}
                    </div>

                    {/* Call Rows */}
                    <div className="flex-1 overflow-y-auto">
                        {sortedCalls.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-slate-600 font-mono text-xs tracking-widest">
                                — NO ACTIVE INCIDENTS —
                            </div>
                        ) : sortedCalls.map((call, idx) => {
                            const priority = getCallPriority(call);
                            const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
                            const isUnassigned = (!call.assigned_units || call.assigned_units.length === 0) && !call.source;
                            return (
                                <div key={call.id}
                                    onClick={() => navigate(`${createPageUrl('Navigation')}?callId=${call.id}${call.latitude ? `&lat=${call.latitude}&lng=${call.longitude}` : ''}`)}
                                    className={`flex items-center px-3 py-2 border-b border-slate-800/60 cursor-pointer transition-colors ${cfg.row} ${priority === 'critical' ? 'border-l-2 border-l-red-500' : priority === 'high' ? 'border-l-2 border-l-orange-500' : 'border-l-2 border-l-transparent'}`}>
                                    
                                    {/* Priority */}
                                    <div className="w-8 flex-shrink-0">
                                        {isAdmin ? (
                                            <button
                                                onClick={(e) => handlePriorityOverride(call, e)}
                                                title="Click to cycle priority"
                                                className={`text-[10px] font-mono font-bold ${cfg.text} hover:ring-1 ring-current rounded px-0.5 transition-all`}>
                                                {cfg.label}
                                            </button>
                                        ) : (
                                            <span className={`text-[10px] font-mono font-bold ${cfg.text}`}>{cfg.label}</span>
                                        )}
                                    </div>

                                    {/* Time */}
                                    <div className="w-16 flex-shrink-0 font-mono text-[10px] text-slate-400">
                                        {fmtTime(call.time_received || call.created_date)}
                                    </div>

                                    {/* Elapsed */}
                                    <div className="w-20 flex-shrink-0 font-mono text-[10px] text-slate-500 hidden md:block">
                                        {elapsed(call.time_received || call.created_date)}
                                    </div>

                                    {/* Incident + Location */}
                                    <div className="flex-1 min-w-0 pr-2">
                                        <div className="text-white font-mono font-bold text-xs truncate">{cleanIncident(call)}</div>
                                        <div className="text-slate-400 font-mono text-[10px] truncate flex items-center gap-1 mt-0.5">
                                            <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-slate-600" />
                                            {call.location}
                                            {call.cross_street ? <span className="text-slate-600 ml-1">@ {call.cross_street}</span> : ''}
                                        </div>
                                    </div>

                                    {/* Agency */}
                                    <div className="w-24 flex-shrink-0 hidden lg:block">
                                        <span className="text-slate-500 font-mono text-[10px] truncate">{call.agency || '—'}</span>
                                    </div>

                                    {/* Status */}
                                    <div className="w-20 flex-shrink-0 text-center">
                                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                            call.status === 'New' ? 'bg-red-900/40 text-red-300 border-red-700/40' :
                                            call.status === 'Dispatched' || call.status === 'Enroute' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40' :
                                            call.status === 'On Scene' || call.status === 'Arrived' ? 'bg-blue-900/40 text-blue-300 border-blue-700/40' :
                                            'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>{(call.status || 'NEW').toUpperCase()}</span>
                                    </div>

                                    {/* Units */}
                                    <div className="w-16 flex-shrink-0 text-center">
                                       {call.assigned_units?.length > 0 ? (
                                           <span className="text-[10px] font-mono font-bold text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded border border-green-700/30">
                                               {call.assigned_units.length} UNIT{call.assigned_units.length > 1 ? 'S' : ''}
                                           </span>
                                       ) : isUnassigned ? (
                                           <span className="text-[10px] font-mono font-bold text-red-400 bg-red-900/30 px-1 py-0.5 rounded border border-red-700/30 animate-pulse">
                                               UNSGN
                                           </span>
                                       ) : (
                                           <span className="text-[10px] font-mono text-slate-600">EXT</span>
                                       )}
                                    </div>

                                    {/* Mark Cleared */}
                                    {isDispatchOrAdmin && (
                                       <div className="w-14 flex-shrink-0 flex items-center justify-center">
                                           <button
                                               onClick={(e) => handleMarkCleared(call, e)}
                                               title="Mark as Cleared"
                                               className="flex items-center gap-1 px-1.5 py-1 rounded bg-slate-700 hover:bg-green-700/60 text-slate-400 hover:text-green-300 font-mono text-[9px] font-bold transition-all border border-slate-600 hover:border-green-600/50"
                                           >
                                               <CheckCheck className="w-3 h-3" />CLR
                                           </button>
                                       </div>
                                    )}
                                    </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── RIGHT COLUMN ── */}
                <div className="flex flex-col border-t border-slate-800 lg:border-t-0 min-h-0">

                    {/* UNIT STATUS BOARD */}
                    <div className="flex flex-col" style={{ maxHeight: '50%' }}>
                        <PanelHeader count={activeUnits.length} accent="blue">UNIT STATUS BOARD</PanelHeader>
                        
                        {/* Mini status summary */}
                        <div className="grid grid-cols-4 border-b border-slate-800 flex-none">
                            {[
                                { label: 'AVAIL', val: availUnits.length, color: 'text-green-400' },
                                { label: 'ENRT', val: enrouteUnits.length, color: 'text-yellow-400' },
                                { label: 'SCNE', val: onSceneUnits.length, color: 'text-blue-400' },
                                { label: 'BUSY', val: busyUnits.length, color: 'text-orange-400' },
                            ].map(({ label, val, color }) => (
                                <div key={label} className="flex flex-col items-center py-1.5 border-r last:border-r-0 border-slate-800">
                                    <span className={`text-base font-mono font-bold leading-none ${color}`}>{val}</span>
                                    <span className="text-[8px] text-slate-600 font-mono tracking-wider">{label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {activeUnits.length === 0 ? (
                                <div className="py-6 text-center text-slate-600 font-mono text-[10px] tracking-widest">NO UNITS ONLINE</div>
                            ) : activeUnits.map(unit => {
                                const cfg = UNIT_STATUS_COLORS[unit.status] || UNIT_STATUS_COLORS['Out of Service'];
                                return (
                                    <div key={unit.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 hover:bg-slate-800/30">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white font-mono text-[11px] font-bold truncate">
                                                {unit.unit_number ? `UNIT-${unit.unit_number}` : unit.full_name?.toUpperCase()}
                                            </div>
                                            {unit.current_call_info && <div className="text-slate-500 text-[9px] font-mono truncate">{unit.current_call_info}</div>}
                                        </div>
                                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${cfg.badge}`}>
                                            {(unit.status || 'UNK').substring(0,6).toUpperCase()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* QUICK NAV */}
                    <div className="border-t border-slate-800">
                        <PanelHeader accent="gold">QUICK ACCESS</PanelHeader>
                        <div className="p-2 grid grid-cols-2 gap-1.5">
                            {[
                                { label: 'DISPATCH CTR', icon: Zap, page: 'DispatchCenter', color: 'border-gold/40 text-gold hover:bg-gold/10' },
                                { label: 'LIVE MAP', icon: MapPin, page: 'Navigation', color: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                                ...(isAdmin ? [
                                       { label: 'PERSONNEL', icon: Users, page: 'Personnel', color: 'border-green-500/40 text-green-400 hover:bg-green-500/10' },
                                       { label: 'REPORTS', icon: TrendingUp, page: 'Reports', color: 'border-purple-500/40 text-purple-400 hover:bg-purple-500/10' },
                                       { label: 'CALL HISTORY', icon: Radio, page: 'CallHistory', color: 'border-slate-500/40 text-slate-400 hover:bg-slate-500/10' },
                                       { label: 'ADMIN', icon: Shield, page: 'AdminPortal', color: 'border-slate-500/40 text-slate-400 hover:bg-slate-500/10' },
                                   ] : [
                                       { label: 'CALL HISTORY', icon: Radio, page: 'CallHistory', color: 'border-slate-500/40 text-slate-400 hover:bg-slate-500/10' },
                                   ]),
                                ].map(({ label, icon: Icon, page, color }) => (
                                <button key={page} onClick={() => navigate(createPageUrl(page))}
                                    className={`flex items-center gap-1.5 px-2 py-2 rounded border bg-transparent font-mono text-[10px] font-bold transition-all ${color}`}>
                                    <Icon className="w-3 h-3 flex-shrink-0" />{label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* UNASSIGNED CALLS ALERT */}
                    {unassigned.length > 0 && (
                        <div className="border-t-2 border-yellow-600/60 bg-yellow-950/20">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-yellow-800/30">
                                <AlertTriangle className="w-3 h-3 text-yellow-400 animate-pulse" />
                                <span className="text-yellow-300 font-mono font-bold text-[10px] tracking-widest">NEEDS ASSIGNMENT ({unassigned.length})</span>
                            </div>
                            <div className="px-3 py-1.5 space-y-1">
                                {unassigned.slice(0, 4).map(call => (
                                    <div key={call.id}
                                        onClick={() => navigate(createPageUrl('DispatchCenter'))}
                                        className="flex items-start gap-1.5 cursor-pointer hover:bg-yellow-950/30 px-1 py-0.5 rounded">
                                        <span className="text-yellow-600 font-mono text-[9px] mt-0.5">►</span>
                                        <div className="min-w-0">
                                            <div className="text-yellow-300 font-mono text-[10px] font-bold truncate">{cleanIncident(call)}</div>
                                            <div className="text-yellow-600 font-mono text-[9px] truncate">{call.location}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}