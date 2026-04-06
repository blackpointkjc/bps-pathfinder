import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import VACountiesBoundaries from '@/components/map/VACountiesBoundaries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Layers, RefreshCw, Radio, MapPin, Users, Activity,
    Eye, EyeOff, Wifi, WifiOff, Crosshair, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Navigation() {
    const navigate = useNavigate();
    const [currentLocation, setCurrentLocation] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [otherUnits, setOtherUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isLiveTracking, setIsLiveTracking] = useState(false);
    const [showActiveCalls, setShowActiveCalls] = useState(true);
    const [heading, setHeading] = useState(null);
    const [speed, setSpeed] = useState(0);
    const [locationHistory, setLocationHistory] = useState([]);
    const [unitStatus, setUnitStatus] = useState('Available');
    const [showLights, setShowLights] = useState(false);
    const [unitName, setUnitName] = useState(localStorage.getItem('unitName') || '');
    const [mapTheme, setMapTheme] = useState(() => {
        const saved = localStorage.getItem('mapTheme');
        if (saved) return saved;
        const h = new Date().getHours();
        return h >= 6 && h < 19 ? 'day' : 'night';
    });
    const [showCallSidebar, setShowCallSidebar] = useState(false);
    const [selectedCall, setSelectedCall] = useState(null);
    const [jurisdictionFilters] = useState({
        baseMapType: 'street', showPoliceStations: true, showFireStations: false,
        showEMS: false, showJails: true
    });
    const [isLoadingCalls, setIsLoadingCalls] = useState(false);

    const locationWatchId = useRef(null);
    const lastPosition = useRef(null);
    const lastUpdateRef = useRef(0);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, []);

    useEffect(() => {
        init();
        return () => stopTracking();
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        fetchOtherUnits();
        const i = setInterval(fetchOtherUnits, 8000);
        return () => clearInterval(i);
    }, [currentUser]);

    useEffect(() => {
        fetchCalls();
        const i = setInterval(fetchCalls, 30000);
        return () => clearInterval(i);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            if (user.status) setUnitStatus(user.status);
        } catch (e) {}
        startTracking();
    };

    const handleStatusChange = async (newStatus) => {
        setUnitStatus(newStatus);
        try {
            await base44.functions.invoke('updateOfficerStatus', { status: newStatus });
        } catch (e) {}
    };

    const startTracking = () => {
        if (!navigator.geolocation) return;
        if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current);
        setIsLiveTracking(true);
        locationWatchId.current = navigator.geolocation.watchPosition(
            (pos) => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                setCurrentLocation(coords);
                if (pos.coords.heading !== null && pos.coords.heading >= 0) setHeading(pos.coords.heading);
                if (pos.coords.speed !== null) setSpeed(Math.round((pos.coords.speed || 0) * 2.237));
                setLocationHistory(prev => [...prev, coords].slice(-30));
                lastPosition.current = coords;
                pushLocationUpdate(coords, pos.coords.heading, pos.coords.speed ? pos.coords.speed * 2.237 : 0);
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    setIsLiveTracking(false);
                    toast.error('Location permission denied');
                } else {
                    navigator.geolocation.clearWatch(locationWatchId.current);
                    setTimeout(startTracking, 3000);
                }
            },
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    };

    const stopTracking = () => {
        if (locationWatchId.current) {
            navigator.geolocation.clearWatch(locationWatchId.current);
            locationWatchId.current = null;
        }
        setIsLiveTracking(false);
    };

    const pushLocationUpdate = useCallback(async (coords, hdg, spd) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < 5000) return;
        lastUpdateRef.current = now;
        try {
            // Only update location fields — never overwrite status here
            // Status is only changed by explicit user action
            await base44.auth.updateMe({
                latitude: coords[0], longitude: coords[1],
                heading: hdg || 0, speed: spd || 0,
                last_updated: new Date().toISOString()
            });
        } catch (e) {}
    }, []);

    const recenter = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                setCurrentLocation([pos.coords.latitude, pos.coords.longitude]);
                toast.success('Location updated');
            }, () => toast.error('Unable to get location'), { enableHighAccuracy: true, timeout: 10000 });
        }
    };

    const fetchOtherUnits = async () => {
        try {
            const res = await base44.functions.invoke('fetchAllUsers', {});
            setOtherUnits(res.data?.users || []);
        } catch (e) {}
    };

    const fetchCalls = async () => {
        setIsLoadingCalls(true);
        try {
            const all = await base44.entities.DispatchCall.list('-created_date', 200);
            setActiveCalls(all.filter(c => !['Closed', 'Cleared', 'Cancelled'].includes(c.status)));
        } catch (e) {} finally { setIsLoadingCalls(false); }
    };

    // Include current user in the board with live status, merge with other units
    const selfEntry = currentUser ? { ...currentUser, status: unitStatus } : null;
    const otherOnline = otherUnits.filter(u => u.last_updated && Date.now() - new Date(u.last_updated) < 12 * 3600000);
    const onlineUnits = selfEntry ? [selfEntry, ...otherOnline] : otherOnline;
    const availableCount = onlineUnits.filter(u => u.status === 'Available').length;

    const isSupervisorUser = currentUser?.is_supervisor === true || currentUser?.role === 'admin';

    const ACTIVE_STATUSES = ['Available', 'On Patrol', 'Enroute', 'On Scene', 'Busy', 'Supervisor'];
    const unitsByStatus = ACTIVE_STATUSES.reduce((acc, s) => {
        acc[s] = onlineUnits.filter(u => u.status === s);
        return acc;
    }, {});

    const STATUS_COLORS = {
        'Available': 'bg-gray-500',
        'On Patrol': 'bg-indigo-500',
        'Enroute': 'bg-red-500',
        'On Scene': 'bg-green-500',
        'Busy': 'bg-yellow-500',
        'Supervisor': 'bg-yellow-400',
        'Out of Service': 'bg-slate-600',
    };

    const ALL_STATUSES = [
        { label: 'Available', color: 'bg-gray-500' },
        { label: 'On Patrol', color: 'bg-indigo-500' },
        { label: 'Enroute', color: 'bg-red-500' },
        { label: 'On Scene', color: 'bg-green-500' },
        { label: 'Busy', color: 'bg-yellow-500' },
        ...(isSupervisorUser ? [{ label: 'Supervisor', color: 'bg-yellow-400' }] : []),
        { label: 'Out of Service', color: 'bg-slate-600' },
    ];

    return (
        <div className="h-screen w-screen relative overflow-hidden bg-slate-950">
            {/* Map fills everything */}
            <div className="absolute inset-0">
                <MapView
                    currentLocation={currentLocation}
                    destination={null}
                    route={null}
                    trafficSegments={null}
                    useOfflineTiles={!isOnline}
                    activeCalls={showActiveCalls ? activeCalls : []}
                    heading={heading}
                    locationHistory={isLiveTracking ? locationHistory : []}
                    unitName={unitName || currentUser?.unit_number}
                    showLights={showLights}
                    otherUnits={otherUnits}
                    currentUserId={currentUser?.id}
                    speed={speed}
                    mapCenter={null}
                    isNavigating={false}
                    baseMapType={jurisdictionFilters.baseMapType}
                    jurisdictionFilters={jurisdictionFilters}
                    showPoliceStations={jurisdictionFilters.showPoliceStations}
                    showFireStations={jurisdictionFilters.showFireStations}
                    showJails={jurisdictionFilters.showJails}
                    searchPin={null}
                    mapTheme={mapTheme}
                    onCallClick={(call) => { setSelectedCall(call); setShowCallSidebar(true); }}
                >
                    <VACountiesBoundaries />
                </MapView>
            </div>

            {/* Back button */}
            <button
                onClick={() => navigate('/CommandDashboard')}
                className="absolute top-14 left-3 z-[1001] w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:border-gold transition-all pointer-events-auto"
                title="Go back"
            >
                <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Top status bar */}
            <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/80 backdrop-blur-sm border-b border-slate-800">
                    <Radio className="w-4 h-4 text-gold" />
                    <span className="text-gold font-mono text-xs font-bold">LIVE MAP</span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1.5">
                        {isOnline ? (
                            <Wifi className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                            <WifiOff className="w-3.5 h-3.5 text-red-400" />
                        )}
                        {isLiveTracking && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-[10px] pointer-events-auto">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1" />
                                GPS LIVE
                            </Badge>
                        )}
                        <Badge className="bg-slate-800 text-slate-300 font-mono text-[10px] border-slate-700 pointer-events-auto">
                            <Users className="w-2.5 h-2.5 mr-1" />{onlineUnits.length} UNITS
                        </Badge>
                        <Badge className="bg-slate-800 text-slate-300 font-mono text-[10px] border-slate-700 pointer-events-auto">
                            <Radio className="w-2.5 h-2.5 mr-1" />{activeCalls.length} CALLS
                        </Badge>
                        {speed > 2 && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 font-mono text-[10px] pointer-events-auto">
                                {speed} MPH
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Right control strip */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute right-3 top-16 z-[1001] flex flex-col gap-2 pointer-events-auto"
            >
                <button
                    onClick={recenter}
                    title="Recenter on my location"
                    className="w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:border-gold transition-all"
                >
                    <Crosshair className="w-4 h-4" />
                </button>
                <button
                    onClick={() => setShowActiveCalls(v => !v)}
                    title="Toggle active calls"
                    className={`w-10 h-10 rounded-xl backdrop-blur border flex items-center justify-center transition-all ${
                        showActiveCalls
                            ? 'bg-gold/20 border-gold/50 text-gold'
                            : 'bg-slate-900/90 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                >
                    {showActiveCalls ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                    onClick={() => { setMapTheme(t => t === 'day' ? 'night' : 'day'); }}
                    title="Toggle map theme"
                    className="w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:border-gold transition-all"
                >
                    <Layers className="w-4 h-4" />
                </button>
                <button
                    onClick={fetchCalls}
                    disabled={isLoadingCalls}
                    title="Refresh calls"
                    className="w-10 h-10 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:border-gold transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoadingCalls ? 'animate-spin' : ''}`} />
                </button>
            </motion.div>

            {/* Left panel: Unit Board + My Status side by side */}
            <div className="absolute bottom-6 left-3 z-[1001] pointer-events-auto flex flex-row gap-2 items-end max-w-[calc(100vw-60px)]">
                {/* My Status Selector */}
                <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl p-2 flex flex-col gap-1 flex-shrink-0">
                    <div className="text-[9px] text-slate-500 font-mono font-bold px-1 mb-0.5">MY STATUS</div>
                    {ALL_STATUSES.map(({ label, color }) => (
                        <button
                            key={label}
                            onClick={() => handleStatusChange(label)}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                unitStatus === label
                                    ? 'bg-white/10 text-white font-bold ring-1 ring-white/30'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* All Units Status Board */}
                <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl p-2 overflow-y-auto max-h-[calc(100vh-120px)] min-w-[140px]">
                    <div className="text-[9px] text-slate-500 font-mono font-bold px-1 mb-1">UNIT STATUS BOARD</div>
                    <div className="space-y-0.5">
                        {ACTIVE_STATUSES.filter(s => s !== 'Supervisor' || isSupervisorUser).map(s => {
                            const units = unitsByStatus[s] || [];
                            return (
                                <div key={s}>
                                    <div className="flex items-center gap-1.5 px-1 py-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[s]}`} />
                                        <span className="text-[9px] text-slate-500 font-mono font-bold">{s.toUpperCase()}</span>
                                        <span className="text-[9px] text-slate-600 font-mono ml-auto">{units.length}</span>
                                    </div>
                                    {units.map(u => (
                                        <div key={u.id} className="flex items-center gap-1.5 pl-4 pr-1 py-0.5">
                                            {u.is_supervisor && <span className="text-yellow-400 text-[9px]">★</span>}
                                            <span className="text-[10px] text-white font-mono truncate max-w-[120px]">
                                                {u.unit_number || u.full_name || 'Unit'}
                                            </span>
                                            {u.rank && <span className="text-[9px] text-slate-500 font-mono ml-auto">{u.rank}</span>}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                        {ACTIVE_STATUSES.filter(s => s !== 'Supervisor' || isSupervisorUser).every(s => (unitsByStatus[s] || []).length === 0) && (
                            <div className="text-[9px] text-slate-600 font-mono px-1 py-1">No active units</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Call detail sidebar */}
            {showCallSidebar && selectedCall && (
                <motion.div
                    initial={{ opacity: 0, x: 320 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 320 }}
                    className="absolute top-14 right-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur border-l border-slate-800 z-[1002] overflow-y-auto pointer-events-auto"
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                        <span className="text-white font-mono font-bold text-sm">CALL DETAIL</span>
                        <button onClick={() => setShowCallSidebar(false)} className="text-slate-400 hover:text-white">×</button>
                    </div>
                    <div className="p-4 space-y-3">
                        <div>
                            <div className="text-gold font-mono font-bold text-base">{selectedCall.incident}</div>
                            <div className="text-slate-400 text-xs font-mono flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />{selectedCall.location}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="bg-slate-800 rounded p-2">
                                <div className="text-slate-500">STATUS</div>
                                <div className="text-white font-bold">{selectedCall.status || 'New'}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-2">
                                <div className="text-slate-500">AGENCY</div>
                                <div className="text-white font-bold">{selectedCall.agency || '-'}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-2">
                                <div className="text-slate-500">PRIORITY</div>
                                <div className="text-white font-bold">{selectedCall.priority || '-'}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-2">
                                <div className="text-slate-500">ZONE</div>
                                <div className="text-white font-bold">{selectedCall.zone || '-'}</div>
                            </div>
                        </div>
                        {selectedCall.description && (
                            <div className="bg-slate-800 rounded p-3">
                                <div className="text-slate-500 text-xs font-mono mb-1">DESCRIPTION</div>
                                <div className="text-slate-300 text-xs">{selectedCall.description}</div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}