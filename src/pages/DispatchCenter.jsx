import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Plus, Shield, Radio, AlertCircle, Car, Map as MapIcon, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import ActiveCallsQueue from '@/components/dispatch/ActiveCallsQueue';
import CallDetailPanel from '@/components/dispatch/CallDetailPanel';
import UnitsPanel from '@/components/dispatch/UnitsPanel';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import PriorCallsView from '@/components/dispatch/PriorCallsView';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import UnitScheduling from '@/components/dispatch/UnitScheduling';
import QuickActions from '@/components/dispatch/QuickActions';
import UnitAssignmentPanel from '@/components/dispatch/UnitAssignmentPanel';
import 'leaflet/dist/leaflet.css';

// Play a dispatch alert tone using Web Audio API
function playDispatchAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const tones = [
            { freq: 880, start: 0, duration: 0.12 },
            { freq: 1100, start: 0.15, duration: 0.12 },
            { freq: 880, start: 0.30, duration: 0.12 },
            { freq: 1100, start: 0.45, duration: 0.18 },
        ];
        tones.forEach(({ freq, start, duration }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
            gain.gain.setValueAtTime(0, ctx.currentTime + start);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.01);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + duration + 0.05);
        });
    } catch (e) {
        // silently fail if audio not available
    }
}

