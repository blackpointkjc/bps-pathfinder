import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Shield, Radio, Map as MapIcon, RefreshCw, Plus, Search, Clock3, MessageSquarePlus, AlertTriangle, History, FileText, Megaphone, Activity } from 'lucide-react';
import { lookupDistrict } from '@/utils/districtLookup';
import { createPageUrl } from '../utils';
import { stopAllAlerts } from '@/utils/alertUtils';
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
    const [showMap, setShowMap] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [monitoredProperties, setMonitoredProperties] = useState([]);
    const [pendingAlertCall, setPendingAlertCall] = useState(null);
    const [queueFilter, setQueueFilter] = useState('all');
    const [queueSearch, setQueueSearch] = useState('');
    const [callNotes, setCallNotes] = useState([]);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const knownCallIdsRef = React.useRef(null);
    const syncingGracRef = React.useRef(false);

    useEffect(() => {
        init();
        loadMonitoredProperties();
        
        const syncLiveFeed = async () => {
            if (syncingGracRef.current || document.hidden) return;
            syncingGracRef.current = true;
            try {
                await base44.functions.invoke('ingestGractivecalls', {});
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
        }, 5000);
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
            const props = await base44.entities.MonitoredProperty.list();
            setMonitoredProperties(props?.filter(p => p.enabled) || []);
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
            console.log('📋 Dispatch loaded units:', allUsers.length);
            console.log('📋 Units data:', allUsers);
            setUnits(allUsers || []);
        } catch (error) {
            console.error('Error loading units:', error);
            setUnits([]);
        }
    };

    const loadActiveCalls = async () => {
       try {
            const calls = await base44.entities.DispatchCall.list('-created_date', 200);

            // Show every active CAD call, including dispatcher-created calls and GRAC imports.
            const recentCalls = calls.filter(call =>
                !['Cleared', 'Cancelled'].includes(call.status)
            );

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
                    setPendingAlertCall(newCall);
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
                author_name: currentUser?.full_name || 'Dispatch',
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

    const [quickCallType, setQuickCallType] = useState(null);
    
    const handleQuickDispatch = (callType) => {
        setQuickCallType(callType);
        setShowCreateDialog(true);
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

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const result = await base44.functions.invoke('ingestGractivecalls', {});
            await Promise.all([loadActiveCalls(), loadUnits()]);
            toast.success(`GRAC feed synchronized: ${result?.data?.active ?? activeCalls.length} active`, { id: 'refresh', duration: 3000 });
        } catch (error) {
            toast.error('Refresh failed', { id: 'refresh' });
        } finally {
            setRefreshing(false);
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

    const statusColor = (status) => {
        if (status === 'Available') return 'bg-green-500';
        if (status === 'Enroute') return 'bg-yellow-400';
        if (status === 'On Scene') return 'bg-blue-500';
        if (status === 'Busy') return 'bg-orange-500';
        return 'bg-slate-500';
    };

    const allCalls = activeCalls;

    const handleAcknowledge = () => {
        stopAllAlerts();
        setPendingAlertCall(null);
    };



    return (
        <div className="h-screen flex flex-col bg-[#0a0e1a] text-white overflow-hidden font-mono">
            <OfficerDistressBanner currentUser={currentUser} isDispatchOrAdmin={true} />
            <NewCallAlert call={pendingAlertCall} onAcknowledge={handleAcknowledge} />

            {/* ══ TOP SYSTEM BAR ══ */}
            <div className="flex-none h-9 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center px-3 gap-3">
                <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#f5a623]" />
                    <span className="text-[#f5a623] font-bold text-xs tracking-widest">BPS CAD</span>
                    <span className="text-slate-500 text-xs">|</span>
                    <span className="text-slate-300 text-xs">DISPATCH CENTER</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
                    <span className="text-green-400 text-[10px]">ONLINE</span>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                    <button onClick={handleRefresh} disabled={refreshing}
                        className="flex items-center gap-1 px-2 py-1 bg-[#1a2a40] hover:bg-[#243550] border border-[#2a3f60] rounded text-[10px] text-green-400">
                        <RefreshCw className={`w-2.5 h-2.5 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'REFRESHING' : 'REFRESH FEED'}
                    </button>

                    <button onClick={() => setShowMap(!showMap)}
                        className={`px-2 py-1 border rounded text-[10px] ${
                            showMap ? 'border-blue-500/40 text-blue-400 bg-blue-900/20' : 'border-slate-600 text-slate-500'
                        }`}>
                        <MapIcon className="w-2.5 h-2.5" />
                    </button>
                    <button onClick={() => setShowPriorCalls(!showPriorCalls)}
                        className={`px-2 py-1 border rounded text-[10px] ${
                            showPriorCalls ? 'border-amber-500/40 text-amber-400' : 'border-slate-600 text-slate-400 hover:text-white'
                        }`}>
                        {showPriorCalls ? 'ACTIVE' : 'PRIOR'}
                    </button>
                    <button onClick={() => setShowMessaging(!showMessaging)}
                        className="px-2 py-1 border border-slate-600 text-slate-400 hover:text-white rounded text-[10px]">MSG</button>
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

            {/* ══ SORT CONTROLS ══ */}
            <div className="flex-none flex items-center gap-2 px-3 py-1 bg-[#0a0e1a] border-b border-[#1e2d4a]">
                <span className="text-[10px] text-slate-500">SORT:</span>
                <button onClick={() => setSortOrder('desc')} className={`px-2 py-0.5 rounded text-[10px] border ${
                    sortOrder === 'desc' ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/10' : 'border-slate-700 text-slate-500'
                }`}>NEWEST</button>
                <button onClick={() => setSortOrder('asc')} className={`px-2 py-0.5 rounded text-[10px] border ${
                    sortOrder === 'asc' ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/10' : 'border-slate-700 text-slate-500'
                }`}>OLDEST</button>
                <span className="ml-3 text-[10px] text-slate-500">TOTAL ACTIVE: <span className="text-white font-bold">{allCalls.length}</span></span>
            </div>

            {/* ══ MAIN GRID ══ */}
            {showPriorCalls ? (
                <div className="flex-1 overflow-auto p-3">
                    <PriorCallsView currentUser={currentUser} units={units} />
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex overflow-hidden">

                    {/* ═══ LEFT: ACTIVE CALLS TABLE ═══ */}
                    <div className="w-[340px] flex-none flex flex-col border-r border-[#1e2d4a]">
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
                        <div className="flex-1 overflow-y-auto" style={{maxHeight: '45%'}}>
                            {allCalls.length === 0 ? (
                                <div className="text-[10px] text-slate-600 text-center py-4">NO ACTIVE CALLS</div>
                            ) : allCalls.map(call => (
                                <div key={call.id} onClick={() => handleSelectCall(call)}
                                    className={`grid grid-cols-12 px-2 py-1.5 border-b border-[#1a2535] cursor-pointer transition-colors ${
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
                                        <div className="text-[10px] text-white font-bold truncate leading-tight">{call.incident}</div>
                                        <div className="text-[9px] text-slate-400 truncate">{call.location}</div>
                                    </div>
                                    <div className="col-span-5 text-[9px] text-slate-400 text-right pr-1">
                                        {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>

                    {/* ═══ CENTER: MAP + CALL DETAIL ═══ */}
                    <div className="flex-1 min-w-0 flex flex-col border-r border-[#1e2d4a]">
                        {/* Call Detail */}
                        <div className="flex-none border-b border-[#1e2d4a]" style={{minHeight: 0}}>
                            {selectedCall ? (
                                <div className="overflow-auto" style={{maxHeight: '220px'}}>
                                    <div className="px-4 py-2 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center gap-3">
                                        <span className="text-[#f5a623] font-bold text-xs">EVENT #{selectedCall.id?.slice(-8).toUpperCase()}</span>
                                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${priorityBg(selectedCall.priority)}`}>{(selectedCall.priority || 'low').toUpperCase()}</span>
                                        <span className="text-[10px] text-slate-400">{selectedCall.status}</span>
                                        <span className="ml-auto text-[9px] text-slate-500">
                                            RECV: {new Date(selectedCall.time_received || selectedCall.created_date).toLocaleString('en-US', {timeZone:'America/New_York', month:'2-digit', day:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    <div className="px-4 py-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                                        <div><span className="text-slate-500">INCIDENT: </span><span className="text-white font-bold">{selectedCall.incident}</span></div>
                                        <div><span className="text-slate-500">AGENCY: </span><span className="text-white">{selectedCall.agency || '—'}</span></div>
                                        <div><span className="text-slate-500">PRIORITY: </span><span className="text-white">{selectedCall.priority ? selectedCall.priority.charAt(0).toUpperCase() + selectedCall.priority.slice(1).toLowerCase() : '—'}</span></div>
                                        <div className="col-span-2"><span className="text-slate-500">LOCATION: </span><span className="text-white">{selectedCall.location}</span></div>
                                        {selectedCall.caller_name && <div><span className="text-slate-500">CALLER: </span><span className="text-white">{selectedCall.caller_name}</span></div>}
                                        {selectedCall.caller_phone && <div><span className="text-slate-500">PHONE: </span><span className="text-white">{selectedCall.caller_phone}</span></div>}
                                        <div><span className="text-slate-500">DISTRICT/PCT: </span><span className="text-white">{callDistrict !== null ? callDistrict : selectedCall.zone || '—'}</span></div>
                                    </div>
                                    {selectedCall.description && (
                                        <div className="px-4 pb-2">
                                            <div className="text-[9px] text-slate-500 mb-1">NARRATIVE</div>
                                            <div className="text-[10px] text-slate-300 bg-[#111827] rounded p-2 leading-relaxed">{selectedCall.description}</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-16 text-[10px] text-slate-600">
                                    SELECT A CALL TO VIEW DETAILS
                                </div>
                            )}
                        </div>

                        {/* MAP */}
                        {showMap && (
                            <div className="flex-1 min-h-0 flex flex-col">
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
                    <div className="w-64 flex-none flex flex-col">
                        {/* Unit Assignment */}
                        <div className="flex-none border-b border-[#1e2d4a]">
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

                        {/* Active Units */}
                        <div className="flex-1 min-h-0 flex flex-col">
                            <div className="flex-none px-3 py-1.5 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                <span className="text-[10px] font-bold text-green-400 tracking-widest">ACTIVE UNITS</span>
                                <span className="ml-auto text-[10px] bg-green-500/20 text-green-300 px-2 rounded-full border border-green-500/30">{units.filter(u => u.status && u.status !== 'Out of Service').length}</span>
                            </div>
                            {/* Units table header */}
                            <div className="flex-none grid grid-cols-12 px-2 py-1 bg-[#111827] border-b border-[#1e2d4a] text-[9px] text-slate-500 uppercase">
                                <div className="col-span-1"></div>
                                <div className="col-span-7">UNIT</div>
                                <div className="col-span-4">STATUS</div>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {units.filter(u => u.status && u.status !== 'Out of Service').length === 0 ? (
                                    <div className="text-[10px] text-slate-600 text-center py-4">NO ACTIVE UNITS</div>
                                ) : units.filter(u => u.status && u.status !== 'Out of Service').map(unit => (
                                    <div key={unit.id} className="grid grid-cols-12 px-2 py-1.5 border-b border-[#1a2535] hover:bg-[#111827]">
                                        <div className="col-span-1 flex items-center">
                                            <span className={`w-2 h-2 rounded-full ${statusColor(unit.status)}`} />
                                        </div>
                                        <div className="col-span-7">
                                            <div className="text-[10px] text-white font-bold truncate">{unit.unit_number || unit.full_name}</div>
                                            {unit.current_call_info && <div className="text-[9px] text-slate-500 truncate">{unit.current_call_info}</div>}
                                        </div>
                                        <div className="col-span-4">
                                            <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${
                                                unit.status === 'Available' ? 'bg-green-700/60 text-green-300' :
                                                unit.status === 'Enroute' ? 'bg-yellow-700/60 text-yellow-300' :
                                                unit.status === 'On Scene' ? 'bg-blue-700/60 text-blue-300' :
                                                'bg-slate-700 text-slate-400'
                                            }`}>{unit.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ BOTTOM STATUS BAR ══ */}
            <div className="flex-none h-6 bg-[#0d1220] border-t border-[#1e2d4a] flex items-center px-3 gap-4 text-[9px] text-slate-500">
                <span>CALLS: <span className="text-white">{allCalls.length}</span></span>
                <span>UNITS ACTIVE: <span className="text-green-400">{units.filter(u => u.status && u.status !== 'Out of Service').length}</span></span>
                <span>UNASSIGNED: <span className="text-yellow-400">{allCalls.filter(c => !c.assigned_units?.length).length}</span></span>
                <div className="flex-1" />
                <span className="text-green-400 font-bold">● ONLINE</span>
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
                    onClose={() => {
                        setShowCreateDialog(false);
                        setQuickCallType(null);
                    }}
                    onCreated={handleCallCreated}
                    initialCallType={quickCallType?.type}
                    initialPriority={quickCallType?.priority}
                />
            )}
        </div>
    );
}