import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { normalizeRank } from '@/utils/rankDisplay';
import { isDispatchAlertMuted, setDispatchAlertMuted } from '@/utils/alertUtils';
import { classifyCall } from '@/lib/cadCallTypes';
import { cleanIncident } from '@/utils/callUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressBanner from '@/components/dispatch/OfficerDistressBanner';
import FieldCallModal from '@/components/dispatch/FieldCallModal';
import ActiveBoloBanner from '@/components/bolo/ActiveBoloBanner';
import CADUnitStatusBoard from '@/components/dispatch/CADUnitStatusBoard';
import AutoDispatchShadowFeed from '@/components/dispatch/AutoDispatchShadowFeed';
import { DashboardDataProvider, useDashboardData } from '@/lib/DashboardDataContext';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { MapPin, Users, Shield, AlertTriangle, Radio, ChevronRight, RotateCcw, CheckCheck, WifiOff, CircleX, FileWarning } from 'lucide-react';
import { formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';
import { getOfficerLocationSnapshot } from '@/lib/officerLocationHub';

const PRIORITY_CONFIG = {
    critical: { label: 'P1', color: '#ef4444', bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500', row: 'bg-red-950/30 hover:bg-red-950/50', badge: 'bg-red-500/20 text-red-300 border-red-500/40' },
    high:     { label: 'P2', color: '#f97316', bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500', row: 'bg-orange-950/20 hover:bg-orange-950/40', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
    medium:   { label: 'P3', color: '#eab308', bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500', row: 'bg-slate-900 hover:bg-slate-800/60', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
    low:      { label: 'P4', color: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500', row: 'bg-slate-900 hover:bg-slate-800/60', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
};

const UNIT_STATUS_COLORS = {
    Available:        { dot: 'bg-green-400',  text: 'text-green-300',  badge: 'bg-green-900/40 text-green-300 border-green-600/50' },
    Dispatched:       { dot: 'bg-cyan-400',   text: 'text-cyan-300',   badge: 'bg-cyan-900/40 text-cyan-300 border-cyan-600/50' },
    'On Patrol':      { dot: 'bg-indigo-400', text: 'text-indigo-300', badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-600/50' },
    Enroute:          { dot: 'bg-yellow-400', text: 'text-yellow-300', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-600/50' },
    'On Scene':       { dot: 'bg-blue-400',   text: 'text-blue-300',   badge: 'bg-blue-900/40 text-blue-300 border-blue-600/50' },
    Busy:             { dot: 'bg-orange-400', text: 'text-orange-300', badge: 'bg-orange-900/40 text-orange-300 border-orange-600/50' },
    'Out of Service': { dot: 'bg-gray-500',   text: 'text-gray-400',   badge: 'bg-gray-900/40 text-gray-400 border-gray-600/50' },
    Dispatch:         { dot: 'bg-cyan-400',    text: 'text-cyan-300',    badge: 'bg-cyan-900/40 text-cyan-300 border-cyan-600/50' },
};

const MY_STATUSES = ['Available', 'On Patrol', 'Enroute', 'On Scene', 'Busy', 'Out of Service'];
const DISPATCH_STATUSES = ['Dispatch', 'Available', 'Out of Service'];

function getCallPriority(call) {
    if (call.priority_override && call.priority) return call.priority;
    const classification = classifyCall(`${call.incident || ''} ${call.description || ''}`);
    if (classification.matched_type) return classification.matched_type.priority;
    return call.priority || 'medium';
}

// Display time in ET, 12-hour format
function fmtTime(dateStr) {
    if (!dateStr) return '----';
    const d = parseServerTimestamp(dateStr);
    if (!d) return '----';
    return formatEasternTime(d);
}

// Elapsed since call was received — uses created_date as reliable fallback
function elapsed(call) {
    // Prefer time_received if it's within 24h of created_date (scraper stored it correctly)
    // Otherwise fall back to created_date (scraper had timezone bug)
    const created = call?.created_date ? parseServerTimestamp(call.created_date)?.getTime() : null;
    const received = call?.time_received ? parseServerTimestamp(call.time_received)?.getTime() : null;
    let ref = created;
    if (received && created && Math.abs(received - created) < 24 * 3600 * 1000) {
        ref = received; // time_received is trustworthy
    }
    if (!ref) return '';
    const secs = Math.floor((Date.now() - ref) / 1000);
    if (secs < 0) return '0s';
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function PanelHeader({ children, count, accent = 'gold' }) {
    const accents = { gold: 'border-t-gold', red: 'border-t-red-500', blue: 'border-t-blue-500', green: 'border-t-green-500' };
    return (
        <div className={`bg-slate-800/80 border-b border-slate-700 border-t-2 ${accents[accent]} px-3 py-2.5 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 bg-gold rounded-sm flex-shrink-0 shadow-[0_0_8px_hsl(var(--gold))]" />
                <span className="text-white font-mono font-bold text-xs tracking-widest">{children}</span>
            </div>
            {count !== undefined && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-700 border border-slate-600 text-slate-300 rounded">{count}</span>
            )}
        </div>
    );
}

// Inner dashboard — consumes context
function CommandDashboardInner() {
    const navigate = useNavigate();
    const { calls, users, loading, lastRefresh, rateLimited, manualRefresh } = useDashboardData();

    const [currentUser, setCurrentUser]         = useState(null);
    const [soundEnabled, setSoundEnabled]       = useState(() => !isDispatchAlertMuted());
    const [syncStatus, setSyncStatus]           = useState({ state: 'idle', lastSync: null, added: 0, updated: 0, total: 0, error: null });
    const [selectedCall, setSelectedCall] = useState(null);
    const [agencyFilter, setAgencyFilter] = useState('ALL');
    const [canonicalStatusUsers, setCanonicalStatusUsers] = useState([]);
    const [, setTick]                           = useState(0);

    const soundEnabledRef        = useRef(!isDispatchAlertMuted());

    // Re-render every second for live elapsed timers
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        base44.auth.me().then(user => {
            setCurrentUser(user);
            const val = !isDispatchAlertMuted();
            setSoundEnabled(val);
            soundEnabledRef.current = val;
        }).catch(() => {});

    }, []);

    useEffect(() => {
        let active = true;
        const syncUnitStatus = async () => {
            try {
                const payload = await getOfficerLocationSnapshot();
                if (active) setCanonicalStatusUsers(Array.isArray(payload.users) ? payload.users : []);
            } catch {}
        };
        syncUnitStatus();
        // DashboardDataContext already keeps the shared roster current; this is a slow
        // safety refresh so the command page does not duplicate the same backend call.
        const timer = setInterval(syncUnitStatus, 60000);
        const onStatusChanged = () => syncUnitStatus();
        window.addEventListener('bps-officer-status-changed', onStatusChanged);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener('bps-officer-status-changed', onStatusChanged);
        };
    }, []);

    // Backend automation "Ingest gractivecalls.com" syncs calls every 5 min with geocoding.
    // Frontend just displays data — no redundant LLM polling (was causing rate-limit lockouts).
    useEffect(() => {
        // Show a static "MANAGED" sync indicator since backend handles ingestion
        setSyncStatus({ state: 'ok', lastSync: lastRefresh, added: 0, updated: 0, total: 0, error: null });
    }, [lastRefresh]);


    const handleStatusChange = async (newStatus) => {
        const previousStatus = currentUser?.status;
        try {
            const response = await base44.functions.invoke('updateOfficerStatus', { status: newStatus });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            setCurrentUser(prev => ({ ...prev, status: newStatus }));
            window.dispatchEvent(new CustomEvent('bps-officer-status-changed', { detail: { officer_id: currentUser?.id, email: currentUser?.email, status: newStatus } }));
        } catch (e) {
            console.warn('[CAD] status persist failed:', e?.message);
            setCurrentUser(prev => ({ ...prev, status: previousStatus || 'Out of Service' }));
            const message = e?.response?.data?.error || e?.message || 'Unable to change status';
            window.alert(message);
        }
    };

    const toggleSound = () => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        soundEnabledRef.current = next;
        setDispatchAlertMuted(!next);
    };

    useEffect(() => {
        const syncMute = (event) => {
            const enabled = !(event?.detail?.muted ?? isDispatchAlertMuted());
            setSoundEnabled(enabled);
            soundEnabledRef.current = enabled;
        };
        window.addEventListener('bps-alert-mute-changed', syncMute);
        return () => window.removeEventListener('bps-alert-mute-changed', syncMute);
    }, []);

    const handlePriorityOverride = async (call, e) => {
        e.stopPropagation();
        const order = ['critical', 'high', 'medium', 'low'];
        const current = getCallPriority(call);
        const next = order[(order.indexOf(current) + 1) % order.length];
        const response = await base44.functions.invoke('updateCadCallPriority', { call_id: call.id, priority: next });
        const payload = response?.data || response || {};
        if (payload.error) throw new Error(payload.error);
        manualRefresh();
    };

    const handleMarkCleared = async (call, e) => {
        e.stopPropagation();
        const result = await base44.functions.invoke('updateCadCallStatus', {
            call_id: call.id,
            status: 'Cleared',
        });
        const payload = result?.data || result || {};
        if (payload.error) throw new Error(payload.error);
        manualRefresh();
    };

    const openCallOnMap = (call) => {
        if (!call?.id) return;
        const params = new URLSearchParams({ callId: call.id });
        if (Number.isFinite(Number(call.latitude)) && Number.isFinite(Number(call.longitude))) {
            params.set('lat', String(call.latitude));
            params.set('lng', String(call.longitude));
        }
        navigate(`${createPageUrl('Navigation')}?${params.toString()}`);
    };

    const getCallIdentifier = (call) => {
        const official = String(call?.agency_cad_number || (call?.official_cad_verified ? call?.call_id : '') || '').trim();
        const compactBps = (value) => String(value || '').trim().replace(/^(BPS-\d{6}-)0+(\d+)$/i, '$1$2');
        const bps = compactBps(call?.bps_reference);
        const legacy = compactBps(call?.call_id);
        if (official) return { value: official, type: 'official' };
        if (bps) return { value: bps, type: 'bps' };
        if (legacy && !/^B\d+$/i.test(legacy)) return { value: legacy, type: /^BPS-/i.test(legacy) ? 'bps' : 'official' };
        return { value: 'REFERENCE PENDING', type: 'pending' };
    };

    const visibleCalls = agencyFilter === 'ALL' ? calls : calls.filter(call => call.agency === agencyFilter);
    const sortedCalls = [...visibleCalls].sort((a, b) => {
        const getRef = (c) => {
            const created = c.created_date ? parseServerTimestamp(c.created_date)?.getTime() || 0 : 0;
            const received = c.time_received ? parseServerTimestamp(c.time_received)?.getTime() || 0 : 0;
            if (received && created && Math.abs(received - created) < 24 * 3600 * 1000) return received;
            return created;
        };
        return getRef(b) - getRef(a);
    });

    const cadOfficerUnits = (canonicalStatusUsers.length ? canonicalStatusUsers : users).filter(isOperationalOfficer);
    // Dispatchers who mark themselves "Dispatch" are running the board, not working
    // the street — pull them off the unit status board so only field units appear.
    const statusUnits    = cadOfficerUnits.filter(u => Boolean(u.status) && u.status !== 'Dispatch');
    const activeUnits    = statusUnits.filter(u => u.status !== 'Out of Service');
    const criticalCalls  = calls.filter(c => getCallPriority(c) === 'critical');
    const highCalls      = calls.filter(c => getCallPriority(c) === 'high');
    const unassigned     = calls.filter(c => (!c.assigned_units || c.assigned_units.length === 0) && !c.source);
    const availUnits     = activeUnits.filter(u => u.status === 'Available');
    const enrouteUnits   = activeUnits.filter(u => u.status === 'Enroute');
    const onSceneUnits   = activeUnits.filter(u => u.status === 'On Scene');
    const busyUnits      = activeUnits.filter(u => u.status === 'Busy');

    const isAdmin            = currentUser?.role === 'admin';
    const isDispatchOrAdmin  = isAdmin || currentUser?.is_supervisor || currentUser?.dispatch_role;
    const currentRoles = new Set((currentUser?.additional_roles || []).map(r => String(r).trim().toLowerCase()));
    const operationalRank = ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'].includes(String(currentUser?.rank || '').trim().toLowerCase());
    const hasFieldStatusAccess = isAdmin || currentUser?.is_supervisor || currentRoles.has('full_access') || currentRoles.has('supervisor') || currentRoles.has('officer') || currentRoles.has('cad_access') || operationalRank;
    const hasDispatchAccess = currentUser?.role === 'dispatch' || currentRoles.has('dispatch') || !!currentUser?.dispatch_role;
    // Only a pure dispatcher gets the reduced Dispatch/Available/OOS set. Command
    // staff and field officers keep the full officer status set even when they also
    // have dispatch access (for example Colonel/full-access users).
    const myStatuses = hasFieldStatusAccess
        ? [...MY_STATUSES, ...(hasDispatchAccess ? ['Dispatch'] : [])]
        : DISPATCH_STATUSES;

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" />
                <p className="text-gold font-mono text-xs tracking-widest">INITIALIZING COMMAND SYSTEM...</p>
            </div>
        </div>
    );

    return (
        <div className="bps-command-page command-dashboard min-h-full min-w-0 overflow-x-hidden bg-slate-950 flex flex-col">
            <OfficerDistressBanner currentUser={currentUser} isDispatchOrAdmin={isDispatchOrAdmin} />
            <ActiveBoloBanner />
            {isDispatchOrAdmin && <AutoDispatchShadowFeed />}

            {/* ── SYSTEM HEADER BAR ── */}
            <div className="command-dashboard-system-bar flex-none bg-slate-900 border-b-2 border-gold/60 px-3 py-2 flex items-center gap-3">
                <div className="command-dashboard-spacer flex-1" />
                <div className="command-dashboard-actions flex items-center gap-1.5">
                    {/* Sync status */}
                    <div className={`command-dashboard-sync h-9 flex items-center justify-center gap-1.5 px-2 rounded border font-mono text-[10px] font-bold flex-shrink-0 ${
                        syncStatus.state === 'syncing' ? 'bg-blue-900/30 border-blue-600/40 text-blue-300' :
                        syncStatus.state === 'error'   ? 'bg-red-900/30 border-red-600/40 text-red-300' :
                        syncStatus.state === 'ok'      ? 'bg-green-900/30 border-green-600/40 text-green-300' :
                        'bg-slate-800 border-slate-600 text-slate-500'
                    }`}>
                        {syncStatus.state === 'syncing' ? (
                            <><RotateCcw className="w-3 h-3 animate-spin" />SYNCING...</>
                        ) : syncStatus.state === 'error' ? (
                            <><WifiOff className="w-3 h-3" />SYNC ERR</>
                        ) : syncStatus.lastSync ? (
                            <><span className="w-1.5 h-1.5 rounded-full bg-green-400" />+{syncStatus.added} @ {fmtTime(syncStatus.lastSync)}</>
                        ) : (
                            <><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />AWAITING SYNC</>
                        )}
                    </div>
                    <button onClick={() => {
                        const params = new URLSearchParams({ new: '1' });
                        if (selectedCall?.id) {
                            params.set('call_id', selectedCall.id);
                            params.set('call_number', selectedCall.agency_cad_number || selectedCall.bps_reference || selectedCall.call_id || selectedCall.id);
                        }
                        navigate(`${createPageUrl('BOLOAlerts')}?${params.toString()}`);
                    }} className="command-dashboard-action h-9 flex min-w-0 items-center justify-center gap-1 px-2 bg-red-800 border border-red-600 text-white font-mono font-bold text-[10px] rounded hover:bg-red-700 transition-colors">
                        <FileWarning className="w-3 h-3" />NEW BOLO
                    </button>
                    <OfficerDistressButton currentUser={currentUser} className="command-dashboard-distress" />
                </div>

            </div>

            {/* ── SYNC ERROR BANNER ── */}
            {syncStatus.state === 'error' && syncStatus.error && !rateLimited && (
                <div className="flex-none flex items-center gap-3 bg-red-950/80 border-b border-red-800/60 px-4 py-1.5">
                    <WifiOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="text-red-300 font-mono text-[10px] font-bold tracking-wide flex-1 truncate">
                        SYNC FAILED: {syncStatus.error}
                    </span>
                </div>
            )}

            {/* ── MASTER STATUS TILES ── */}
            <div className="command-dashboard-kpis flex-none grid grid-cols-2 gap-2 border-b border-slate-800 bg-[#080d16] p-2 sm:grid-cols-4 md:grid-cols-8">
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
                    <div key={label} className={`command-dashboard-kpi ${bg} rounded-xl border border-slate-700/80 px-2 py-3 flex min-w-0 flex-col items-center justify-center text-center shadow-lg ${flash ? 'animate-pulse' : ''}`}>
                        <span className={`text-2xl md:text-3xl font-mono font-black leading-none ${color} drop-shadow-[0_0_10px_currentColor]`}>{val}</span>
                        <span className="text-[9px] text-slate-500 font-mono font-bold tracking-widest mt-1 text-center">{label}</span>
                    </div>
                ))}
            </div>

            {/* ── MY STATUS BAR ── */}
            {currentUser && (
                <div className="flex-none flex items-center gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800 overflow-x-auto">
                    {currentUser.profile_photo_url ? (
                        <img src={currentUser.profile_photo_url} alt="" className="h-8 w-8 flex-shrink-0 rounded-full border border-gold/50 object-cover" />
                    ) : (
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[10px] font-black text-slate-300">
                            {(currentUser.first_name?.[0] || '')}{(currentUser.last_name?.[0] || '')}
                        </div>
                    )}
                    <span className="text-slate-400 font-mono text-[10px] tracking-widest flex-shrink-0">
                        {currentUser.rank && currentUser.last_name
                          ? `${normalizeRank(currentUser.rank)} ${currentUser.last_name}`.toUpperCase()
                          : currentUser.unit_number
                            ? `UNIT-${currentUser.unit_number}`
                            : currentUser.full_name?.toUpperCase()} STATUS:
                    </span>
                    <div className="flex min-w-max items-center gap-1.5">
                        {myStatuses.map(s => {
                            const cfg = UNIT_STATUS_COLORS[s];
                            const isActive = currentUser.status === s;
                            return (
                                <button key={s} onClick={() => handleStatusChange(s)}
                                    className={`h-7 whitespace-nowrap px-2.5 rounded-md font-mono text-[10px] font-bold border transition-all ${
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
            <div className="flex-1 grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">

                {/* ── CALL QUEUE (3 cols) ── */}
                <div className="flex min-h-0 min-w-0 flex-col border-r border-slate-800">
                    <div className="flex items-center justify-between gap-3 bg-slate-800/80 border-b border-slate-700 border-t-2 border-t-gold px-3 py-2.5">
                        <div className="flex items-center gap-2"><div className="w-1.5 h-5 bg-gold rounded-sm" /><span className="text-white font-mono font-bold text-xs tracking-widest">ACTIVE INCIDENT QUEUE</span><span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-700 border border-slate-600 text-slate-300 rounded">{visibleCalls.length}</span></div>
                        <select value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} className="bg-slate-900 border border-slate-600 text-slate-200 text-[10px] font-mono rounded px-2 py-1">
                            <option value="ALL">ALL AGENCIES</option><option value="RPD">RPD</option><option value="RFD">RFD</option><option value="HPD">HPD</option><option value="HFD">HFD</option><option value="CCPD">CCPD</option><option value="CCFD">CCFD</option>
                        </select>
                    </div>

                    <div className="hidden md:flex items-center bg-slate-900 border-b border-slate-700 px-3 py-1 text-[9px] font-mono text-slate-500 tracking-widest flex-none">
                        <div className="w-8 flex-shrink-0">PRI</div>
                        <div className="w-36 flex-shrink-0">CAD / REF · TIME (ET)</div>
                        <div className="w-20 flex-shrink-0 hidden md:block">ELAPSED</div>
                        <div className="flex-1">INCIDENT / LOCATION</div>
                        <div className="w-24 flex-shrink-0 hidden lg:block">AGENCY</div>
                        <div className="w-20 flex-shrink-0 text-center">STATUS</div>
                        <div className="w-16 flex-shrink-0 text-center">UNITS</div>
                        {isDispatchOrAdmin && <div className="w-14 flex-shrink-0 text-center">MARK</div>}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {sortedCalls.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-slate-600 font-mono text-xs tracking-widest">
                                — NO ACTIVE INCIDENTS —
                            </div>
                        ) : sortedCalls.map((call) => {
                            const priority = getCallPriority(call);
                            const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
                            const isUnassigned = (!call.assigned_units || call.assigned_units.length === 0) && !call.source;
                            const identifier = getCallIdentifier(call);
                            return (
                                <div key={call.id}
                                    onClick={() => openCallOnMap(call)}
                                    className={`cad-call-row flex items-start px-3 py-2 border-b border-slate-800/60 cursor-pointer transition-colors ${cfg.row} ${priority === 'critical' ? 'border-l-2 border-l-red-500' : priority === 'high' ? 'border-l-2 border-l-orange-500' : 'border-l-2 border-l-transparent'}`}>

                                    <div className="cad-call-priority w-8 flex-shrink-0 pt-0.5">
                                        {isAdmin ? (
                                            <button onClick={(e) => handlePriorityOverride(call, e)}
                                                className={`text-[10px] font-mono font-bold ${cfg.text} hover:ring-1 ring-current rounded px-0.5 transition-all`}>
                                                {cfg.label}
                                            </button>
                                        ) : (
                                            <span className={`text-[10px] font-mono font-bold ${cfg.text}`}>{cfg.label}</span>
                                        )}
                                    </div>

                                    <div className="cad-call-time w-36 flex-shrink-0 font-mono text-[10px] text-slate-400 pt-0.5">
                                        <div
                                            className={`font-bold whitespace-nowrap overflow-hidden text-ellipsis ${identifier.type === 'bps' ? 'text-[#f5c451]' : identifier.type === 'official' ? 'text-[#7ec1ff]' : 'text-slate-500'}`}
                                            title={identifier.type === 'official' ? `Official agency CAD: ${identifier.value}` : identifier.type === 'bps' ? `BPS reference: ${identifier.value}` : identifier.value}
                                        >
                                            {identifier.value}
                                        </div>
                                        <div>{fmtTime(call.time_received)}</div>
                                    </div>

                                    <div className="w-20 flex-shrink-0 font-mono text-[10px] text-slate-500 hidden md:block pt-0.5">
                                        {elapsed(call)}
                                    </div>

                                    <div className="cad-call-incident flex-1 min-w-0 pr-2">
                                        <div className="text-white font-mono font-bold text-xs leading-snug flex items-start gap-1">
                                            {(!call.latitude || !call.longitude) && (
                                                <CircleX className="w-3 h-3 flex-shrink-0 text-red-500 mt-0.5" title="Not geocoded" />
                                            )}
                                            <span className="break-words">{cleanIncident(call)}</span>
                                        </div>
                                        <div className="text-slate-400 font-mono text-[10px] leading-snug flex items-start gap-1 mt-0.5">
                                            <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-slate-600 mt-0.5" />
                                            <span className="break-words">{call.location}{call.cross_street ? <span className="text-slate-600 ml-1">@ {call.cross_street}</span> : ''}</span>
                                        </div>
                                    </div>

                                    <div className="w-24 flex-shrink-0 hidden lg:block pt-0.5">
                                        <span className="text-slate-500 font-mono text-[10px] break-words">{call.agency || '—'}</span>
                                    </div>

                                    <div className="cad-call-status w-20 flex-shrink-0 text-center pt-0.5">
                                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                            call.status === 'New' ? 'bg-red-900/40 text-red-300 border-red-700/40' :
                                            call.status === 'Dispatched' || call.status === 'Enroute' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40' :
                                            call.status === 'On Scene' || call.status === 'On Scene' ? 'bg-blue-900/40 text-blue-300 border-blue-700/40' :
                                            'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>{(call.status || 'NEW').toUpperCase()}</span>
                                    </div>

                                    <div className="cad-call-units w-16 flex-shrink-0 text-center">
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

                                    {isDispatchOrAdmin && (
                                        <div className="cad-call-clear w-14 flex-shrink-0 flex items-center justify-center">
                                            <button onClick={(e) => handleMarkCleared(call, e)}
                                                className="flex items-center gap-1 px-1.5 py-1 rounded bg-slate-700 hover:bg-green-700/60 text-slate-400 hover:text-green-300 font-mono text-[9px] font-bold transition-all border border-slate-600 hover:border-green-600/50">
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
                <div className="flex min-h-0 flex-col border-t border-slate-800 bg-[#07101b] lg:border-l lg:border-t-0">

                    <div className="flex min-h-[260px] flex-col lg:max-h-[54%]">
                        <CADUnitStatusBoard units={statusUnits} compact currentUser={currentUser} />
                    </div>

                    <div className="border-t border-slate-800 bg-[#0a1220]">
                        <div className="flex items-center gap-2 px-3 pb-1 pt-3"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /><span className="text-[9px] font-black tracking-[0.18em] text-slate-400">QUICK ACCESS</span></div>
                        <div className="grid grid-cols-2 gap-2 p-3 pt-2">
                            {[
                                { label: 'BOLO / ALERTS', icon: FileWarning, page: 'BOLOAlerts', color: 'border-red-500/40 text-red-400 hover:bg-red-500/10' },
                                { label: 'LIVE MAP', icon: MapPin, page: 'Navigation', color: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                                ...(isAdmin ? [
                                    { label: 'PERSONNEL', icon: Users, page: 'Personnel', color: 'border-green-500/40 text-green-400 hover:bg-green-500/10' },
                                    { label: 'CALL HISTORY', icon: Radio, page: 'CallHistory', color: 'border-slate-500/40 text-slate-400 hover:bg-slate-500/10' },
                                    { label: 'ADMIN', icon: Shield, page: 'AdminPortal', color: 'border-slate-500/40 text-slate-400 hover:bg-slate-500/10' },
                                ] : [
                                    { label: 'CALL HISTORY', icon: Radio, page: 'CallHistory', color: 'border-slate-500/40 text-slate-400 hover:bg-slate-500/10' },
                                ]),
                            ].map(({ label, icon: Icon, page, color }) => (
                                <button key={page} onClick={() => navigate(createPageUrl(page))}
                                    className={`group flex min-h-12 items-center gap-2 rounded-xl border bg-[#0d1725] px-3 py-2 text-left font-mono text-[9px] font-black tracking-wide transition-all hover:-translate-y-0.5 hover:shadow-lg ${color}`}>
                                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-black/20"><Icon className="h-3.5 w-3.5" /></span><span className="leading-tight">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {unassigned.length > 0 && (
                        <div className="border-t-2 border-yellow-600/60 bg-yellow-950/20">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-yellow-800/30">
                                <AlertTriangle className="w-3 h-3 text-yellow-400 animate-pulse" />
                                <span className="text-yellow-300 font-mono font-bold text-[10px] tracking-widest">NEEDS ASSIGNMENT ({unassigned.length})</span>
                            </div>
                            <div className="px-3 py-1.5 space-y-1">
                                {unassigned.slice(0, 4).map(call => (
                                    <div key={call.id} onClick={() => openCallOnMap(call)}
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
            <FieldCallModal call={selectedCall} onClose={() => setSelectedCall(null)} />
        </div>
    );
}

export default function CommandDashboard() {
    return (
        <DashboardDataProvider>
            <CommandDashboardInner />
        </DashboardDataProvider>
    );
}