export default function DispatchCenter() {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);
    const [sortOrder, setSortOrder] = useState('desc');
    const [showMap, setShowMap] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const knownCallIdsRef = React.useRef(null);

    useEffect(() => {
        init();
        
        // Real-time updates every 60 seconds
        const interval = setInterval(() => {
            loadActiveCalls();
            loadUnits();
        }, 60000);
        
        // Auto-ingest every 5 minutes for real-time feed
        const scrapeInterval = setInterval(async () => {
            try {
                await base44.functions.invoke('ingestGractivecalls', {});
                loadActiveCalls();
            } catch (error) {
                console.error('Auto-ingest failed:', error);
            }
        }, 5 * 60 * 1000);
        
        return () => {
            clearInterval(interval);
            clearInterval(scrapeInterval);
        };
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Check if user has dispatch access (admin or dispatch role)
            const hasDispatchAccess = user.role === 'admin' || user.role === 'dispatch' || user.dispatch_role === true;
            
            if (!hasDispatchAccess) {
                toast.error('Unauthorized - Dispatch access required');
                navigate(createPageUrl('CADHome'));
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

            const twelveHoursAgo = new Date();
            twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

            const recentCalls = calls.filter(call => {
                const callTime = new Date(call.time_received || call.created_date);
                const isRecent = callTime >= twelveHoursAgo;
                const isActive = !call.status || !['Closed', 'Cleared', 'Cancelled'].includes(call.status);
                return isRecent && isActive;
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
                if (newCallIds.length > 0 && soundEnabled) {
                    playDispatchAlert();
                    toast.info(`${newCallIds.length} new call${newCallIds.length > 1 ? 's' : ''} received`, {
                        duration: 4000,
                        style: { background: '#1e3a5f', color: 'white', border: '1px solid #3b82f6' }
                    });
                }
                knownCallIdsRef.current = currentIds;
            }

            console.log('📞 Dispatch active calls:', recentCalls.length);
            setActiveCalls(recentCalls);
         } catch (error) {
             console.error('Error loading active calls:', error);
         }
    };

    const handleSelectCall = (call) => {
        setSelectedCall(call);
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
            toast.loading('Scraping live feed...', { id: 'refresh' });
            await base44.functions.invoke('ingestGractivecalls', {});
            await Promise.all([loadActiveCalls(), loadUnits()]);
            toast.success('Feed refreshed', { id: 'refresh', duration: 3000 });
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

    const priorityColor = (priority) => {
        if (priority === 'critical') return 'border-l-red-500 bg-red-950/20';
        if (priority === 'high') return 'border-l-orange-500 bg-orange-950/20';
        if (priority === 'medium') return 'border-l-yellow-500 bg-yellow-950/10';
        return 'border-l-slate-600 bg-slate-900';
    };

    const statusDot = (status) => {
        if (status === 'Available') return 'bg-green-400';
        if (status === 'Enroute') return 'bg-yellow-400';
        if (status === 'On Scene') return 'bg-blue-400';
        return 'bg-gray-400';
    };

    return (
        <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
            {/* ── TOP COMMAND BAR ── */}
            <div className="flex-none bg-slate-900 border-b border-slate-700 px-4 py-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-red-400" />
                    <span className="text-white font-bold font-mono tracking-widest text-sm">BPS DISPATCH CENTER</span>
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-1" />
                    <span className="text-green-400 font-mono text-xs">LIVE</span>
                </div>
                <div className="flex gap-1 ml-2">
                    <button onClick={() => setSortOrder('desc')} className={`px-2 py-1 rounded text-xs font-mono border ${sortOrder==='desc' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}>NEWEST</button>
                    <button onClick={() => setSortOrder('asc')} className={`px-2 py-1 rounded text-xs font-mono border ${sortOrder==='asc' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}>OLDEST</button>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                    <Button onClick={handleRefresh} disabled={refreshing} size="sm" className="bg-emerald-700 hover:bg-emerald-600 font-mono text-xs h-8">
                        <RefreshCw className={`w-3 h-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'REFRESHING...' : 'REFRESH FEED'}
                    </Button>
                    <button onClick={() => setSoundEnabled(!soundEnabled)} className={`px-2 py-1 rounded border text-xs font-mono ${soundEnabled ? 'border-green-500/50 text-green-400' : 'border-slate-600 text-slate-500'}`}>
                        {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    </button>
                    <button onClick={() => setShowMap(!showMap)} className={`px-2 py-1 rounded border text-xs font-mono ${showMap ? 'border-blue-500/50 text-blue-400' : 'border-slate-600 text-slate-500'}`}>
                        <MapIcon className="w-3 h-3" />
                    </button>
                    <button onClick={() => setShowPriorCalls(!showPriorCalls)} className={`px-2 py-1 rounded border text-xs font-mono ${showPriorCalls ? 'border-amber-500/50 text-amber-400' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                        {showPriorCalls ? 'ACTIVE' : 'PRIOR CALLS'}
                    </button>
                    <button onClick={() => setShowMessaging(!showMessaging)} className="px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-white text-xs font-mono">MSG</button>
                    <Button onClick={() => setShowCreateDialog(true)} size="sm" className="bg-red-600 hover:bg-red-700 font-mono text-xs h-8">
                        <Radio className="w-3 h-3 mr-1" /> NEW CALL
                    </Button>
                    {currentUser?.role === 'admin' && (
                        <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-800 font-mono text-xs h-8" onClick={() => navigate(createPageUrl('AdminPortal'))}>
                            <Shield className="w-3 h-3 mr-1" /> ADMIN
                        </Button>
                    )}
                </div>
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="flex-none border-b border-slate-800 px-3 py-1.5">
                <QuickActions onCreateCall={handleQuickDispatch} />
            </div>

            {/* ── MAIN DISPATCH GRID ── */}
            {showPriorCalls ? (
                <div className="flex-1 overflow-auto p-3">
                    <PriorCallsView currentUser={currentUser} units={units} />
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">

                    {/* ── COLUMN 1: CALLS LIST ── */}
                    <div className="w-72 flex-none flex flex-col border-r border-slate-800 bg-slate-950">
                        {/* Police Calls */}
                        <div className="flex-1 min-h-0 flex flex-col border-b border-slate-800">
                            <div className="flex-none px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-xs font-bold font-mono text-amber-400 tracking-widest">POLICE CALLS</span>
                                <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">{activeCalls.filter(c => c.source).length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {activeCalls.filter(c => c.source).length === 0 ? (
                                    <div className="text-xs text-slate-500 text-center mt-6 font-mono">NO ACTIVE CALLS</div>
                                ) : activeCalls.filter(c => c.source).map(call => (
                                    <div
                                        key={call.id}
                                        onClick={() => handleSelectCall(call)}
                                        className={`border-l-4 border-b border-slate-800 px-3 py-2 cursor-pointer transition-all ${
                                            selectedCall?.id === call.id
                                                ? 'bg-blue-900/40 border-l-blue-400'
                                                : `${priorityColor(call.priority)} hover:brightness-110`
                                        }`}
                                    >
                                        <div className="text-xs font-bold text-white font-mono leading-tight truncate">{call.incident}</div>
                                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{call.location}</div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}
                                            </span>
                                            {call.priority && <span className={`text-[9px] font-bold px-1.5 rounded font-mono ${
                                                call.priority === 'critical' ? 'bg-red-600 text-white' :
                                                call.priority === 'high' ? 'bg-orange-500 text-white' :
                                                call.priority === 'medium' ? 'bg-yellow-600 text-white' : 'bg-slate-600 text-slate-300'
                                            }`}>{call.priority?.toUpperCase()}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Dispatch Calls */}
                        <div className="flex-1 min-h-0 flex flex-col">
                            <div className="flex-none px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-xs font-bold font-mono text-red-400 tracking-widest">DISPATCH CALLS</span>
                                <span className="text-xs font-mono bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/30">{activeCalls.filter(c => !c.source).length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {activeCalls.filter(c => !c.source).length === 0 ? (
                                    <div className="text-xs text-slate-500 text-center mt-6 font-mono">NO DISPATCH CALLS</div>
                                ) : activeCalls.filter(c => !c.source).map(call => (
                                    <div
                                        key={call.id}
                                        onClick={() => handleSelectCall(call)}
                                        className={`border-l-4 border-b border-slate-800 px-3 py-2 cursor-pointer transition-all ${
                                            selectedCall?.id === call.id
                                                ? 'bg-blue-900/40 border-l-blue-400'
                                                : `${priorityColor(call.priority)} hover:brightness-110`
                                        }`}
                                    >
                                        <div className="text-xs font-bold text-white font-mono leading-tight truncate">{call.incident}</div>
                                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{call.location}</div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}
                                            </span>
                                            {call.priority && <span className={`text-[9px] font-bold px-1.5 rounded font-mono ${
                                                call.priority === 'critical' ? 'bg-red-600 text-white' :
                                                call.priority === 'high' ? 'bg-orange-500 text-white' :
                                                call.priority === 'medium' ? 'bg-yellow-600 text-white' : 'bg-slate-600 text-slate-300'
                                            }`}>{call.priority?.toUpperCase()}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── COLUMN 2: MAP + UNIT ASSIGNMENT ── */}
                    <div className="flex-1 min-w-0 flex flex-col border-r border-slate-800">
                        {/* Map */}
                        {showMap && (
                            <div className="flex-1 min-h-0 flex flex-col">
                                <div className="flex-none px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-bold font-mono text-emerald-400 tracking-widest">LIVE TACTICAL MAP</span>
                                </div>
                                <div className="flex-1 relative">
                                    <MapContainer
                                        center={[37.5407, -77.4360]}
                                        zoom={11}
                                        className="h-full w-full"
                                        zoomControl={true}
                                        style={{ zIndex: 0 }}
                                    >
                                        <TileLayer
                                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                                        />
                                        <ActiveCallMarkers
                                            calls={activeCalls}
                                            onCallClick={handleSelectCall}
                                        />
                                    </MapContainer>
                                </div>
                            </div>
                        )}

                        {/* Unit Assignment */}
                        <div className="flex-none h-52 border-t border-slate-800 flex flex-col">
                            <div className="flex-none px-3 py-2 bg-slate-900 border-b border-slate-800">
                                <span className="text-xs font-bold font-mono text-blue-400 tracking-widest">UNIT ASSIGNMENT</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2">
                                <UnitAssignmentPanel
                                    call={selectedCall}
                                    units={units}
                                    onUpdate={handleUpdate}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── COLUMN 3: CALL DETAIL + ACTIVE UNITS ── */}
                    <div className="w-80 flex-none flex flex-col bg-slate-950">
                        {/* Call Detail */}
                        <div className="flex-1 min-h-0 overflow-hidden border-b border-slate-800">
                            <CallDetailPanel
                                call={selectedCall}
                                currentUser={currentUser}
                                onUpdate={handleUpdate}
                                units={units}
                            />
                        </div>

                        {/* Active Units */}
                        <div className="flex-none h-56 flex flex-col">
                            <div className="flex-none px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-xs font-bold font-mono text-green-400 tracking-widest">ACTIVE UNITS</span>
                                <span className="text-xs font-mono bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-500/30">{units.filter(u => u.status && u.status !== 'Out of Service').length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {units.filter(u => u.status && u.status !== 'Out of Service').length === 0 ? (
                                    <div className="text-xs text-slate-500 text-center mt-4 font-mono">NO ACTIVE UNITS</div>
                                ) : units.filter(u => u.status && u.status !== 'Out of Service').map(unit => (
                                    <div key={unit.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-900 border border-slate-800">
                                        <span className={`w-2 h-2 rounded-full flex-none ${statusDot(unit.status)}`} />
                                        <span className="text-xs font-bold text-white font-mono flex-1 truncate">{unit.unit_number || unit.full_name}</span>
                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                            unit.status === 'Available' ? 'bg-green-700/50 text-green-300' :
                                            unit.status === 'Enroute' ? 'bg-yellow-700/50 text-yellow-300' :
                                            unit.status === 'On Scene' ? 'bg-blue-700/50 text-blue-300' :
                                            'bg-slate-700 text-slate-400'
                                        }`}>{unit.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

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