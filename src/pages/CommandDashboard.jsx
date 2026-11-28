import usePropertyAssignmentCalls from '@/hooks/usePropertyAssignmentCalls';
import {cadScaleValue,readCadDisplaySettings,writeCadDisplaySettings} from '@/lib/cadDisplaySettings';
import useCadMonitorSelection from '@/hooks/useCadMonitorSelection';
import CadIncidentMonitor from '@/components/dispatch/cad/CadIncidentMonitor';
import { cadReference } from '@/lib/cadReference';
import useCadRoster from '@/hooks/useCadRoster';
import LiveCommandWorkspace from '@/components/dispatch/LiveCommandWorkspace';
import OfficerDutyStatusControl from '@/components/dispatch/OfficerDutyStatusControl';
import { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useLocation } from 'react-router-dom';
import { incidentPriority as getCallPriority } from '@/lib/incidentPriority';
import { cleanIncident } from '@/utils/callUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import { DashboardDataProvider, useDashboardData, useOptionalDashboardData } from '@/lib/DashboardDataContext';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';
import { persistOfficerStatus, getLastOfficerStatus } from '@/lib/officerStatusService';
import { useAuth } from '@/lib/AuthContext';
import AdminLiveLocationPrivacy from '@/components/dispatch/AdminLiveLocationPrivacy';

const MY_STATUSES = ['Available', 'Enroute', 'On Scene', 'Busy', 'Out of Service'];
const DISPATCH_STATUSES = ['Dispatch', 'Available', 'Out of Service'];

// Display time in ET, 12-hour format
function fmtTime(dateStr) {
    if (!dateStr) return '----';
    const d = parseServerTimestamp(dateStr);
    if (!d) return '----';
    return formatEasternTime(d);
}

// One trusted received-time source for both the elapsed timer and incident order.
// Ignore an imported received timestamp that differs from creation by >=24h.
function elapsedAnchor(call) {
    const created = call?.created_date ? parseServerTimestamp(call.created_date)?.getTime() : null;
    const received = call?.time_received ? parseServerTimestamp(call.time_received)?.getTime() : null;
    if (received && created && Math.abs(received - created) < 24 * 3600 * 1000) return received;
    return created || received || null;
}
function elapsed(call) {
    const ref = elapsedAnchor(call);
    if (!ref) return '';
    const secs = Math.max(0, Math.floor((Date.now() - ref) / 1000));
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

// Inner dashboard — consumes context
function CommandDashboardInner({embedded=false}) {
    const [monitor,setMonitor]=useState(()=>readCadDisplaySettings().monitor);
    const toggleMonitor=()=>setMonitor(previous=>writeCadDisplaySettings({...readCadDisplaySettings(),monitor:!previous}).monitor);
    const [localScale,setLocalScale]=useState(()=>readCadDisplaySettings().scale);
    const location=useLocation();
    const { calls, loading, lastRefresh, rateLimited, manualRefresh } = useDashboardData();
    const { user: authenticatedUser } = useAuth();
    const {ids:propertyIds,error:propertyError}=usePropertyAssignmentCalls();
    const {ids:monitoredIds,toggle:togglePin}=useCadMonitorSelection(authenticatedUser?.id||authenticatedUser?.email);
    useEffect(()=>{const sync=()=>{const next=readCadDisplaySettings();setLocalScale(next.scale);setMonitor(next.monitor);};window.addEventListener('storage',sync);window.addEventListener('bps-cad-display-changed',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('bps-cad-display-changed',sync);};},[]);

    const [currentUser, setCurrentUser] = useState(() => authenticatedUser ? { ...authenticatedUser, status: authenticatedUser.status || getLastOfficerStatus() || 'Out of Service' } : null);
    const [syncStatus, setSyncStatus]           = useState({ state: 'syncing', lastSync: null, added: 0, updated: 0, total: 0, error: null });
    const [selectedCall, setSelectedCall] = useState(null);
    const [statusSaving,setStatusSaving] = useState(false);
    const {rows:roster,loading:rosterLoading,error:rosterError,refresh:refreshRoster}=useCadRoster();
    const [, setTick]                           = useState(0);
    // CAD status bar / command palette deep links: pre-filter the queue and open
    // the requested incident without changing any other board behaviour.
    const cadFocus = useMemo(() => new URLSearchParams(location.search).get('cad_focus') || 'all', [location.search]);
    const linkedCallId = useMemo(() => new URLSearchParams(location.search).get('call_id'), [location.search]);
    const linkedCallApplied = useRef(null);
    useEffect(() => {
        if (!linkedCallId){linkedCallApplied.current=null;return;}
        if (linkedCallApplied.current===linkedCallId || !calls.length) return;
        const match = calls.find(call => String(call.id) === String(linkedCallId));
        if (!match) return;
        linkedCallApplied.current = linkedCallId;
        setSelectedCall(match);
    }, [linkedCallId, calls]);


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

    const getCallIdentifier = (call) => {
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
      {!embedded&&monitor&&<CadIncidentMonitor calls={calls} loading={loading} onOpen={setSelectedCall} onCollapse={toggleMonitor} selectedIds={monitoredIds} onTogglePin={togglePin} propertyIds={propertyIds}/>}
      <LiveCommandWorkspace propertyIds={propertyIds} propertyError={propertyError} currentUser={currentUser} selfAttachUser={isOperationalOfficer(currentUser)?currentUser:null} monitoredIds={monitoredIds} onTogglePin={togglePin} standaloneMonitor={!embedded?monitor:undefined} onToggleMonitor={!embedded?toggleMonitor:undefined} emergencyControl={<OfficerDistressButton currentUser={currentUser} compact/>} officerMode standaloneZoom={embedded?1:cadScaleValue(localScale)} unified={true} showMap={false} canManage={false} calls={calls} allCalls={calls} units={statusUnits} loading={loading} syncStatus={syncStatus} rateLimited={rateLimited} onRefresh={()=>{manualRefresh();refreshRoster(true);}} rosterLoading={rosterLoading} rosterError={rosterError} onRetryRoster={()=>refreshRoster(true)}
        onOpen={setSelectedCall} selectedCall={selectedCall} onClose={()=>setSelectedCall(null)} 
        canChangePriority={false} canClear={false}
        priorityOf={getCallPriority} identifierOf={getCallIdentifier} incidentOf={cleanIncident} timeOf={fmtTime} elapsedOf={elapsed} elapsedTimestampOf={elapsedAnchor} initialFocus={cadFocus}
        settings={<><OfficerDutyStatusControl user={currentUser} status={currentUser?.status} statuses={myStatuses} onChange={handleStatusChange} saving={statusSaving}/><AdminLiveLocationPrivacy currentUser={currentUser}/></>}
      />

    </>;

}

export default function CommandDashboard({embedded=false}) {
    // The CAD Center shell already owns the live queue; reuse it instead of
    // mounting a second provider and duplicating every CAD read.
    const existing = useOptionalDashboardData();
    if (existing) return <CommandDashboardInner embedded={embedded}/>;
    return (
        <DashboardDataProvider>
            <CommandDashboardInner embedded={embedded}/>
        </DashboardDataProvider>
    );
}