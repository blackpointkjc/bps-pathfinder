import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import CollapsePanelButton from '@/components/CollapsePanelButton';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import VACountiesBoundaries from '@/components/map/VACountiesBoundaries';
import { Badge } from '@/components/ui/badge';
import {
    Layers, RefreshCw, Radio, MapPin, Users, Activity,
    Eye, EyeOff, Wifi, WifiOff, Crosshair, ArrowLeft, Flame,
    ChevronLeft, ChevronRight, X, Clock, AlertTriangle, Shield, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { lookupDistrict } from '@/utils/districtLookup';
import { isCriticalCall } from '@/lib/cadCallUtils';
import { splitCallsByCoords, normalizeAddress } from '@/lib/geocodingPipeline';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressBanner from '@/components/dispatch/OfficerDistressBanner';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';

const PRIORITY_COLORS = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-600 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-slate-600 text-slate-200',
};
const STATUS_DOT = {
    'Available': 'bg-slate-400',
    'On Patrol': 'bg-indigo-400',
    'Enroute': 'bg-red-500',
    'On Scene': 'bg-green-400',
    'Busy': 'bg-yellow-400',
    'Supervisor': 'bg-yellow-300',
    'Out of Service': 'bg-slate-600',
};
const MY_STATUSES = [
    { label: 'Available', dot: 'bg-slate-400', shortcode: '10-8' },
    { label: 'On Patrol', dot: 'bg-indigo-400', shortcode: '10-98' },
    { label: 'Enroute', dot: 'bg-red-500', shortcode: '10-76' },
    { label: 'On Scene', dot: 'bg-green-400', shortcode: '10-23' },
    { label: 'Busy', dot: 'bg-yellow-400', shortcode: '10-6' },
    { label: 'Out of Service', dot: 'bg-slate-600', shortcode: '10-7' },
];

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
    const [callDistrict, setCallDistrict] = useState(null);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [isLoadingCalls, setIsLoadingCalls] = useState(false);
    const [unmappedCalls, setUnmappedCalls] = useState([]);
    const [showUnmapped, setShowUnmapped] = useState(false);
    const [leftPanelOpen, setLeftPanelOpen] = useState(true);
    const [leftTab, setLeftTab] = useState('units'); // 'units' | 'calls'
    const [monitoredProperties, setMonitoredProperties] = useState([]);
    const [showOnlyCriticalCalls, setShowOnlyCriticalCalls] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);

    const isSupervisorUser = currentUser?.is_supervisor === true || currentUser?.role === 'admin';
    const isDispatchOrAdmin = currentUser?.role === 'admin' || currentUser?.is_supervisor || currentUser?.dispatch_role;

    const [jurisdictionFilters] = useState({
        baseMapType: 'street', showPoliceStations: true, showFireStations: false,
        showEMS: false, showJails: true
    });

    const locationWatchId = useRef(null);
    const forcePollRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const unitStatusRef = useRef(unitStatus);

    const [focusCenter] = useState(() => {
        const p = new URLSearchParams(window.location.search);
        const lat = parseFloat(p.get('lat'));
        const lng = parseFloat(p.get('lng'));
        return lat && lng ? [lat, lng] : null;
    });
    const [mapCenter, setMapCenter] = useState(focusCenter);
    const focusCallId = new URLSearchParams(window.location.search).get('callId');

    useEffect(() => {
        init();
        return () => stopTracking();
    }, []);

    // Credit-free unit refresh: read officer profiles directly from Base44 entities.
    useEffect(() => {
        if (!currentUser) return;
        fetchOtherUnits();
        const i = setInterval(fetchOtherUnits, 15000);
        return () => clearInterval(i);
    }, [currentUser]);

    useEffect(() => {
        fetchCalls();
        loadMonitoredProperties();
        const i = setInterval(() => { fetchCalls(); loadMonitoredProperties(); }, 60000);
        return () => clearInterval(i);
    }, []);



    useEffect(() => { unitStatusRef.current = unitStatus; }, [unitStatus]);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            if (user.status) setUnitStatus(user.status);
        } catch (e) {}
        startTracking();
    };

    const handleSelfAssign = async () => {
        if (!currentUser || !selectedCall) return;
        setAssigning(true);
        try {
            const alreadyAssigned = selectedCall.assigned_units?.includes(currentUser.id);
            if (!alreadyAssigned) {
                await base44.entities.CallAssignment.create({
                    call_id: selectedCall.id,
                    unit_id: currentUser.id,
                    role: 'primary',
                    assigned_at: new Date().toISOString(),
                    status: 'accepted'
                });
                const updatedUnits = [...(selectedCall.assigned_units || []), currentUser.id];
                await base44.entities.DispatchCall.update(selectedCall.id, { assigned_units: updatedUnits });
                setSelectedCall(prev => ({ ...prev, assigned_units: updatedUnits }));
                await handleStatusChange('Enroute');
                toast.success('Assigned to call — status set to Enroute');
            }
        } catch (e) {
            toast.error('Failed to assign');
        } finally {
            setAssigning(false);
        }
    };

    const handleSelfUnassign = async () => {
        if (!currentUser || !selectedCall) return;
        setAssigning(true);
        try {
            const updatedUnits = (selectedCall.assigned_units || []).filter(id => id !== currentUser.id);
            await base44.entities.DispatchCall.update(selectedCall.id, { assigned_units: updatedUnits });
            setSelectedCall(prev => ({ ...prev, assigned_units: updatedUnits }));
            toast.success('Unassigned from call');
        } catch (e) {
            toast.error('Failed to unassign');
        } finally {
            setAssigning(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        setUnitStatus(newStatus);
        unitStatusRef.current = newStatus;
        try {
            await base44.auth.updateMe({ status: newStatus, last_updated: new Date().toISOString() });
            setCurrentUser(prev => prev ? { ...prev, status: newStatus, last_updated: new Date().toISOString() } : prev);
            fetchOtherUnits();
        } catch (e) {
            console.warn('[NAV] direct status update failed:', e?.message);
            toast.error('Unable to update status');
        }
    };

    // Credit-free GPS update: write the signed-in officer's profile directly.
    const pushLocationUpdate = useCallback(async (coords, hdg, spd, accuracy) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < 12000) return;
        lastUpdateRef.current = now;
        const [latitude, longitude] = coords;
        try {
            const update = {
                latitude,
                longitude,
                heading: Number.isFinite(hdg) ? hdg : 0,
                speed: Number.isFinite(spd) ? spd : 0,
                accuracy: Number.isFinite(accuracy) ? accuracy : 0,
                status: unitStatusRef.current,
                last_updated: new Date().toISOString(),
                show_on_map: true,
            };
            await base44.auth.updateMe(update);
            setCurrentUser(prev => prev ? { ...prev, ...update } : prev);
        } catch (e) {
            console.warn('[NAV] direct location update failed:', e?.message);
        }
    }, []);

    const startTracking = () => {
        if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
        if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current);
        if (forcePollRef.current) clearInterval(forcePollRef.current);
        setIsLiveTracking(true);

        locationWatchId.current = navigator.geolocation.watchPosition(
            (pos) => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                const hdg = (pos.coords.heading !== null && pos.coords.heading >= 0) ? pos.coords.heading : null;
                const spd = pos.coords.speed ? Math.round(pos.coords.speed * 2.237) : 0;
                setCurrentLocation(coords);
                if (hdg !== null) setHeading(hdg);
                setSpeed(spd);
                setLocationHistory(prev => [...prev, coords].slice(-30));
                pushLocationUpdate(coords, hdg, spd, pos.coords.accuracy || 0);
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    setIsLiveTracking(false);
                    toast.error('Location permission denied');
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );

        // Fallback poll every 20s (slower to avoid rate limits)
        forcePollRef.current = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = [pos.coords.latitude, pos.coords.longitude];
                    setCurrentLocation(coords);
                    pushLocationUpdate(coords, pos.coords.heading, pos.coords.speed ? pos.coords.speed * 2.237 : 0, pos.coords.accuracy);
                },
                () => {},
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
            );
        }, 20000);
    };

    const stopTracking = () => {
        if (locationWatchId.current) { navigator.geolocation.clearWatch(locationWatchId.current); locationWatchId.current = null; }
        if (forcePollRef.current) { clearInterval(forcePollRef.current); forcePollRef.current = null; }
        setIsLiveTracking(false);
    };

    const recenter = () => {
        navigator.geolocation?.getCurrentPosition(
            pos => { setCurrentLocation([pos.coords.latitude, pos.coords.longitude]); toast.success('Location updated'); },
            () => toast.error('Unable to get location'),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const fetchOtherUnits = async () => {
        try {
            const users = await base44.entities.User.list('-last_updated', 200);
            const cutoff = Date.now() - 12 * 60 * 60 * 1000;
            const visible = (users || []).filter(u => {
                if (u.id === currentUser?.id) return false;
                if (u.show_on_map === false) return false;
                const lat = Number(u.latitude), lng = Number(u.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
                const updated = u.last_updated ? new Date(u.last_updated).getTime() : 0;
                return updated >= cutoff;
            });
            setOtherUnits(visible);
        } catch (e) {
            console.warn('[NAV] direct officer fetch failed:', e?.message);
            setOtherUnits([]);
        }
    };

    const loadMonitoredProperties = async () => {
        try {
            const props = await base44.entities.MonitoredProperty.list();
            setMonitoredProperties(props?.filter(p => p.enabled) || []);
        } catch (e) {}
    };

    const AGENCY_CITY = { RPD: 'Richmond, VA', RFD: 'Richmond, VA', HPD: 'Henrico County, VA', CCPD: 'Chesterfield County, VA', CCFD: 'Chesterfield County, VA' };

    const autoGeocodeUnmapped = async (unmapped) => {
        if (!unmapped.length || isGeocoding) return;
        setIsGeocoding(true);
        try {
            // Credit-free: delegate to backend geocodeMissingCalls (uses direct fetch, no InvokeLLM)
            const count = unmapped.length;
            await base44.functions.invoke('geocodeMissingCalls', {
                limit: Math.min(count, 50),
                force_retry: true,
                retry_rounds: 3,
            });
            toast.success(`Geocoding ${Math.min(count, 50)} calls in background`);
            // Give the backend a moment to persist, then re-fetch
            setTimeout(() => { fetchCalls(); setIsGeocoding(false); }, 4000);
        } catch (e) {
            console.warn('[NAV] geocode trigger failed:', e?.message);
            toast.error('Geocoding failed');
            setIsGeocoding(false);
        }
    };

    // Geocoding handled by backend "geocodeMissingCalls" automation (every 10 min).
    // Frontend must not call geocoding providers directly (causes 502s / rate limits).

    const handleRefreshCalls = async () => {
        await fetchCalls();
        // Also trigger backend geocoding for any calls still missing coordinates
        base44.functions.invoke('geocodeMissingCalls', {}).catch(e => console.warn('[NAV] geocode trigger failed:', e?.message));
    };

    const fetchCalls = async () => {
        setIsLoadingCalls(true);
        try {
            const all = await base44.entities.DispatchCall.list('-created_date', 200);
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const active = all.filter(c =>
                !['Closed', 'Cleared', 'Cancelled'].includes(c.status) &&
                new Date(c.time_received || c.created_date) >= oneHourAgo
            );
            const { unmapped } = splitCallsByCoords(active);
            setActiveCalls(active);
            setUnmappedCalls(unmapped);
            if (focusCallId) {
                const target = active.find(c => c.id === focusCallId);
                if (target) { setSelectedCall(target); setShowCallSidebar(true); }
            }
            // geocoding handled by backend automation
        } catch (e) {
            console.warn('[NAV] fetchCalls error:', e.message);
        } finally {
            setIsLoadingCalls(false);
        }
    };



    const selfEntry = currentUser ? { ...currentUser, status: unitStatus } : null;
    const otherOnline = otherUnits.filter(u => u.last_updated && Date.now() - new Date(u.last_updated) < 12 * 3600000);
    const onlineUnits = selfEntry ? [selfEntry, ...otherOnline] : otherOnline;
    const mapVisibleUnits = isSupervisorUser ? otherUnits : otherUnits.filter(u => u.status !== 'Out of Service');

    const criticalCalls = activeCalls.filter(isCriticalCall);
    const unassignedCalls = activeCalls.filter(c => !c.assigned_units?.length && !c.source);
    const displayedCalls = showOnlyCriticalCalls ? criticalCalls : activeCalls;

    const getUnitNumberFromId = (userId) => {
        if (currentUser?.id === userId) return currentUser.unit_number || currentUser.full_name?.split(' ')[0] || 'UNIT';
        const unit = otherUnits.find(u => u.id === userId);
        return unit?.unit_number || unit?.full_name?.split(' ')[0] || 'UNIT';
    };

    return (
        <div className="h-screen w-screen relative overflow-hidden bg-[#0a0e1a]">
            <OfficerDistressBanner currentUser={currentUser} isDispatchOrAdmin={isDispatchOrAdmin} />

            {/* ══ MAP BASE LAYER ══ */}
            <div className="absolute inset-0">
                <MapView
                    currentLocation={currentLocation}
                    destination={null} route={null} trafficSegments={null}
                    useOfflineTiles={!isOnline}
                    activeCalls={showActiveCalls ? activeCalls : []}
                    heading={heading}
                    locationHistory={isLiveTracking ? locationHistory : []}
                    unitName={unitName || currentUser?.unit_number}
                    showLights={showLights}
                    otherUnits={mapVisibleUnits}
                    currentUserId={currentUser?.id}
                    speed={speed}
                    mapCenter={mapCenter}
                    isNavigating={false}
                    baseMapType={jurisdictionFilters.baseMapType}
                    jurisdictionFilters={jurisdictionFilters}
                    showPoliceStations={jurisdictionFilters.showPoliceStations}
                    showFireStations={jurisdictionFilters.showFireStations}
                    showJails={jurisdictionFilters.showJails}
                    searchPin={null}
                    mapTheme={mapTheme}
                    showHeatmap={showHeatmap}
                    allCalls={activeCalls}
                    onCallClick={(call) => {
                        setSelectedCall(call); setShowCallSidebar(true); setCallDistrict(null);
                        if (call.latitude && call.longitude) lookupDistrict(call.latitude, call.longitude).then(d => setCallDistrict(d));
                    }}
                >
                    <VACountiesBoundaries />
                    <OfficerDistressMarker autoCenter={false} />
                </MapView>
            </div>

            {/* ══ TOP COMMAND BAR ══ */}
            <div className="absolute top-0 left-0 right-0 z-[1010] pointer-events-none">
                <div className="flex items-center gap-3 px-3 py-1.5 bg-[#0a0e1a]/90 backdrop-blur-md border-b border-[#1e2d4a]">
                    {/* Brand */}
                    <div className="flex items-center gap-2 pointer-events-auto">
                        <button onClick={() => navigate('/CommandDashboard')}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                            <div className="w-6 h-6 rounded bg-[#f5a623]/20 border border-[#f5a623]/40 flex items-center justify-center">
                                <Radio className="w-3.5 h-3.5 text-[#f5a623]" />
                            </div>
                            <span className="text-[#f5a623] font-mono text-xs font-bold tracking-widest hidden sm:block">BPS CAD</span>
                        </button>
                        <span className="text-slate-600 text-xs">|</span>
                        <span className="text-slate-400 font-mono text-[10px] tracking-widest">LIVE MAP</span>
                    </div>

                    {/* Status Pills */}
                    <div className="flex items-center gap-1.5 pointer-events-auto flex-1 overflow-hidden">
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold ${
                            isLiveTracking ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-500'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isLiveTracking ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                            GPS
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono ${
                            isOnline ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                        }`}>
                            {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </div>
                        {speed > 2 && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded border bg-blue-900/30 border-blue-500/30 text-blue-300 text-[9px] font-mono font-bold">
                                {speed} MPH
                            </div>
                        )}
                    </div>

                    {/* Right metrics */}
                    <div className="flex items-center gap-2 pointer-events-auto flex-shrink-0">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#1e2d4a] bg-[#111827] text-[9px] font-mono text-slate-400">
                            <Users className="w-2.5 h-2.5 text-blue-400" />{onlineUnits.length} UNITS
                        </div>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#1e2d4a] bg-[#111827] text-[9px] font-mono text-slate-400">
                            <Radio className="w-2.5 h-2.5 text-[#f5a623]" />{activeCalls.length} CALLS
                        </div>
                        {unassignedCalls.length > 0 && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-[9px] font-mono text-red-400 font-bold">
                                <AlertTriangle className="w-2.5 h-2.5" />{unassignedCalls.length} UNSGN
                            </div>
                        )}
                        {currentUser && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#1e2d4a] bg-[#111827] text-[9px] font-mono">
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[unitStatus] || 'bg-slate-500'}`} />
                                <span className="text-white">{currentUser.unit_number || currentUser.full_name?.split(' ')[0] || 'UNIT'}</span>
                                <span className="text-slate-500 ml-1">{unitStatus}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══ LEFT PANEL ══ */}
            <div className="absolute top-[34px] left-0 bottom-0 z-[1005] flex pointer-events-none">
                <AnimatePresence>
                    {leftPanelOpen && (
                        <motion.div
                            initial={{ x: -280, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -280, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="w-[260px] flex flex-col bg-[#0a0e1a]/95 backdrop-blur-md border-r border-[#1e2d4a] pointer-events-auto"
                        >
                            {/* Panel Tabs */}
                            <div className="flex border-b border-[#1e2d4a] flex-shrink-0">
                                {[
                                    { key: 'units', label: 'UNITS', count: onlineUnits.length, color: 'text-blue-400' },
                                    { key: 'calls', label: 'CALLS', count: activeCalls.length, color: 'text-[#f5a623]' },
                                    { key: 'status', label: 'MY STATUS', count: null, color: 'text-green-400' },
                                ].map(tab => (
                                    <button key={tab.key} onClick={() => setLeftTab(tab.key)}
                                        className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-mono font-bold tracking-wider border-b-2 transition-all ${
                                            leftTab === tab.key
                                                ? `border-[#f5a623] ${tab.color} bg-[#111827]`
                                                : 'border-transparent text-slate-500 hover:text-slate-300'
                                        }`}>
                                        {tab.label}
                                        {tab.count !== null && (
                                            <span className={`text-[8px] px-1 rounded ${leftTab === tab.key ? 'bg-[#f5a623]/20 text-[#f5a623]' : 'bg-slate-800 text-slate-500'}`}>
                                                {tab.count}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* UNITS TAB */}
                            {leftTab === 'units' && (
                                <div className="flex-1 overflow-y-auto">
                                    {['Available','On Patrol','Enroute','On Scene','Busy','Supervisor','Out of Service']
                                        .filter(s => (s !== 'Supervisor' && s !== 'Out of Service') || isSupervisorUser)
                                        .map(status => {
                                            const units = onlineUnits.filter(u => u.status === status);
                                            if (units.length === 0) return null;
                                            return (
                                                <div key={status}>
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1220] border-b border-[#1e2d4a]">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                                                        <span className="text-[9px] font-mono font-bold text-slate-500 tracking-widest">{status.toUpperCase()}</span>
                                                        <span className="ml-auto text-[9px] font-mono text-slate-600 bg-[#111827] px-1.5 rounded">{units.length}</span>
                                                    </div>
                                                    {units.map(u => (
                                                        <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-[#0f1520] hover:bg-[#111827] transition-colors">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    {u.is_supervisor && <Shield className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                                                                    <span className="text-[11px] text-white font-mono font-bold truncate">
                                                                        {u.unit_number ? `UNIT-${u.unit_number}` : (u.full_name || 'UNIT')}
                                                                    </span>
                                                                </div>
                                                                {u.rank && <div className="text-[9px] text-slate-600 font-mono">{u.rank}</div>}
                                                            </div>
                                                            {u.latitude && u.longitude && (
                                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" title="GPS Active" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    {onlineUnits.length === 0 && (
                                        <div className="text-center py-8 text-slate-600 text-[10px] font-mono">NO ACTIVE UNITS</div>
                                    )}
                                </div>
                            )}

                            {/* CALLS TAB */}
                            {leftTab === 'calls' && (
                                <div className="flex-1 overflow-y-auto">
                                    <div className="px-3 py-2 border-b border-[#1e2d4a] flex items-center gap-2">
                                        <button
                                            onClick={() => setShowOnlyCriticalCalls(!showOnlyCriticalCalls)}
                                            className={`px-2 py-1 rounded text-[9px] font-mono font-bold transition-colors ${showOnlyCriticalCalls ? 'bg-red-600/20 border border-red-600/50 text-red-400' : 'bg-[#111827] border border-[#1e2d4a] text-slate-400 hover:text-white'}`}
                                        >
                                            🚨 CRITICAL ONLY
                                        </button>
                                        <button
                                            onClick={handleRefreshCalls}
                                            disabled={isLoadingCalls}
                                            className="ml-auto flex items-center gap-1 px-2 py-1 bg-[#111827] border border-[#1e2d4a] rounded text-[9px] text-slate-400 hover:text-white transition-colors"
                                        >
                                            <RefreshCw className={`w-2.5 h-2.5 ${isLoadingCalls ? 'animate-spin' : ''}`} />
                                            REFRESH
                                        </button>
                                    </div>
                                    {displayedCalls.length === 0 ? (
                                        <div className="text-center py-8 text-slate-600 text-[10px] font-mono">{showOnlyCriticalCalls ? 'NO CRITICAL CALLS' : 'NO ACTIVE CALLS'}</div>
                                    ) : displayedCalls.map(call => (
                                        <div key={call.id}
                                            onClick={() => {
                                                setSelectedCall(call); setShowCallSidebar(true); setCallDistrict(null);
                                                if (call.latitude && call.longitude) lookupDistrict(call.latitude, call.longitude).then(d => setCallDistrict(d));
                                            }}
                                            className={`px-3 py-2 border-b border-[#0f1520] cursor-pointer border-l-2 transition-all ${
                                                selectedCall?.id === call.id
                                                    ? 'bg-[#1a3a5c] border-l-blue-500'
                                                    : call.priority === 'critical' ? 'border-l-red-600 hover:bg-[#111827]'
                                                    : call.priority === 'high' ? 'border-l-orange-500 hover:bg-[#111827]'
                                                    : 'border-l-[#1e2d4a] hover:bg-[#111827]'
                                            }`}
                                        >
                                            <div className="flex items-start gap-1.5 mb-1">
                                                <span className={`flex-shrink-0 text-[8px] px-1 py-0.5 rounded font-bold mt-0.5 ${PRIORITY_COLORS[call.priority] || 'bg-slate-700 text-slate-300'}`}>
                                                    {(call.priority || 'L')[0].toUpperCase()}
                                                </span>
                                                <span className="text-[11px] text-white font-mono font-bold truncate leading-tight">{call.incident}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono ml-4">
                                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                                <span className="truncate">{call.location}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 ml-4">
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-mono ${
                                                    call.status === 'Enroute' ? 'border-yellow-500/40 text-yellow-400' :
                                                    call.status === 'On Scene' ? 'border-blue-500/40 text-blue-400' :
                                                    call.status === 'Dispatched' ? 'border-green-500/40 text-green-400' :
                                                    'border-slate-700 text-slate-500'
                                                }`}>{call.status || 'New'}</span>
                                                {(!call.assigned_units || call.assigned_units.length === 0) && (
                                                    <span className="text-[8px] text-red-400 font-mono">UNASSIGNED</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* MY STATUS TAB */}
                            {leftTab === 'status' && (
                                <div className="flex-1 overflow-y-auto p-3">
                                    {currentUser && (
                                        <div className="bg-[#111827] border border-[#1e2d4a] rounded-lg p-3 mb-3">
                                            <div className="text-[9px] text-slate-500 font-mono mb-1">CURRENT UNIT</div>
                                            <div className="text-white font-mono font-bold text-sm">
                                                {currentUser.unit_number ? `UNIT ${currentUser.unit_number}` : currentUser.full_name || 'Officer'}
                                            </div>
                                            {currentUser.rank && <div className="text-slate-400 text-[10px] font-mono mt-0.5">{currentUser.rank}</div>}
                                        </div>
                                    )}
                                    <div className="text-[9px] text-slate-500 font-mono font-bold mb-2 tracking-wider">SET STATUS</div>
                                    <div className="space-y-1">
                                        {MY_STATUSES.map(({ label, dot, shortcode }) => (
                                            <button key={label} onClick={() => handleStatusChange(label)}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                                                    unitStatus === label
                                                        ? 'bg-[#f5a623]/10 border border-[#f5a623]/40 text-white'
                                                        : 'bg-[#111827] border border-[#1e2d4a] text-slate-400 hover:text-white hover:border-slate-600'
                                                }`}>
                                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                                                <span className="font-mono text-xs font-bold flex-1">{label}</span>
                                                <span className="text-[9px] text-slate-600 font-mono">{shortcode}</span>
                                                {unitStatus === label && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Emergency Lights Toggle */}
                                    <button onClick={() => setShowLights(l => !l)}
                                        className={`w-full mt-3 flex items-center gap-3 px-3 py-2.5 rounded-lg border font-mono text-xs font-bold transition-all ${
                                            showLights ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-[#111827] border-[#1e2d4a] text-slate-500 hover:text-white'
                                        }`}>
                                        <Zap className="w-3.5 h-3.5" />
                                        EMERGENCY LIGHTS {showLights ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Panel toggle tab */}
                <div className="flex flex-col justify-center pointer-events-auto">
                    <CollapsePanelButton isOpen={leftPanelOpen} onClick={() => setLeftPanelOpen(o => !o)} />
                </div>
            </div>

            {/* ══ UNMAPPED CALLS PANEL ══ */}
            {unmappedCalls.length > 0 && (
                <div className="absolute top-[34px] right-14 z-[1005] pointer-events-auto">
                    <button
                        onClick={() => setShowUnmapped(v => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-900/80 border border-yellow-500/50 rounded-b-lg text-yellow-400 font-mono text-[10px] font-bold backdrop-blur-sm"
                    >
                        <AlertTriangle className="w-3 h-3" />
                        {unmappedCalls.length} UNMAPPED
                    </button>
                    <AnimatePresence>
                        {showUnmapped && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="w-72 bg-[#0a0e1a] border border-[#1e2d4a] rounded-b-lg shadow-xl overflow-hidden"
                            >
                                <div className="px-3 py-2 border-b border-[#1e2d4a] flex items-center justify-between bg-[#0d1220]">
                                    <span className="text-yellow-400 font-mono text-[10px] font-bold">UNMAPPED CALLS</span>
                                    <button
                                        onClick={() => autoGeocodeUnmapped(unmappedCalls)}
                                        disabled={isGeocoding}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded text-yellow-300 text-[9px] font-mono font-bold hover:bg-yellow-500/30 transition-all disabled:opacity-50"
                                    >
                                        <MapPin className="w-2.5 h-2.5" />
                                        {isGeocoding ? 'GEOCODING...' : 'GEOCODE ALL'}
                                    </button>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {unmappedCalls.map(call => (
                                        <div key={call.id} className="px-3 py-2 border-b border-[#0f1520] text-[10px] font-mono">
                                            <div className="text-white font-bold truncate">{call.incident}</div>
                                            <div className="text-slate-500 truncate">{call.location}</div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ══ RIGHT CONTROL STRIP ══ */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute right-3 top-16 z-[1005] flex flex-col gap-2 pointer-events-auto"
            >
                {[
                    { onClick: recenter, title: 'Recenter', icon: <Crosshair className="w-4 h-4" />, active: false },
                    { onClick: () => setShowActiveCalls(v => !v), title: 'Toggle calls on map', icon: showActiveCalls ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />, active: showActiveCalls },
                    { onClick: () => setMapTheme(t => t === 'day' ? 'night' : 'day'), title: 'Toggle map theme', icon: <Layers className="w-4 h-4" />, active: mapTheme === 'night' },
                    { onClick: () => setShowHeatmap(v => !v), title: 'Call heatmap', icon: <Flame className="w-4 h-4" />, active: showHeatmap },
                    { onClick: handleRefreshCalls, title: 'Refresh calls', icon: <RefreshCw className={`w-4 h-4 ${isLoadingCalls ? 'animate-spin' : ''}`} />, active: false, disabled: isLoadingCalls },
                ].map((btn, i) => (
                    <button key={i} onClick={btn.onClick} title={btn.title} disabled={btn.disabled}
                        className={`w-10 h-10 rounded-xl backdrop-blur-sm border flex items-center justify-center transition-all shadow-lg ${
                            btn.active
                                ? 'bg-[#f5a623]/20 border-[#f5a623]/50 text-[#f5a623]'
                                : 'bg-[#0d1220]/90 border-[#1e2d4a] text-slate-400 hover:text-white hover:border-slate-500 hover:bg-[#1a2535]'
                        } disabled:opacity-50`}>
                        {btn.icon}
                    </button>
                ))}
            </motion.div>

            {/* ══ BOTTOM STATUS STRIP ══ */}
            <div className="absolute bottom-0 left-0 right-0 z-[1005] pointer-events-none">
                <div className="flex items-center gap-3 px-4 py-1.5 bg-[#0a0e1a]/90 backdrop-blur-md border-t border-[#1e2d4a]">
                    <span className="text-[9px] font-mono text-slate-500">
                        CALLS: <span className="text-white">{activeCalls.length}</span>
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                        UNITS: <span className="text-green-400">{onlineUnits.length}</span>
                    </span>
                    {criticalCalls.length > 0 && (
                        <span className="text-[9px] font-mono text-red-400 font-bold animate-pulse">
                            ⚠ {criticalCalls.length} CRITICAL
                        </span>
                    )}
                    <div className="flex-1" />
                    <div className="pointer-events-auto">
                        <OfficerDistressButton currentUser={currentUser} />
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-mono text-green-400 font-bold pointer-events-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        ONLINE
                    </div>
                </div>
            </div>

            {/* ══ CALL DETAIL SIDEBAR ══ */}
            <AnimatePresence>
                {showCallSidebar && selectedCall && (
                    <motion.div
                        initial={{ opacity: 0, x: 320 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 320 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-[34px] right-0 bottom-[32px] w-80 bg-[#0a0e1a]/97 backdrop-blur-md border-l border-[#1e2d4a] z-[1006] overflow-y-auto pointer-events-auto flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a] bg-[#0d1220]">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#f5a623]" />
                                <span className="text-white font-mono font-bold text-xs tracking-widest">CALL DETAIL</span>
                            </div>
                            <button onClick={() => setShowCallSidebar(false)}
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-[#1e2d4a] transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Action Bar - Show on Map + Assign */}
                        <div className="flex-none flex items-center gap-2 px-4 py-2.5 border-b border-[#1e2d4a] bg-[#0a0e1a]">
                            <button
                                onClick={() => {
                                    if (selectedCall.latitude && selectedCall.longitude) {
                                        setMapCenter([selectedCall.latitude, selectedCall.longitude]);
                                        setShowActiveCalls(true);
                                    }
                                }}
                                className="px-3 py-1 rounded border border-blue-500/40 text-blue-400 text-[9px] font-mono font-bold hover:bg-blue-500/10 transition-all"
                            >
                                📍 SHOW ON MAP
                            </button>
                            {selectedCall.assigned_units?.includes(currentUser?.id) ? (
                                <>
                                    <span className="text-[9px] font-mono text-green-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> YOU ARE ASSIGNED
                                    </span>
                                    <button onClick={handleSelfUnassign} disabled={assigning}
                                        className="ml-auto px-3 py-1 rounded border border-red-500/40 text-red-400 text-[9px] font-mono font-bold hover:bg-red-500/10 transition-all disabled:opacity-50">
                                        UNASSIGN ME
                                    </button>
                                </>
                            ) : (
                                <button onClick={handleSelfAssign} disabled={assigning}
                                    className="flex-1 py-2 rounded border border-[#f5a623]/50 bg-[#f5a623]/10 text-[#f5a623] text-[10px] font-mono font-bold hover:bg-[#f5a623]/20 transition-all disabled:opacity-50">
                                    {assigning ? 'ASSIGNING...' : '⚡ ASSIGN ME TO THIS CALL'}
                                </button>
                            )}
                        </div>

                        {/* Call ID / Priority bar */}
                        <div className="flex-none flex items-center gap-2 px-4 py-2 bg-[#111827] border-b border-[#1e2d4a]">
                            <span className={`text-[9px] px-2 py-1 rounded font-bold font-mono ${PRIORITY_COLORS[selectedCall.priority] || 'bg-slate-700 text-white'}`}>
                                {(selectedCall.priority || 'LOW').toUpperCase()}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                                        #{selectedCall.id?.slice(-8).toUpperCase()}
                                    </span>
                            <span className="ml-auto text-[9px] font-mono text-slate-500">{selectedCall.status}</span>
                        </div>

                        <div className="flex-1 p-4 space-y-3 font-mono overflow-y-auto bg-[#0a0e1a]">
                            {/* Incident */}
                            <div>
                                <div className="text-[#f5a623] font-bold text-base leading-tight">{selectedCall.incident}</div>
                                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                                    <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                    <span>{selectedCall.location}</span>
                                </div>
                            </div>

                            {/* Grid Data */}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'AGENCY', value: selectedCall.agency || '—' },
                                    { label: 'DISTRICT', value: callDistrict !== null ? callDistrict : (selectedCall.zone || '—') },
                                    { label: 'TIME RCV', value: selectedCall.time_received ? new Date(selectedCall.time_received).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) : '—' },
                                    { label: 'CALLER', value: selectedCall.caller_name || '—' },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-[#111827] border border-[#1e2d4a] rounded-lg p-2">
                                        <div className="text-[8px] text-slate-500 mb-0.5">{label}</div>
                                        <div className="text-white text-[10px] font-bold truncate">{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Description / Narrative */}
                            {selectedCall.description && (
                                <div className="bg-[#111827] border border-[#1e2d4a] rounded-lg p-3">
                                    <div className="text-[8px] text-slate-500 mb-1.5 tracking-widest">NARRATIVE</div>
                                    <div className="text-slate-300 text-[10px] leading-relaxed">{selectedCall.description}</div>
                                </div>
                            )}

                            {/* AI Summary */}
                            {selectedCall.ai_summary && (
                                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                                    <div className="text-[8px] text-blue-400 mb-1.5 tracking-widest">AI ANALYSIS</div>
                                    <div className="text-blue-200 text-[10px] leading-relaxed">{selectedCall.ai_summary}</div>
                                </div>
                            )}

                            {/* Assigned Units */}
                            {/* Assigned Units */}
                             {selectedCall.assigned_units?.length > 0 && (
                                <div className="bg-[#111827] border border-[#1e2d4a] rounded-lg p-3">
                                    <div className="text-[8px] text-slate-500 mb-1.5 tracking-widest">ASSIGNED UNITS</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedCall.assigned_units.map((uid, i) => (
                                            <span key={i} className="text-[9px] px-2 py-1 bg-blue-900/30 border border-blue-500/30 rounded text-blue-300 font-bold">
                                                {getUnitNumberFromId(uid)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Hazards */}
                            {selectedCall.hazards && (
                                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                                    <div className="text-[8px] text-red-400 mb-1.5 tracking-widest">⚠ HAZARDS</div>
                                    <div className="text-red-200 text-[10px]">{selectedCall.hazards}</div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}