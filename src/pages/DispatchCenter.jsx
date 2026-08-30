import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Shield, Radio, Map as MapIcon, Plus, Search, Clock3, MessageSquarePlus, AlertTriangle, History, Megaphone, Activity, Users, Wifi, Keyboard, Navigation, ClipboardList } from 'lucide-react';
import { lookupDistrict } from '@/utils/districtLookup';
import { createPageUrl } from '../utils';
import { findPropertyMatch, monitoredPropertiesFromLocations, stopAllAlerts } from '@/utils/alertUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressBanner from '@/components/dispatch/OfficerDistressBanner';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import NewCallAlert from '@/components/dispatch/NewCallAlert';
import { useNavigate } from 'react-router-dom';
import { MapContainer } from 'react-leaflet';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import OtherUnitsLayer from '@/components/map/OtherUnitsLayer';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import PriorCallsView from '@/components/dispatch/PriorCallsView';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import UnitAssignmentPanel from '@/components/dispatch/UnitAssignmentPanel';
import PropertyAlertsBanner from '@/components/dispatch/PropertyAlertsBanner';
import AutoDispatchShadowFeed from '@/components/dispatch/AutoDispatchShadowFeed';
import ActiveBoloBanner from '@/components/bolo/ActiveBoloBanner';
import CADUnitStatusBoard from '@/components/dispatch/CADUnitStatusBoard';
import 'leaflet/dist/leaflet.css';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { formatEasternDateTime, formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';
import { listDirectoryLocations } from '@/lib/appDirectory';
import { cleanIncident } from '@/utils/callUtils';
import { getOfficerLocationSnapshot, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import PathfinderTileLayer, { MapThemeToggle, usePathfinderMapTheme } from '@/components/map/PathfinderTileLayer';
import DispatcherShiftReports from './DispatcherShiftReports';



export default function DispatchCenter() {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [callDistrict, setCallDistrict] = useState(null);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showDispatchLog, setShowDispatchLog] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);
    const [unreadDispatchMessages, setUnreadDispatchMessages] = useState(0);
    const [sortOrder, setSortOrder] = useState('desc');
    const [showMap, setShowMap] = useState(false);
    const [mobileView, setMobileView] = useState('calls');
    const [monitoredProperties, setMonitoredProperties] = useState([]);
    const [pendingAlertCall, setPendingAlertCall] = useState(null);
    const [queueFilter, setQueueFilter] = useState('all');
    const [queueSearch, setQueueSearch] = useState('');
    const [callNotes, setCallNotes] = useState([]);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [systemTime, setSystemTime] = useState(() => new Date());
    const [welfareChecks, setWelfareChecks] = useState([]);
    const [welfareWorking, setWelfareWorking] = useState(false);
    const [mapTheme, setMapTheme] = usePathfinderMapTheme();

    const rankLastName = (name) => {
        const raw = String(name || '').trim();
        if (!raw) return 'Dispatch';
        const match = units.find(u => [u.full_name, u.email, u.username].filter(Boolean).some(v => String(v).toLowerCase() === raw.toLowerCase()));
        if (!match) return raw.includes('@') ? raw.split('@')[0] : raw;
        const last = String(match.last_name || match.full_name || '').trim().split(/\s+/).pop();
        const rank = String(match.rank || match.title || '').trim();
        return [rank, last].filter(Boolean).join(' ') || match.full_name || raw;
    };
    const knownCallIdsRef = React.useRef(null);

    useEffect(() => {
        const clockInterval = setInterval(() => setSystemTime(new Date()), 1000);
        return () => clearInterval(clockInterval);
    }, []);

    useEffect(() => {
        const handleKeyboardShortcuts = (event) => {
            const tag = event.target?.tagName?.toLowerCase();
            const isTyping = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
            if (isTyping) return;
            if (event.key === '/') {
                event.preventDefault();
                document.getElementById('cad-queue-search')?.focus();
            }
            if (event.key.toLowerCase() === 'n') setShowCreateDialog(true);
            if (event.key.toLowerCase() === 'm') setShowMap(value => !value);
            if (event.key === 'Escape') {
                setSelectedCall(null);
                setShowMessaging(false);
                setShowDispatchLog(false);
            }
        };
        window.addEventListener('keydown', handleKeyboardShortcuts);
        return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
    }, []);

    useEffect(() => {
        init();
        loadMonitoredProperties();

        // GRAC ingestion is owned app-wide by DashboardDataProvider. Dispatch Center
        // listens for persisted call changes instead of launching a second sync loop.
        const unsubscribeCalls = base44.entities.DispatchCall.subscribe(() => loadActiveCalls());
        let unitRefreshTimer;
        const scheduleUnitRefresh = () => {
            window.clearTimeout(unitRefreshTimer);
            unitRefreshTimer = window.setTimeout(loadUnits, 750);
        };
        const unsubscribeUnits = subscribeOfficerLocationChanges(scheduleUnitRefresh);
        const localInterval = setInterval(() => {
            loadActiveCalls();
        }, 60000);
        const unitsInterval = setInterval(loadUnits, 60000);
        const secondaryInterval = setInterval(loadMonitoredProperties, 120000);
        const onStatusChanged = () => loadUnits();
        window.addEventListener('bps-officer-status-changed', onStatusChanged);

        return () => {
            unsubscribeCalls?.();
            unsubscribeUnits?.();
            window.clearTimeout(unitRefreshTimer);
            clearInterval(localInterval);
            clearInterval(unitsInterval);
            clearInterval(secondaryInterval);
            window.removeEventListener('bps-officer-status-changed', onStatusChanged);
        };
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return undefined;
        let active = true;
        const loadUnreadDispatchMessages = async () => {
            try {
                const records = await base44.entities.Message.filter({ recipient_id: 'dispatch', read: false }, '-created_date', 200);
                if (!active) return;
                const unread = (records || []).filter(message => message.teams_message_id && !message.draft && String(message.message || '').trim());
                setUnreadDispatchMessages(unread.length);
            } catch {
                if (active) setUnreadDispatchMessages(0);
            }
        };
        loadUnreadDispatchMessages();
        const unsubscribe = base44.entities.Message.subscribe(() => loadUnreadDispatchMessages());
        window.addEventListener('bps-unread-refresh', loadUnreadDispatchMessages);
        return () => {
            active = false;
            unsubscribe?.();
            window.removeEventListener('bps-unread-refresh', loadUnreadDispatchMessages);
        };
    }, [currentUser?.id]);

    const loadMonitoredProperties = async () => {
        try {
            const locations = await listDirectoryLocations('site_name');
            setMonitoredProperties(monitoredPropertiesFromLocations(locations || []));
        } catch (error) {
            console.error('Error loading monitored properties:', error);
        }
    };

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Check every supported dispatch/CAD access path consistently.
            const roles = new Set((user.additional_roles || []).map(role => String(role).trim().toLowerCase()));
            const hasDispatchAccess = user.role === 'admin'
                || String(user.role || '').trim().toLowerCase() === 'dispatch'
                || user.dispatch_role === true
                || roles.has('dispatch')
                || roles.has('cad_access')
                || roles.has('supervisor')
                || roles.has('full_access');
            
            if (!hasDispatchAccess) {
                toast.error('Unauthorized - Dispatch access required');
                navigate(createPageUrl('CommandDashboard'));
                return;
            }

            // Initialize sequentially so opening CAD does not create a request burst.
            await loadActiveCalls();
            await loadUnits();
        } catch (error) {
            console.error('Error initializing:', error);
            toast.error('Failed to load dispatch center');
        } finally {
            setLoading(false);
        }
    };

    const loadUnits = async () => {
        try {
            // One canonical status feed is shared by Dispatch Center, Command, and
            // the Unit Status Board. Only officers with a fresh signed-in CAD session
            // may be assignable as Available/Enroute/On Scene/Busy/Distress.
            const payload = await getOfficerLocationSnapshot();
            const eligibleUnits = (payload.users || [])
                .filter(isOperationalOfficer)
                .filter(unit => unit.status !== 'Out of Service' && unit.session_active === true)
                .map(unit => ({ ...unit, label: unit.unit_number || unit.full_name || unit.email }))
                .sort((a, b) => String(a.unit_number || a.label || '').localeCompare(String(b.unit_number || b.label || '')));
            setUnits(eligibleUnits);
        } catch (error) {
            console.error('Error loading canonical CAD units:', error);
            // A transient backend/rate-limit failure must not make every officer
            // disappear from the tactical map. Keep the last confirmed snapshot
            // and let realtime/polling recover on the next successful refresh.
        }
    };

    const loadActiveCalls = async () => {
       try {
            const calls = await base44.entities.DispatchCall.list('-created_date', 200);

            // Show one stable row per upstream call. Prefer the record that already has a B-series CAD number.
            const uniqueCalls = new Map();
            for (const call of calls || []) {
                const descriptionKey = String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
                const key = call.external_call_id || descriptionKey || call.id;
                const current = uniqueCalls.get(key);
                const currentHasIdentifier = Boolean(current?.agency_cad_number || current?.bps_reference || current?.call_id);
                const candidateHasIdentifier = Boolean(call?.agency_cad_number || call?.bps_reference || call?.call_id);
                const currentHasOfficialCad = Boolean(current?.official_cad_verified && (current?.agency_cad_number || current?.call_id));
                const candidateHasOfficialCad = Boolean(call?.official_cad_verified && (call?.agency_cad_number || call?.call_id));
                if (!current || (!currentHasIdentifier && candidateHasIdentifier) || (!currentHasOfficialCad && candidateHasOfficialCad)) uniqueCalls.set(key, call);
            }
            const recentCalls = [...uniqueCalls.values()].filter(call => {
                const receivedAt = parseServerTimestamp(call.time_received || call.created_date)?.getTime() || 0;
                const isFresh = Number.isFinite(receivedAt) && Date.now() - receivedAt < 61 * 60 * 1000;
                // Keep Pathfinder CAD lifecycle authoritative for the live queue. The
                // upstream agency may publish time_closed before our assigned officer
                // clears the Pathfinder assignment, so time_closed alone must not hide it.
                return isFresh && !['Cleared', 'Cancelled'].includes(call.status) && call.manual_dismissed !== true;
            });

            recentCalls.sort((a, b) => {
                const timeA = parseServerTimestamp(a.time_received || a.created_date)?.getTime() || 0;
                const timeB = parseServerTimestamp(b.time_received || b.created_date)?.getTime() || 0;
                return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });

            // Detect new calls and play alert
            const currentIds = new Set(recentCalls.map(c => c.id));
            if (knownCallIdsRef.current === null) {
                // First load — just record IDs, don't alert
                knownCallIdsRef.current = currentIds;
            } else {
                const newCallIds = [...currentIds].filter(id => !knownCallIdsRef.current.has(id));
                if (newCallIds.length > 0) {
                    const newCall = recentCalls.find(c => newCallIds.includes(c.id));
                    const propertyMatch = newCall ? findPropertyMatch(newCall, monitoredProperties) : null;
                    if (propertyMatch) setPendingAlertCall(newCall);
                }
                knownCallIdsRef.current = currentIds;
            }

            console.log('📞 Dispatch active calls:', recentCalls.length);
            setActiveCalls(recentCalls);
         } catch (error) {
             console.error('Error loading active calls:', error);
         }
    };

    const loadCallNotes = async (callId) => {
        if (!callId) return setCallNotes([]);
        try {
            const notes = await base44.entities.CallNote.filter({ call_id: callId }, '-created_date', 100);
            setCallNotes(notes || []);
        } catch (error) {
            console.warn('Unable to load call notes:', error);
            setCallNotes([]);
        }
    };

    const loadWelfareChecks = async (callId) => {
        if (!callId) return setWelfareChecks([]);
        try {
            const rows = await base44.entities.OfficerWelfareCheck.filter({ call_id: callId }, '-requested_at', 50);
            setWelfareChecks(rows || []);
        } catch {
            setWelfareChecks([]);
        }
    };

    const handleSelectCall = (call) => {
        setSelectedCall(call);
        if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('detail');
        setCallDistrict(null);
        loadCallNotes(call?.id);
        loadWelfareChecks(call?.id);
        if (call?.latitude && call?.longitude) {
            lookupDistrict(call.latitude, call.longitude).then(d => setCallDistrict(d));
        }
    };

    // Keep the selected call's shared note stream live. Field officers and dispatch
    // write to the same CallNote entity, so either side sees the other's update
    // without reselecting or refreshing the call.
    useEffect(() => {
        if (!selectedCall?.id) return undefined;
        const refreshNotes = () => loadCallNotes(selectedCall.id);
        const refreshWelfare = () => loadWelfareChecks(selectedCall.id);
        let unsubscribe;
        let welfareUnsubscribe;
        try { unsubscribe = base44.entities.CallNote.subscribe(refreshNotes); } catch { /* polling below is fallback */ }
        try { welfareUnsubscribe = base44.entities.OfficerWelfareCheck.subscribe(refreshWelfare); } catch { /* polling below is fallback */ }
        const timer = setInterval(() => { refreshNotes(); refreshWelfare(); }, 30000);
        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
            if (typeof welfareUnsubscribe === 'function') welfareUnsubscribe();
            clearInterval(timer);
        };
    }, [selectedCall?.id]);

    const updateCallStatus = async (newStatus) => {
        if (!selectedCall || selectedCall.status === newStatus) return;
        try {
            const result = await base44.functions.invoke('updateCadCallStatus', {
                call_id: selectedCall.id,
                status: newStatus,
            });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            toast.success(`Call marked ${newStatus}`);
            if (['Cleared', 'Cancelled'].includes(newStatus)) setSelectedCall(null);
            await loadActiveCalls();
        } catch (error) {
            console.error('Status update failed:', error);
            toast.error('Unable to update call status');
        }
    };

    const requestWelfareForSelectedCall = async () => {
        if (!selectedCall?.id || welfareWorking) return;
        setWelfareWorking(true);
        try {
            const response = await base44.functions.invoke('manageOfficerWelfare', { action:'request', call_id:selectedCall.id });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            toast.success(`${payload.checks?.length || 0} welfare check${payload.checks?.length === 1 ? '' : 's'} active for assigned officer(s).`);
            await loadWelfareChecks(selectedCall.id);
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Unable to request welfare check');
        } finally {
            setWelfareWorking(false);
        }
    };

    const markWelfareCheckedIn = async (check) => {
        if (!check?.id || welfareWorking) return;
        setWelfareWorking(true);
        try {
            const response = await base44.functions.invoke('manageOfficerWelfare', {
                action: 'ok',
                check_id: check.id,
                note: 'Dispatch confirmed officer welfare by radio.',
            });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            toast.success(`${check.officer_display_name || 'Officer'} checked in by radio.`);
            await loadWelfareChecks(selectedCall?.id);
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Unable to record welfare check-in');
        } finally {
            setWelfareWorking(false);
        }
    };

    const requestSupervisorForSelectedCall = async () => {
        if (!selectedCall?.id) return;
        try {
            const response = await base44.functions.invoke('requestSupervisorAssist', { call_id: selectedCall.id });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            if (payload.pending || payload.request_recorded) {
                toast.success(payload.reason || 'Supervisor request recorded and awaiting an eligible supervisor.');
                await loadCallNotes(selectedCall.id);
            } else if (!payload.assigned) toast.warning(payload.reason || 'No eligible supervisor is available right now.');
            else {
                toast.success(`${payload.supervisor?.name || 'Supervisor'} assigned as closest available supervisor.`);
                await loadCallNotes(selectedCall.id);
                await loadActiveCalls();
            }
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Unable to request supervisor');
        }
    };

    const addCallNote = async () => {
        const text = noteText.trim();
        if (!selectedCall || !text) return;
        setSavingNote(true);
        try {
            await base44.entities.CallNote.create({
                call_id: selectedCall.id,
                author_id: currentUser?.id || 'dispatch',
                author_name: rankLastName(currentUser?.full_name || currentUser?.email || 'Dispatch'),
                note: text,
                note_type: 'update'
            });
            setNoteText('');
            await loadCallNotes(selectedCall.id);
            toast.success('CAD note added');
        } catch (error) {
            console.error('Note creation failed:', error);
            toast.error('Unable to add note');
        } finally {
            setSavingNote(false);
        }
    };

    const handleCallCreated = async () => {
        setShowCreateDialog(false);
        await loadActiveCalls();
        toast.success('Call created and dispatched');
    };

    // Re-sort calls when sortOrder changes
    useEffect(() => {
        const sorted = [...activeCalls].sort((a, b) => {
            const timeA = parseServerTimestamp(a.time_received || a.created_date)?.getTime() || 0;
            const timeB = parseServerTimestamp(b.time_received || b.created_date)?.getTime() || 0;
            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });
        setActiveCalls(sorted);
    }, [sortOrder]);

    const handleUpdate = async () => {
        await loadActiveCalls();
        await loadUnits();
        
        if (selectedCall) {
            const updatedCall = activeCalls.find(c => c.id === selectedCall.id);
            if (updatedCall) setSelectedCall(updatedCall);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
            </div>
        );
    }

    const priorityBg = (priority) => {
        if (priority === 'critical') return 'bg-red-700 text-white';
        if (priority === 'high') return 'bg-orange-600 text-white';
        if (priority === 'medium') return 'bg-yellow-600 text-black';
        return 'bg-slate-600 text-slate-200';
    };

    const allCalls = activeCalls.filter(call => {
        const matchesFilter = queueFilter === 'all' ||
            (queueFilter === 'unassigned' && !call.assigned_units?.length) ||
            (queueFilter === 'priority' && ['critical', 'high'].includes(call.priority)) ||
            call.status === queueFilter;
        const haystack = `${call.call_id || ''} ${call.incident || ''} ${call.location || ''} ${call.caller_name || ''}`.toLowerCase();
        return matchesFilter && haystack.includes(queueSearch.toLowerCase());
    });

    const statusUnits = units.filter(unit => Boolean(unit.status));
    const availableUnits = statusUnits.filter(unit => unit.status === 'Available');
    const activeUnits = statusUnits.filter(unit => unit.status !== 'Out of Service');
    const unassignedCalls = activeCalls.filter(call => !call.assigned_units?.length);
    const priorityCalls = activeCalls.filter(call => ['critical', 'high'].includes(call.priority));
    // "Old/wait" time is a Pathfinder property-monitoring metric only. General
    // GRAC/agency calls must never make this timer old or red.
    const propertyAlertCalls = activeCalls.filter(call => Boolean(findPropertyMatch(call, monitoredProperties)));
    const callAgeMinutes = (call) => Math.max(0, Math.floor((systemTime.getTime() - (parseServerTimestamp(call.time_received || call.created_date)?.getTime() || systemTime.getTime())) / 60000));
    const oldestPropertyCallMinutes = propertyAlertCalls.length
        ? Math.max(...propertyAlertCalls.map(callAgeMinutes))
        : 0;

    const handleAcknowledge = () => {
        stopAllAlerts();
        setPendingAlertCall(null);
    };



    return (
        <div className="cad-command-workstation relative flex h-full min-h-0 flex-col overflow-hidden bg-[#060b12] font-mono text-white md:h-screen">
            <OfficerDistressBanner currentUser={currentUser} isDispatchOrAdmin={true} />
            <NewCallAlert call={pendingAlertCall} onAcknowledge={handleAcknowledge} />

            {/* ══ TOP SYSTEM BAR ══ */}
            <div className="flex min-h-12 flex-none flex-wrap items-center gap-2 border-b border-cyan-950/80 bg-gradient-to-r from-[#08111d] via-[#0b1725] to-[#08111d] px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,.28)] md:flex-nowrap md:gap-3 md:px-4">
                <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#f5a623]" />
                    <div><span className="block text-sm font-black tracking-[0.18em] text-[#f5a623]">BPS CAD</span><span className="block text-[8px] tracking-[0.22em] text-slate-500">COMPUTER-AIDED DISPATCH</span></div>
                    <span className="hidden text-slate-600 md:inline">/</span>
                    <span className="hidden whitespace-nowrap text-[10px] font-semibold tracking-wider text-slate-300 md:inline">PRIMARY DISPATCH</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
                    <span className="text-green-400 text-[10px]">ONLINE</span>
                </div>
                <div className="flex-1" />
                <div className="flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:w-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button onClick={() => setShowCreateDialog(true)}
                        className="flex h-7 items-center gap-1 rounded-md border border-red-500 bg-red-700 px-2.5 text-[9px] font-bold text-white hover:bg-red-600">
                        <Plus className="w-3 h-3" /> NEW CALL
                    </button>

                    <button onClick={() => {
                        if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('map');
                        else setShowMap(true);
                    }}
                        className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${showMap || mobileView === 'map' ? 'border-blue-500/40 bg-blue-900/20 text-blue-400' : 'border-slate-600 text-slate-500'}`}>
                        <MapIcon className="w-2.5 h-2.5" /> MAP
                    </button>
                    <button onClick={() => setShowPriorCalls(!showPriorCalls)}
                        className={`px-2 py-1 border rounded text-[10px] ${
                            showPriorCalls ? 'border-amber-500/40 text-amber-400' : 'border-slate-600 text-slate-400 hover:text-white'
                        }`}>
                        {showPriorCalls ? 'ACTIVE' : 'PRIOR'}
                    </button>
                    <button onClick={() => setShowDispatchLog(true)} className="flex items-center gap-1 rounded border border-blue-600/60 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-950/40 hover:text-white"><ClipboardList className="h-2.5 w-2.5" /> DISPATCH LOG</button>
                    <button onClick={() => {
                        const params = new URLSearchParams({ new: '1' });
                        if (selectedCall?.id) {
                            params.set('call_id', selectedCall.id);
                            params.set('call_number', selectedCall.agency_cad_number || selectedCall.bps_reference || selectedCall.call_id || selectedCall.id);
                        }
                        navigate(`${createPageUrl('BOLOAlerts')}?${params.toString()}`);
                    }} className="flex items-center gap-1 px-2 py-1 border border-amber-600/60 text-amber-400 hover:text-white rounded text-[10px]"><Megaphone className="w-2.5 h-2.5" /> NEW BOLO</button>
                    <button onClick={() => setShowMessaging(!showMessaging)}
                        className={`relative flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${showMessaging ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-200' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                        <MessageSquarePlus className="w-2.5 h-2.5" /> MSG
                        {unreadDispatchMessages > 0 && (
                            <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black leading-none text-white shadow-lg ring-2 ring-[#08111d]">
                                {unreadDispatchMessages > 99 ? '99+' : unreadDispatchMessages}
                            </span>
                        )}
                    </button>
                    {currentUser?.role === 'admin' && (
                        <button onClick={() => navigate(createPageUrl('AdminPortal'))}
                            className="flex items-center gap-1 px-2 py-1 border border-slate-600 text-slate-400 hover:text-white rounded text-[10px]">
                            <Shield className="w-2.5 h-2.5" /> ADMIN
                        </button>
                    )}
                    <OfficerDistressButton currentUser={currentUser} className="text-[10px]" />
                    <div className="flex items-center gap-1 px-3 py-1 border border-blue-500/40 bg-blue-500/10 rounded text-[10px] text-blue-300 font-bold">
                        <Radio className="w-2.5 h-2.5" /> GRAC LIVE SOURCE
                    </div>
                </div>
            </div>

            {showDispatchLog && (
                <section className="absolute inset-0 z-[130] flex min-h-0 flex-col overflow-hidden bg-[#060b12]" aria-label="Dispatcher Shift Log">
                    <div className="flex flex-none items-center gap-3 border-b border-blue-900/70 bg-[#08111d] px-4 py-3">
                        <ClipboardList className="h-4 w-4 text-blue-300" />
                        <div>
                            <div className="text-xs font-black tracking-[0.14em] text-white">DISPATCHER SHIFT LOG</div>
                            <div className="text-[9px] text-slate-500">Inner Dispatch Center workspace</div>
                        </div>
                        <button type="button" onClick={() => setShowDispatchLog(false)} className="ml-auto rounded border border-slate-600 px-3 py-2 text-[10px] font-black text-slate-200 hover:bg-slate-800">
                            BACK TO LIVE DISPATCH
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <DispatcherShiftReports embedded />
                    </div>
                </section>
            )}

            <PropertyAlertsBanner />
            <AutoDispatchShadowFeed />
            <ActiveBoloBanner />

            {/* ══ COMMAND STATUS STRIP ══ */}
            <div className="grid flex-none grid-cols-3 border-b border-[#1e2d4a] bg-[#08111d] lg:grid-cols-6">
                {[
                    { label: 'ACTIVE CALLS', value: activeCalls.length, tone: 'text-cyan-300', icon: Activity },
                    { label: 'UNASSIGNED', value: unassignedCalls.length, tone: unassignedCalls.length ? 'text-amber-300' : 'text-slate-300', icon: AlertTriangle },
                    { label: 'HIGH PRIORITY', value: priorityCalls.length, tone: priorityCalls.length ? 'text-red-400' : 'text-slate-300', icon: Shield },
                    { label: 'UNITS ACTIVE', value: activeUnits.length, tone: 'text-blue-300', icon: Users },
                    { label: 'AVAILABLE', value: availableUnits.length, tone: 'text-emerald-300', icon: Navigation },
                    { label: 'PROPERTY OLDEST', value: propertyAlertCalls.length ? `${oldestPropertyCallMinutes}m` : '—', tone: oldestPropertyCallMinutes >= 15 ? 'text-red-400' : 'text-slate-300', icon: Clock3 },
                ].map(({ label, value, tone, icon: Icon }) => (
                    <div key={label} className="flex min-w-0 items-center gap-1.5 border-b border-r border-[#17283b] px-2 py-1.5 lg:border-b-0">
                        <Icon className={`hidden h-3 w-3 shrink-0 sm:block ${tone}`} />
                        <div className="min-w-0"><div className={`text-sm font-black leading-none ${tone}`}>{value}</div><div className="mt-0.5 truncate text-[7px] font-bold tracking-[0.1em] text-slate-500">{label}</div></div>
                    </div>
                ))}
            </div>

            <div className="flex-none border-b border-[#1e2d4a] bg-[#08111d] px-2 py-2 lg:hidden">
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {[
                        ['calls','CALLS'], ['detail','DETAIL'], ['assignment','ASSIGN'], ['units','UNITS'], ['map','MAP']
                    ].map(([value,label]) => (
                        <button key={value} onClick={() => setMobileView(value)} className={`h-9 min-w-[74px] flex-1 rounded-lg border px-2 text-[9px] font-black tracking-wide ${mobileView === value ? 'border-blue-500 bg-blue-500/15 text-blue-200 shadow-[0_0_0_1px_rgba(59,130,246,.15)]' : 'border-slate-700 bg-[#0b1320] text-slate-500'}`}>{label}</button>
                    ))}
                </div>
            </div>

            {/* ══ QUEUE CONTROLS ══ */}
            <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} flex-none flex-wrap items-center gap-2 border-b border-[#1e2d4a] bg-[#0a0e1a] px-2 py-1.5 lg:flex lg:flex-nowrap lg:px-3`}>
                <div className="relative w-full min-w-0 sm:w-auto sm:min-w-52 md:w-56">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input id="cad-queue-search" value={queueSearch} onChange={e => setQueueSearch(e.target.value)} placeholder="Search CAD, incident, address...  [/]"
                        className="w-full h-7 pl-7 pr-2 bg-[#111827] border border-[#263653] rounded text-[10px] text-white outline-none focus:border-blue-500" />
                </div>
                {[
                    ['all','ALL'], ['unassigned','UNASSIGNED'], ['priority','HIGH PRIORITY'], ['New','NEW'], ['Dispatched','DISPATCHED'], ['Enroute','ENROUTE'], ['On Scene','ON SCENE']
                ].map(([value,label]) => (
                    <button key={value} onClick={() => setQueueFilter(value)} className={`px-2 py-1 rounded text-[9px] border ${queueFilter === value ? 'border-blue-400 text-blue-300 bg-blue-500/10' : 'border-slate-700 text-slate-500 hover:text-white'}`}>{label}</button>
                ))}
                <div className="flex-1" />
                <span className="text-[10px] text-slate-500">SORT:</span>
                <button onClick={() => setSortOrder('desc')} className={`px-2 py-0.5 rounded text-[10px] border ${
                    sortOrder === 'desc' ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/10' : 'border-slate-700 text-slate-500'
                }`}>NEWEST</button>
                <button onClick={() => setSortOrder('asc')} className={`px-2 py-0.5 rounded text-[10px] border ${
                    sortOrder === 'asc' ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/10' : 'border-slate-700 text-slate-500'
                }`}>OLDEST</button>
                <span className="ml-3 text-[10px] text-slate-500">SHOWING: <span className="text-white font-bold">{allCalls.length}</span> / {activeCalls.length}</span>
            </div>

            {/* ══ MAIN GRID ══ */}
            {showPriorCalls ? (
                <div className="flex-1 overflow-auto p-3">
                    <PriorCallsView currentUser={currentUser} units={units} />
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">

                    {/* ═══ LEFT: ACTIVE CALLS TABLE ═══ */}
                    <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col border-b border-[#1e2d4a] lg:flex lg:min-h-0 lg:w-[350px] lg:flex-none lg:border-b-0 lg:border-r xl:w-[380px]`}> 
                        {/* Police Calls */}
                        <div className="flex-none px-3 py-1.5 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
                            <span className="text-[10px] font-bold text-[#f5a623] tracking-widest">GRAC ACTIVE CALLS</span>
                            <span className="ml-auto text-[10px] bg-[#f5a623]/20 text-[#f5a623] px-2 rounded-full border border-[#f5a623]/30">{allCalls.length}</span>
                        </div>
                        {/* Table header */}
                        <div className="flex-none grid grid-cols-12 px-2 py-1 bg-[#111827] border-b border-[#1e2d4a] text-[9px] text-slate-500 uppercase">
                            <div className="col-span-2">PRI</div>
                            <div className="col-span-5">INCIDENT</div>
                            <div className="col-span-5">TIME</div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {allCalls.length === 0 ? (
                                <div className="text-[10px] text-slate-600 text-center py-4">NO ACTIVE CALLS</div>
                            ) : allCalls.map(call => (
                                <div key={call.id} onClick={() => handleSelectCall(call)}
                                    className={`group grid grid-cols-12 cursor-pointer border-b border-[#172536] px-2 py-2.5 transition-all ${
                                        selectedCall?.id === call.id
                                            ? 'bg-[#1a3a5c] border-l-2 border-l-[#3b82f6]'
                                            : 'hover:bg-[#111827]'
                                    }`}>
                                    <div className="col-span-2">
                                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${priorityBg(call.priority)}`}>
                                            {call.priority ? call.priority[0].toUpperCase() : 'L'}
                                        </span>
                                    </div>
                                    <div className="col-span-5">
                                        <div className={`text-[9px] font-mono font-bold truncate ${call.official_cad_verified ? 'text-[#7ec1ff]' : 'text-[#f5c451]'}`}>{call.agency_cad_number || (call.official_cad_verified ? call.call_id : '') || call.bps_reference || call.call_id || 'ASSIGNING…'}</div>
                                        <div className="truncate text-[11px] font-bold leading-tight text-white group-hover:text-cyan-100">{cleanIncident(call)}</div>
                                        <div className="mt-1 truncate text-[9px] text-slate-400">{call.location}</div>
                                        <div className="mt-1 text-[8px] font-semibold tracking-wide text-slate-600">{call.agency || 'AGENCY N/A'}</div>
                                    </div>
                                    <div className="col-span-5 text-[9px] text-slate-400 text-right pr-1">
                                        <div>{formatEasternTime(call.time_received || call.created_date)}</div>
                                        {findPropertyMatch(call, monitoredProperties) ? (
                                            <div className={`mt-1 font-bold ${callAgeMinutes(call) >= 15 ? 'text-red-400' : 'text-slate-600'}`}>
                                                {callAgeMinutes(call)} MIN AGO · PROPERTY
                                            </div>
                                        ) : (
                                            <div className="mt-1 font-bold text-slate-700">AGENCY CALL</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>

                    {/* ═══ CENTER: MAP + CALL DETAIL ═══ */}
                    <div className={`${mobileView === 'detail' || mobileView === 'map' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 min-w-0 flex-col border-b border-[#1e2d4a] lg:flex lg:min-h-0 lg:border-b-0 lg:border-r`}> 
                        {/* Call Detail */}
                        <div className={`${mobileView === 'map' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col border-b border-[#1e2d4a] lg:flex`}> 
                            {selectedCall ? (
                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                                    <div className="px-3 md:px-4 py-2 bg-[#0d1220] border-b border-[#1e2d4a] flex flex-wrap items-center gap-2 md:gap-3">
                                        <span className="text-[#f5a623] font-bold text-xs">
                                            {selectedCall.official_cad_verified ? `AGENCY CAD #${selectedCall.agency_cad_number || selectedCall.call_id}` : `BPS REF ${selectedCall.bps_reference || selectedCall.call_id || 'ASSIGNING…'}`}
                                        </span>
                                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${priorityBg(selectedCall.priority)}`}>{(selectedCall.priority || 'low').toUpperCase()}</span>
                                        <span className="text-[10px] text-slate-400">{selectedCall.status}</span>
                                        <span className="w-full md:w-auto md:ml-auto text-[9px] text-slate-500">
                                            RECV: {formatEasternDateTime(selectedCall.time_received || selectedCall.created_date)} ET
                                        </span>
                                    </div>
                                    <div className="px-3 md:px-4 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                                        <div><span className="text-slate-500">INCIDENT: </span><span className="text-white font-bold">{cleanIncident(selectedCall)}</span></div>
                                        <div><span className="text-slate-500">AGENCY: </span><span className="text-white">{selectedCall.agency || '—'}</span></div>
                                        <div><span className="text-slate-500">PRIORITY: </span><span className="text-white">{selectedCall.priority ? selectedCall.priority.charAt(0).toUpperCase() + selectedCall.priority.slice(1).toLowerCase() : '—'}</span></div>
                                        <div className="col-span-2"><span className="text-slate-500">LOCATION: </span><span className="text-white">{selectedCall.location}</span></div>
                                        {selectedCall.caller_name && <div><span className="text-slate-500">CALLER: </span><span className="text-white">{selectedCall.caller_name}</span></div>}
                                        {selectedCall.caller_phone && <div><span className="text-slate-500">PHONE: </span><span className="text-white">{selectedCall.caller_phone}</span></div>}
                                        <div><span className="text-slate-500">DISTRICT/PCT: </span><span className="text-white">{callDistrict !== null ? callDistrict : selectedCall.zone || '—'}</span></div>
                                    </div>
                                    {selectedCall.hazards && (
                                        <div className="mx-4 mb-2 flex items-start gap-2 rounded border border-red-500/40 bg-red-950/40 p-2 text-[10px] text-red-200">
                                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-none" />
                                            <div><span className="font-bold">SAFETY ALERT: </span>{selectedCall.hazards}</div>
                                        </div>
                                    )}
                                    {selectedCall.description && (
                                        <div className="px-4 pb-2">
                                            <div className="text-[9px] text-slate-500 mb-1">NARRATIVE</div>
                                            <div className="text-[10px] text-slate-300 bg-[#111827] rounded p-2 leading-relaxed">{selectedCall.description}</div>
                                        </div>
                                    )}
                                    <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[9px] text-slate-500 mr-1">CALL STATUS</span>
                                        {['New','Dispatched','Enroute','On Scene','Cleared'].map(status => (
                                            <button key={status} onClick={() => updateCallStatus(status)} disabled={selectedCall.status === status}
                                                className={`px-2 py-1 rounded border text-[9px] ${selectedCall.status === status ? 'border-blue-400 bg-blue-500/20 text-blue-200' : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white'}`}>
                                                {status.toUpperCase()}
                                            </button>
                                        ))}
                                        <button onClick={() => updateCallStatus('Cancelled')} className="px-2 py-1 rounded border border-red-700 text-[9px] text-red-400 hover:bg-red-950/50">CANCEL</button>
                                        <button onClick={requestSupervisorForSelectedCall} className="px-2 py-1 rounded border border-purple-600 bg-purple-950/40 text-[9px] font-bold text-purple-200 hover:bg-purple-900/50">REQUEST SUPERVISOR</button>
                                        <button onClick={requestWelfareForSelectedCall} disabled={welfareWorking} className="px-2 py-1 rounded border border-red-600 bg-red-950/40 text-[9px] font-bold text-red-200 hover:bg-red-900/50 disabled:opacity-50">{welfareWorking ? 'SENDING…' : 'WELFARE CHECK'}</button>
                                    </div>
                                    {welfareChecks.length > 0 && (
                                        <div className="px-4 pb-2">
                                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500">
                                                <span>OFFICER WELFARE</span>
                                                <span className="text-cyan-300">AUTOMATIC CHECK EVERY 10 MINUTES</span>
                                            </div>
                                            <div className="space-y-1">
                                                {welfareChecks.slice(0,5).map(check => (
                                                    <div key={check.id} className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-[9px] ${check.status === 'pending' ? 'border-red-600/50 bg-red-950/30 text-red-200' : check.status === 'ok' ? 'border-emerald-600/40 bg-emerald-950/20 text-emerald-200' : 'border-amber-600/40 bg-amber-950/20 text-amber-200'}`}>
                                                        <span className="font-black">{check.officer_display_name || 'Officer'}</span>
                                                        <span>· {String(check.status || '').replaceAll('_',' ').toUpperCase()}</span>
                                                        {check.status === 'pending' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => markWelfareCheckedIn(check)}
                                                                disabled={welfareWorking}
                                                                className="ml-auto rounded border border-emerald-500/60 bg-emerald-950/50 px-2 py-1 font-black text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-50"
                                                            >
                                                                RADIO CHECK-IN
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="px-3 md:px-4 pb-3 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
                                        <div>
                                            <div className="text-[9px] text-slate-500 mb-1 flex items-center gap-1"><History className="w-3 h-3" /> CAD TIMELINE / NOTES</div>
                                            <div className="bg-[#111827] border border-[#263653] rounded max-h-24 overflow-y-auto">
                                                {callNotes.length === 0 ? <div className="p-2 text-[9px] text-slate-600">No dispatcher notes recorded.</div> : callNotes.map(note => (
                                                    <div key={note.id} className="px-2 py-1.5 border-b border-[#1e2d4a] last:border-0 text-[9px]">
                                                        <div className="flex gap-2 text-slate-500"><span className="text-blue-300">{rankLastName(note.author_name)}</span><span>{formatEasternTime(note.created_date)} ET</span></div>
                                                        <div className="text-slate-200 mt-0.5">{note.note}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] text-slate-500 mb-1">ADD DISPATCH NOTE</div>
                                            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCallNote(); } }}
                                                placeholder="Type update, then Enter..." className="w-full h-16 resize-none bg-[#111827] border border-[#263653] rounded p-2 text-[10px] text-white outline-none focus:border-blue-500" />
                                            <button onClick={addCallNote} disabled={savingNote || !noteText.trim()} className="w-full mt-1 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-[9px] font-bold">
                                                {savingNote ? 'SAVING...' : 'POST TO CAD LOG'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-16 text-[10px] text-slate-600">
                                    SELECT A CALL TO VIEW DETAILS
                                </div>
                            )}
                        </div>

                        {/* MAP */}
                        {mobileView === 'map' && (
                            <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                                <div className="flex-none px-3 py-1 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[10px] font-bold text-emerald-400 tracking-widest">LIVE TACTICAL MAP</span>
                                </div>
                                <div className="flex-1" style={{minHeight: '200px', position: 'relative', zIndex: 0}}>
                                    <MapContainer
                                        center={[37.5407, -77.4360]}
                                        zoom={11}
                                        className="h-full w-full"
                                        zoomControl={true}
                                    >
                                        <PathfinderTileLayer theme={mapTheme} />
                                        <ActiveCallMarkers
                                            calls={activeCalls}
                                            onCallClick={handleSelectCall}
                                        />
                                        <OtherUnitsLayer units={units} currentUserId={null} />
                                        <OfficerDistressMarker autoCenter={true} />
                                    </MapContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ═══ RIGHT: UNITS / ASSIGNMENT ═══ */}
                    <div className={`${mobileView === 'assignment' || mobileView === 'units' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col bg-[#08111b] lg:flex lg:w-[320px] lg:flex-none xl:w-[360px]`}>
                        {selectedCall ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex flex-none items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                    <span className="text-[10px] font-black tracking-[.16em] text-blue-300">UNIT ASSIGNMENT</span>
                                    <span className="ml-auto rounded-md border border-blue-800/60 bg-blue-950/40 px-2 py-1 text-[8px] font-black text-blue-200">CALL SELECTED</span>
                                </div>
                                <div className="min-h-0 flex-1 p-3">
                                    <UnitAssignmentPanel call={selectedCall} units={units} onUpdate={handleUpdate} />
                                </div>
                            </div>
                        ) : mobileView === 'assignment' ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex flex-none items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                    <span className="text-[10px] font-black tracking-[.16em] text-blue-300">UNIT ASSIGNMENT</span>
                                </div>
                                <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                                    <div className="max-w-[260px] rounded-xl border border-dashed border-slate-700 bg-[#09121e] p-5 text-center text-xs text-slate-400">Select an active call, then return to Assignment to dispatch a unit.</div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <CADUnitStatusBoard units={statusUnits} compact currentUser={currentUser} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showMap && (
                <div className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/75 p-6 backdrop-blur-sm md:flex" onClick={() => setShowMap(false)}>
                    <div className="flex h-[82vh] w-[88vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-blue-800/60 bg-[#07101c] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 border-b border-[#1e2d4a] bg-[#0d1220] px-4 py-3">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            <span className="text-xs font-black tracking-widest text-emerald-300">LIVE TACTICAL MAP</span>
                            <div className="ml-auto flex items-center gap-2"><MapThemeToggle theme={mapTheme} onChange={setMapTheme} /><button onClick={() => setShowMap(false)} className="rounded border border-slate-700 px-3 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800">CLOSE</button></div>
                        </div>
                        <div className="min-h-0 flex-1">
                            <MapContainer center={[37.5407, -77.4360]} zoom={11} className="h-full w-full" zoomControl={true}>
                                <PathfinderTileLayer theme={mapTheme} />
                                <ActiveCallMarkers calls={activeCalls} onCallClick={handleSelectCall} />
                                <OtherUnitsLayer units={units} currentUserId={null} />
                                <OfficerDistressMarker autoCenter={true} />
                            </MapContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ BOTTOM STATUS BAR ══ */}
            <div className="flex-none min-h-6 bg-[#0d1220] border-t border-[#1e2d4a] flex flex-wrap items-center px-3 py-1 gap-x-4 gap-y-1 text-[9px] text-slate-500 md:flex-nowrap md:whitespace-nowrap">
                <span className="flex items-center gap-1.5"><Wifi className="h-3 w-3 text-emerald-400" /> CAD NETWORK: <span className="font-bold text-emerald-400">CONNECTED</span></span>
                <span>CALLS: <span className="text-white">{allCalls.length}</span></span>
                <span>UNITS ACTIVE: <span className="text-green-400">{activeUnits.length}</span></span>
                <span>UNASSIGNED: <span className="text-yellow-400">{allCalls.filter(c => !c.assigned_units?.length).length}</span></span>
                <div className="flex-1" />
                <span className="hidden items-center gap-1 text-slate-500 md:flex"><Keyboard className="h-3 w-3" /> N NEW CALL · / SEARCH · M MAP · ESC CLEAR</span>
                <span className="font-bold text-green-400">{systemTime.toLocaleTimeString('en-US', { hour12: false })} EDT</span>
            </div>

            {/* Messaging Panel */}
            <MessagingPanel
                currentUser={currentUser}
                units={units}
                isOpen={showMessaging}
                onClose={() => setShowMessaging(false)}
            />

            {/* Create Call Dialog */}
            {showCreateDialog && (
                <CreateCallDialog
                    units={units}
                    currentUser={currentUser}
                    onClose={() => setShowCreateDialog(false)}
                    onCreated={handleCallCreated}
                />
            )}
        </div>
    );
}