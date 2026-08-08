import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Shield, Radio, Map as MapIcon, Plus, Search, Clock3, MessageSquarePlus, AlertTriangle, History, Megaphone, Activity, Users, Wifi, Keyboard, Navigation } from 'lucide-react';
import { lookupDistrict } from '@/utils/districtLookup';
import { createPageUrl } from '../utils';
import { findPropertyMatch, monitoredPropertiesFromLocations, stopAllAlerts } from '@/utils/alertUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressBanner from '@/components/dispatch/OfficerDistressBanner';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import NewCallAlert from '@/components/dispatch/NewCallAlert';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import PriorCallsView from '@/components/dispatch/PriorCallsView';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import UnitAssignmentPanel from '@/components/dispatch/UnitAssignmentPanel';
import PropertyAlertsBanner from '@/components/dispatch/PropertyAlertsBanner';
import ActiveBoloBanner from '@/components/bolo/ActiveBoloBanner';
import CADUnitStatusBoard from '@/components/dispatch/CADUnitStatusBoard';
import 'leaflet/dist/leaflet.css';



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
    const [showMessaging, setShowMessaging] = useState(false);
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
    const syncingGracRef = React.useRef(false);

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
            }
        };
        window.addEventListener('keydown', handleKeyboardShortcuts);
        return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
    }, []);

    useEffect(() => {
        init();
        loadMonitoredProperties();
        
        const syncLiveFeed = async () => {
            if (syncingGracRef.current || document.hidden) return;
            syncingGracRef.current = true;
            try {
                await base44.functions.invoke('ingestGractivecalls', {});
                await base44.functions.invoke('archiveOldCalls', {}).catch(error => console.warn('CAD archive pass failed:', error?.message));
                await loadActiveCalls();
            } catch (error) {
                console.warn('GRAC live sync failed:', error?.message);
            } finally {
                syncingGracRef.current = false;
            }
        };

        syncLiveFeed();
        const syncInterval = setInterval(syncLiveFeed, 10000);
        const localInterval = setInterval(() => {
            loadActiveCalls();
            loadUnits();
        }, 10000);
        const secondaryInterval = setInterval(loadMonitoredProperties, 60000);
        const onVisibility = () => {
            if (!document.hidden) syncLiveFeed();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            clearInterval(syncInterval);
            clearInterval(localInterval);
            clearInterval(secondaryInterval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    const loadMonitoredProperties = async () => {
        try {
            const locations = await base44.entities.Location.list('site_name');
            setMonitoredProperties(monitoredPropertiesFromLocations(locations || []));
        } catch (error) {
            console.error('Error loading monitored properties:', error);
        }
    };

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Check if user has dispatch access (admin or dispatch role)
            const hasDispatchAccess = user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true;
            
            if (!hasDispatchAccess) {
                toast.error('Unauthorized - Dispatch access required');
                navigate(createPageUrl('CommandDashboard'));
                return;
            }

            await Promise.all([
                loadUnits(),
                loadActiveCalls()
            ]);
        } catch (error) {
            console.error('Error initializing:', error);
            toast.error('Failed to load dispatch center');
        } finally {
            setLoading(false);
        }
    };

    const loadUnits = async () => {
        try {
            const allUsers = await base44.entities.User.list('-last_updated', 500);
            const eligibleUnits = (allUsers || []).filter(user => {
                const roles = Array.isArray(user.additional_roles) ? user.additional_roles.map(role => String(role).toLowerCase()) : [];
                return roles.includes('cad_access') && roles.includes('officer');
            });
            console.log('📋 Dispatch loaded eligible CAD officers:', eligibleUnits.length);
            setUnits(eligibleUnits);
        } catch (error) {
            console.error('Error loading units:', error);
            setUnits([]);
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
                const receivedAt = new Date(call.time_received || call.created_date).getTime();
                const isFresh = Number.isFinite(receivedAt) && Date.now() - receivedAt < 61 * 60 * 1000;
                return isFresh && !['Cleared', 'Cancelled'].includes(call.status);
            });

            recentCalls.sort((a, b) => {
                const timeA = new Date(a.time_received || a.created_date);
                const timeB = new Date(b.time_received || b.created_date);
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

    const handleSelectCall = (call) => {
        setSelectedCall(call);
        if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('detail');
        setCallDistrict(null);
        loadCallNotes(call?.id);
        if (call?.latitude && call?.longitude) {
            lookupDistrict(call.latitude, call.longitude).then(d => setCallDistrict(d));
        }
    };

    const updateCallStatus = async (newStatus) => {
        if (!selectedCall || selectedCall.status === newStatus) return;
        const now = new Date().toISOString();
        const timeField = {
            Dispatched: 'time_dispatched',
            Enroute: 'time_enroute',
            'On Scene': 'time_on_scene',
            Cleared: 'time_cleared',
            Cancelled: 'time_closed'
        }[newStatus];
        try {
            await base44.entities.DispatchCall.update(selectedCall.id, {
                status: newStatus,
                ...(timeField ? { [timeField]: now } : {})
            });
            await base44.entities.CallStatusLog.create({
                call_id: selectedCall.id,
                incident_type: selectedCall.incident,
                location: selectedCall.location,
                old_status: selectedCall.status,
                new_status: newStatus,
                unit_name: currentUser?.unit_number || currentUser?.full_name || 'Dispatch',
                notes: `Status changed by dispatcher`,
                latitude: selectedCall.latitude,
                longitude: selectedCall.longitude
            });
            toast.success(`Call marked ${newStatus}`);
            if (['Cleared', 'Cancelled'].includes(newStatus)) setSelectedCall(null);
            await loadActiveCalls();
        } catch (error) {
            console.error('Status update failed:', error);
            toast.error('Unable to update call status');
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
            const timeA = new Date(a.time_received || a.created_date);
            const timeB = new Date(b.time_received || b.created_date);
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
    const oldestCallMinutes = activeCalls.length
        ? Math.max(...activeCalls.map(call => Math.max(0, Math.floor((systemTime - new Date(call.time_received || call.created_date)) / 60000))))
        : 0;

    const handleAcknowledge = () => {
        stopAllAlerts();
        setPendingAlertCall(null);
    };



    return (
        <div className="cad-command-workstation flex h-full min-h-0 flex-col overflow-hidden bg-[#060b12] font-mono text-white md:h-screen">
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
                <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
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
                    <button onClick={() => {
                        const params = new URLSearchParams({ new: '1' });
                        if (selectedCall?.id) {
                            params.set('call_id', selectedCall.id);
                            params.set('call_number', selectedCall.agency_cad_number || selectedCall.bps_reference || selectedCall.call_id || selectedCall.id);
                        }
                        navigate(`${createPageUrl('BOLOAlerts')}?${params.toString()}`);
                    }} className="flex items-center gap-1 px-2 py-1 border border-amber-600/60 text-amber-400 hover:text-white rounded text-[10px]"><Megaphone className="w-2.5 h-2.5" /> NEW BOLO</button>
                    <button onClick={() => setShowMessaging(!showMessaging)}
                        className="flex items-center gap-1 px-2 py-1 border border-slate-600 text-slate-400 hover:text-white rounded text-[10px]"><MessageSquarePlus className="w-2.5 h-2.5" /> MSG</button>
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

            <PropertyAlertsBanner />
            <ActiveBoloBanner />

            {/* ══ COMMAND STATUS STRIP ══ */}
            <div className="grid flex-none grid-cols-3 border-b border-[#1e2d4a] bg-[#08111d] lg:grid-cols-6">
                {[
                    { label: 'ACTIVE CALLS', value: activeCalls.length, tone: 'text-cyan-300', icon: Activity },
                    { label: 'UNASSIGNED', value: unassignedCalls.length, tone: unassignedCalls.length ? 'text-amber-300' : 'text-slate-300', icon: AlertTriangle },
                    { label: 'HIGH PRIORITY', value: priorityCalls.length, tone: priorityCalls.length ? 'text-red-400' : 'text-slate-300', icon: Shield },
                    { label: 'UNITS ACTIVE', value: activeUnits.length, tone: 'text-blue-300', icon: Users },
                    { label: 'AVAILABLE', value: availableUnits.length, tone: 'text-emerald-300', icon: Navigation },
                    { label: 'OLDEST WAIT', value: `${oldestCallMinutes}m`, tone: oldestCallMinutes >= 15 ? 'text-red-400' : 'text-slate-300', icon: Clock3 },
                ].map(({ label, value, tone, icon: Icon }) => (
                    <div key={label} className="flex min-w-0 items-center gap-1.5 border-b border-r border-[#17283b] px-2 py-1.5 lg:border-b-0">
                        <Icon className={`hidden h-3 w-3 shrink-0 sm:block ${tone}`} />
                        <div className="min-w-0"><div className={`text-sm font-black leading-none ${tone}`}>{value}</div><div className="mt-0.5 truncate text-[7px] font-bold tracking-[0.1em] text-slate-500">{label}</div></div>
                    </div>
                ))}
            </div>

            <div className="flex-none border-b border-[#1e2d4a] bg-[#08111d] p-2 md:hidden">
                <label className="mb-1 block text-[8px] font-black tracking-[0.18em] text-slate-500">MOBILE DISPATCH VIEW</label>
                <select value={mobileView} onChange={e => setMobileView(e.target.value)} className="h-10 w-full rounded-lg border border-blue-700/50 bg-[#07101c] px-3 text-xs font-black text-blue-100 outline-none">
                    <option value="calls">ACTIVE CALLS</option>
                    <option value="detail">CALL DETAIL / CAD LOG</option>
                    <option value="assignment">UNIT ASSIGNMENT</option>
                    <option value="units">UNIT STATUS BOARD</option>
                    <option value="map">LIVE MAP</option>
                </select>
            </div>

            {/* ══ QUEUE CONTROLS ══ */}
            <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} flex-none flex-wrap items-center gap-2 border-b border-[#1e2d4a] bg-[#0a0e1a] px-2 py-1.5 md:flex md:flex-nowrap md:px-3`}>
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
                <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">

                    {/* ═══ LEFT: ACTIVE CALLS TABLE ═══ */}
                    <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col border-b border-[#1e2d4a] md:flex md:min-h-0 md:w-[350px] md:flex-none md:border-b-0 md:border-r xl:w-[380px]`}> 
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
                                        <div className="truncate text-[11px] font-bold leading-tight text-white group-hover:text-cyan-100">{call.incident}</div>
                                        <div className="mt-1 truncate text-[9px] text-slate-400">{call.location}</div>
                                        <div className="mt-1 text-[8px] font-semibold tracking-wide text-slate-600">{call.agency || 'AGENCY N/A'}</div>
                                    </div>
                                    <div className="col-span-5 text-[9px] text-slate-400 text-right pr-1">
                                        <div>{new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}</div>
                                        <div className={`mt-1 font-bold ${Math.floor((systemTime - new Date(call.time_received || call.created_date)) / 60000) >= 15 ? 'text-red-400' : 'text-slate-600'}`}>
                                            {Math.max(0, Math.floor((systemTime - new Date(call.time_received || call.created_date)) / 60000))} MIN AGO
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>

                    {/* ═══ CENTER: MAP + CALL DETAIL ═══ */}
                    <div className={`${mobileView === 'detail' || mobileView === 'map' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 min-w-0 flex-col border-b border-[#1e2d4a] md:flex md:min-h-0 md:border-b-0 md:border-r`}> 
                        {/* Call Detail */}
                        <div className={`${mobileView === 'map' ? 'hidden' : 'block'} flex-none border-b border-[#1e2d4a] md:block`} style={{minHeight: 0}}>
                            {selectedCall ? (
                                <div className="overflow-auto" style={{maxHeight: '340px'}}>
                                    <div className="px-3 md:px-4 py-2 bg-[#0d1220] border-b border-[#1e2d4a] flex flex-wrap items-center gap-2 md:gap-3">
                                        <span className="text-[#f5a623] font-bold text-xs">
                                            {selectedCall.official_cad_verified ? `AGENCY CAD #${selectedCall.agency_cad_number || selectedCall.call_id}` : `BPS REF ${selectedCall.bps_reference || selectedCall.call_id || 'ASSIGNING…'}`}
                                        </span>
                                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${priorityBg(selectedCall.priority)}`}>{(selectedCall.priority || 'low').toUpperCase()}</span>
                                        <span className="text-[10px] text-slate-400">{selectedCall.status}</span>
                                        <span className="w-full md:w-auto md:ml-auto text-[9px] text-slate-500">
                                            RECV: {new Date(selectedCall.time_received || selectedCall.created_date).toLocaleString('en-US', {timeZone:'America/New_York', month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    <div className="px-3 md:px-4 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                                        <div><span className="text-slate-500">INCIDENT: </span><span className="text-white font-bold">{selectedCall.incident}</span></div>
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
                                    </div>
                                    <div className="px-3 md:px-4 pb-3 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
                                        <div>
                                            <div className="text-[9px] text-slate-500 mb-1 flex items-center gap-1"><History className="w-3 h-3" /> CAD TIMELINE / NOTES</div>
                                            <div className="bg-[#111827] border border-[#263653] rounded max-h-24 overflow-y-auto">
                                                {callNotes.length === 0 ? <div className="p-2 text-[9px] text-slate-600">No dispatcher notes recorded.</div> : callNotes.map(note => (
                                                    <div key={note.id} className="px-2 py-1.5 border-b border-[#1e2d4a] last:border-0 text-[9px]">
                                                        <div className="flex gap-2 text-slate-500"><span className="text-blue-300">{rankLastName(note.author_name)}</span><span>{new Date(note.created_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
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
                            <div className="flex min-h-0 flex-1 flex-col md:hidden">
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
                                        <TileLayer
                                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                                        />
                                        <ActiveCallMarkers
                                            calls={activeCalls}
                                            onCallClick={handleSelectCall}
                                        />
                                        <OfficerDistressMarker autoCenter={true} />
                                    </MapContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ═══ RIGHT: UNITS ═══ */}
                    <div className={`${mobileView === 'assignment' || mobileView === 'units' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col bg-[#08111b] md:flex md:min-h-0 md:w-64 md:flex-none xl:w-72`}> 
                        {/* Unit Assignment */}
                        <div className={`${mobileView === 'units' ? 'hidden' : 'block'} flex-none border-b border-[#1e2d4a] md:block`}>
                            <div className="px-3 py-1.5 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                <span className="text-[10px] font-bold text-blue-400 tracking-widest">UNIT ASSIGNMENT</span>
                            </div>
                            <div className="p-2 max-h-48 overflow-y-auto">
                                <UnitAssignmentPanel
                                    call={selectedCall}
                                    units={units}
                                    onUpdate={handleUpdate}
                                />
                            </div>
                        </div>

                        {/* Shared CAD Unit Status Board */}
                        <div className={`${mobileView === 'assignment' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col md:flex`}>
                            <CADUnitStatusBoard units={statusUnits} compact />
                        </div>
                    </div>
                </div>
            )}

            {showMap && (
                <div className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/75 p-6 backdrop-blur-sm md:flex" onClick={() => setShowMap(false)}>
                    <div className="flex h-[82vh] w-[88vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-blue-800/60 bg-[#07101c] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 border-b border-[#1e2d4a] bg-[#0d1220] px-4 py-3">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            <span className="text-xs font-black tracking-widest text-emerald-300">LIVE TACTICAL MAP</span>
                            <button onClick={() => setShowMap(false)} className="ml-auto rounded border border-slate-700 px-3 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800">CLOSE</button>
                        </div>
                        <div className="min-h-0 flex-1">
                            <MapContainer center={[37.5407, -77.4360]} zoom={11} className="h-full w-full" zoomControl={true}>
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
                                <ActiveCallMarkers calls={activeCalls} onCallClick={handleSelectCall} />
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