import { cadReference } from '@/lib/cadReference';
import useCadRoster from '@/hooks/useCadRoster';
import { cadDestination } from '@/lib/cadNavigation';
import { canEditIncidentPriority } from '@/lib/dispatchPermissions';
import LiveCommandWorkspace from '@/components/dispatch/LiveCommandWorkspace';
import OfficerDutyStatusControl from '@/components/dispatch/OfficerDutyStatusControl';
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { isDispatchAlertMuted, setDispatchAlertMuted } from '@/utils/alertUtils';
import { incidentPriority as getCallPriority } from '@/lib/incidentPriority';
import { cleanIncident } from '@/utils/callUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import { DashboardDataProvider, useDashboardData } from '@/lib/DashboardDataContext';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';
import { persistOfficerStatus, getLastOfficerStatus } from '@/lib/officerStatusService';
import { useAuth } from '@/lib/AuthContext';
import AdminLiveLocationPrivacy from '@/components/dispatch/AdminLiveLocationPrivacy';

const MY_STATUSES = ['Available', 'Enroute', 'On Scene', 'Busy', 'Out of Service'];
const DISPATCH_STATUSES = ['Dispatch', 'Available', 'Out of Service'];

function isPulsePointCall(call) {
    const sourceChannel = String(call?.source_channel || '').toLowerCase();
    const externalId = String(call?.external_call_id || '').toLowerCase();
    const source = String(call?.source || '').toLowerCase();
    return sourceChannel.includes('pulsepoint') || externalId.startsWith('pulsepoint:') || source === 'pulsepoint';
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

// Inner dashboard — consumes context
function CommandDashboardInner() {
    const navigate = useNavigate();
    const { calls, loading, lastRefresh, rateLimited, manualRefresh } = useDashboardData();
    const { user: authenticatedUser } = useAuth();

    const [currentUser, setCurrentUser] = useState(() => authenticatedUser ? { ...authenticatedUser, status: authenticatedUser.status || getLastOfficerStatus() || 'Out of Service' } : null);
    const [soundEnabled, setSoundEnabled]       = useState(() => !isDispatchAlertMuted());
    const [syncStatus, setSyncStatus]           = useState({ state: 'syncing', lastSync: null, added: 0, updated: 0, total: 0, error: null });
    const [selectedCall, setSelectedCall] = useState(null);
    const [statusSaving,setStatusSaving] = useState(false);
    const {rows:roster,loading:rosterLoading,error:rosterError,refresh:refreshRoster}=useCadRoster();
    const [, setTick]                           = useState(0);

    const soundEnabledRef        = useRef(!isDispatchAlertMuted());

    // Re-render every second for live elapsed timers
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!authenticatedUser) return;
        const cachedStatus = getLastOfficerStatus();
        setCurrentUser({
            ...authenticatedUser,
            status: (authenticatedUser.status === 'On Patrol' ? 'Available' : authenticatedUser.status) || cachedStatus || 'Out of Service',
        });
        const val = !isDispatchAlertMuted();
        setSoundEnabled(val);
        soundEnabledRef.current = val;
    }, [authenticatedUser]);

    useEffect(() => {
        const syncStatus = event => {
            const detail = event?.detail || {};
            const next = detail.status;
            if (detail.officer_id && detail.officer_id !== authenticatedUser?.id) return;
            if (detail.email && String(detail.email).toLowerCase() !== String(authenticatedUser?.email || '').toLowerCase()) return;
            if (next) setCurrentUser(previous => previous ? { ...previous, status: next } : previous);
        };
        window.addEventListener('bps-officer-status-changed', syncStatus);
        return () => window.removeEventListener('bps-officer-status-changed', syncStatus);
    }, [authenticatedUser?.id, authenticatedUser?.email]);

    // Backend automation "Ingest gractivecalls.com" syncs calls every 5 min with geocoding.
    // Frontend just displays data — no redundant LLM polling (was causing rate-limit lockouts).
    useEffect(() => {
        // The visible queue is already live through persisted rows + realtime
        // subscriptions. Do not leave the command board saying AWAITING SYNC while
        // a slower ingestion/recovery request finishes in the background.
        if (!loading) {
            setSyncStatus({ state: 'ok', lastSync: lastRefresh || new Date(), added: 0, updated: 0, total: calls.length, error: null });
        }
    }, [lastRefresh, loading, calls.length]);


    const handleStatusChange = async (newStatus) => {
        if (statusSaving) return;
        setStatusSaving(true);
        const previousStatus = currentUser?.status;
        try {
            setCurrentUser(prev => ({ ...prev, status: newStatus }));
            const payload = await persistOfficerStatus(newStatus, { force: true });
            if (payload.error) throw new Error(payload.error);
        } catch (e) {
            console.warn('[CAD] status persist failed:', e?.message);
            setCurrentUser(prev => ({ ...prev, status: previousStatus || 'Out of Service' }));
            const message = e?.response?.data?.error || e?.message || 'Unable to change status';
            window.alert(message);
        } finally {
            setStatusSaving(false);
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

    const handlePriorityOverride = async (call, next) => {
        if (!canEditIncidentPriority(currentUser)) throw new Error('Dispatcher role required');
        const response = await base44.functions.invoke('updateCadCallPriority', { call_id: call.id, priority: next });
        const payload = response?.data || {};
        if (payload.error) throw new Error(payload.error);
        setSelectedCall(previous => previous?.id === call.id ? {...previous,priority:next,priority_override:true} : previous);
        await manualRefresh();
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
        navigate(cadDestination('Navigation',params));
    };

    const getCallIdentifier = (call) => {
        if (isPulsePointCall(call)) return { value: cadReference(call)||'Reference Pending', type: 'pulsepoint' };
        const official = String(call?.agency_cad_number || (call?.official_cad_verified ? call?.call_id : '') || '').trim();
        const compactBps = (value) => String(value || '').trim().replace(/^(BPS-\d{6}-)0+(\d+)$/i, '$1$2');
        const bps = compactBps(call?.bps_reference);
        const legacy = compactBps(call?.call_id);
        if (official) return { value: official, type: 'official' };
        if (bps) return { value: bps, type: 'bps' };
        if (legacy && cadReference(call) && !/^B\d+$/i.test(legacy)) return { value: legacy, type: /^BPS-/i.test(legacy) ? 'bps' : 'official' };
        return { value: 'REFERENCE PENDING', type: 'pending' };
    };

    const cadOfficerUnits = roster.filter(isOperationalOfficer);
    // Dispatchers who mark themselves "Dispatch" are running the board, not working
    // the street — pull them off the unit status board so only field units appear.
    const statusUnits = cadOfficerUnits;
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

    return <>
      <LiveCommandWorkspace calls={calls} allCalls={calls} units={statusUnits} loading={loading} syncStatus={syncStatus} rateLimited={rateLimited} onRefresh={()=>{manualRefresh();refreshRoster(true);}} rosterLoading={rosterLoading} rosterError={rosterError} onRetryRoster={()=>refreshRoster(true)}
        onOpen={setSelectedCall} selectedCall={selectedCall} onClose={()=>setSelectedCall(null)} onMap={openCallOnMap} onPriority={handlePriorityOverride} onClear={handleMarkCleared}
        canChangePriority={canEditIncidentPriority(currentUser)} canClear={isDispatchOrAdmin}
        priorityOf={getCallPriority} identifierOf={getCallIdentifier} incidentOf={cleanIncident} timeOf={fmtTime} elapsedOf={elapsed} isExternal={isPulsePointCall}
        actions={<><button type="button" onClick={()=>navigate(cadDestination('CallHistory'))} className="min-h-10 rounded border border-cyan-700 px-3 text-sm">Call / property history</button><button type="button" onClick={()=>{const params=new URLSearchParams({new:'1'});if(selectedCall?.id){params.set('call_id',selectedCall.id);params.set('call_number',getCallIdentifier(selectedCall).value);}navigate(cadDestination('BOLOAlerts',params));}} className="min-h-10 rounded-lg border border-red-700 bg-red-950/50 px-4 text-sm font-semibold text-red-100">New BOLO</button><button type="button" aria-pressed={soundEnabled} onClick={toggleSound} className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm">Audio {soundEnabled?'on':'off'}</button><OfficerDistressButton currentUser={currentUser}/></>}
        settings={<><OfficerDutyStatusControl user={currentUser} status={currentUser?.status} statuses={myStatuses} onChange={handleStatusChange} saving={statusSaving}/><AdminLiveLocationPrivacy currentUser={currentUser}/></>}
      />
    </>;

}

export default function CommandDashboard() {
    return (
        <DashboardDataProvider>
            <CommandDashboardInner />
        </DashboardDataProvider>
    );
}