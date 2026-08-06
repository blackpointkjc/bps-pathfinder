import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import CollapsePanelButton from '@/components/CollapsePanelButton';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import VACountiesBoundaries from '@/components/map/VACountiesBoundaries';
import {
    Layers, RefreshCw, Radio, MapPin, Users,
    Eye, EyeOff, Wifi, WifiOff, Crosshair, ArrowLeft, Flame, X, AlertTriangle, Shield, Zap, Navigation2, Square, Search, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { lookupDistrict } from '@/utils/districtLookup';
import { isCriticalCall } from '@/lib/cadCallUtils';
import { splitCallsByCoords } from '@/lib/geocodingPipeline';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressBanner from '@/components/dispatch/OfficerDistressBanner';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import FieldCallActions from '@/components/dispatch/FieldCallActions';

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
    const [callSidebarCollapsed, setCallSidebarCollapsed] = useState(false);
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
    const [navDestination, setNavDestination] = useState(null);
    const [navRoute, setNavRoute] = useState([]);
    const [navSteps, setNavSteps] = useState([]);
    const [navStepIndex, setNavStepIndex] = useState(0);
    const [navDistanceMiles, setNavDistanceMiles] = useState(0);
    const [navDurationMinutes, setNavDurationMinutes] = useState(0);
    const [isNavigating, setIsNavigating] = useState(false);
    const [routing, setRouting] = useState(false);
    const [addressQuery, setAddressQuery] = useState('');
    const [addressResults, setAddressResults] = useState([]);
    const [addressSearching, setAddressSearching] = useState(false);
    const [showAddressSearch, setShowAddressSearch] = useState(false);
    const [lastGpsFixAt, setLastGpsFixAt] = useState(null);

    const isSupervisorUser = currentUser?.is_supervisor === true || currentUser?.role === 'admin';
    const isDispatchOrAdmin = currentUser?.role === 'admin' || currentUser?.is_supervisor || currentUser?.dispatch_role;

    const [jurisdictionFilters] = useState({
        baseMapType: 'street', showPoliceStations: true, showFireStations: false,
        showEMS: false, showJails: true
    });

    const locationWatchId = useRef(null);
    const forcePollRef = useRef(null);
    const syncingGracRef = useRef(false);
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

    // Credit-free live officer refresh. ActiveOfficer is the source written by
    // the time-clock/background GPS tracker while an officer is on duty.
    useEffect(() => {
        if (!currentUser?.id) return;
        fetchOtherUnits();
        const unsubscribe = base44.entities.ActiveOfficer.subscribe(() => fetchOtherUnits());
        const fallback = setInterval(fetchOtherUnits, 15000);
        const refreshWhenVisible = () => {
            if (!document.hidden) fetchOtherUnits();
        };
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            unsubscribe?.();
            clearInterval(fallback);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        const syncLiveCalls = async () => {
            if (syncingGracRef.current || document.hidden) return;
            syncingGracRef.current = true;
            try {
                await base44.functions.invoke('ingestGractivecalls', {});
                await fetchCalls();
            } catch (error) {
                console.warn('[NAV] GRAC live sync failed:', error?.message);
            } finally {
                syncingGracRef.current = false;
            }
        };

        syncLiveCalls();
        loadMonitoredProperties();
        const syncInterval = setInterval(syncLiveCalls, 15000);
        const localInterval = setInterval(fetchCalls, 10000);
        const propertyInterval = setInterval(loadMonitoredProperties, 60000);
        const onVisibility = () => {
            if (!document.hidden) syncLiveCalls();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearInterval(syncInterval);
            clearInterval(localInterval);
            clearInterval(propertyInterval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);



    useEffect(() => { unitStatusRef.current = unitStatus; }, [unitStatus]);

    useEffect(() => {
        localStorage.setItem('mapTheme', mapTheme);
    }, [mapTheme]);

    useEffect(() => {
        if (!isNavigating || !currentLocation || navSteps.length === 0) return;
        const step = navSteps[navStepIndex];
        const location = step?.maneuver?.location;
        if (!location) return;
        const [lng, lat] = location;
        const toRad = value => value * Math.PI / 180;
        const dLat = toRad(lat - currentLocation[0]);
        const dLng = toRad(lng - currentLocation[1]);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(currentLocation[0])) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
        const miles = 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (miles < 0.035 && navStepIndex < navSteps.length - 1) setNavStepIndex(index => index + 1);
        if (navDestination?.coords) {
            const [destLat, destLng] = navDestination.coords;
            const ddLat = toRad(destLat - currentLocation[0]);
            const ddLng = toRad(destLng - currentLocation[1]);
            const da = Math.sin(ddLat / 2) ** 2 + Math.cos(toRad(currentLocation[0])) * Math.cos(toRad(destLat)) * Math.sin(ddLng / 2) ** 2;
            const remaining = 3958.8 * 2 * Math.atan2(Math.sqrt(da), Math.sqrt(1 - da));
            if (remaining < 0.03) {
                toast.success('Arrived at call location');
                stopInAppNavigation();
            }
        }
    }, [currentLocation, isNavigating, navStepIndex, navSteps, navDestination]);

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
        const moving = Number(spd) > 2;
        const minimumInterval = moving ? 3000 : 7000;
        if (now - lastUpdateRef.current < minimumInterval) return;
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
                setLastGpsFixAt(pos.timestamp || Date.now());
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
                    setLastGpsFixAt(pos.timestamp || Date.now());
                    const fallbackHeading = (pos.coords.heading !== null && pos.coords.heading >= 0) ? pos.coords.heading : heading;
                    const fallbackSpeed = pos.coords.speed ? pos.coords.speed * 2.237 : 0;
                    if (fallbackHeading !== null) setHeading(fallbackHeading);
                    setSpeed(Math.round(fallbackSpeed));
                    pushLocationUpdate(coords, fallbackHeading, fallbackSpeed, pos.coords.accuracy);
                },
                () => {},
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
            );
        }, 8000);
    };

    const stopTracking = () => {
        if (locationWatchId.current) { navigator.geolocation.clearWatch(locationWatchId.current); locationWatchId.current = null; }
        if (forcePollRef.current) { clearInterval(forcePollRef.current); forcePollRef.current = null; }
        setIsLiveTracking(false);
    };

    const formatInstruction = (step) => {
        if (!step) return 'Continue to destination';
        const type = step.maneuver?.type || 'continue';
        const modifier = step.maneuver?.modifier ? ` ${step.maneuver.modifier}` : '';
        const road = step.name ? ` onto ${step.name}` : '';
        if (type === 'arrive') return 'Arrive at the call location';
        if (type === 'depart') return `Head${modifier}${road}`;
        if (type === 'roundabout') return `Enter the roundabout${road}`;
        return `${type.charAt(0).toUpperCase() + type.slice(1)}${modifier}${road}`;
    };

    const getFreshDeviceLocation = () => new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(currentLocation);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const fresh = [pos.coords.latitude, pos.coords.longitude];
                const freshHeading = (pos.coords.heading !== null && pos.coords.heading >= 0) ? pos.coords.heading : heading;
                const freshSpeed = pos.coords.speed ? pos.coords.speed * 2.237 : speed;
                setCurrentLocation(fresh);
                setLastGpsFixAt(pos.timestamp || Date.now());
                if (freshHeading !== null) setHeading(freshHeading);
                setSpeed(Math.round(freshSpeed || 0));
                pushLocationUpdate(fresh, freshHeading, freshSpeed, pos.coords.accuracy || 0);
                resolve(fresh);
            },
            () => resolve(currentLocation),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    });

    const startNavigationToPoint = async (destination, options = {}) => {
        const coords = destination?.coords || (destination?.latitude && destination?.longitude ? [Number(destination.latitude), Number(destination.longitude)] : null);
        if (!coords || !Number.isFinite(Number(coords[0])) || !Number.isFinite(Number(coords[1]))) {
            toast.error('This destination does not have mapped coordinates');
            return;
        }
        setRouting(true);
        try {
            const freshLocation = await getFreshDeviceLocation();
            if (!freshLocation) throw new Error('Waiting for a current GPS location');
            const [lat, lng] = freshLocation;
            const [destLat, destLng] = coords.map(Number);
            const url = `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true&annotations=true`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Route service unavailable');
            const data = await response.json();
            const route = data.routes?.[0];
            if (!route) throw new Error('No driving route found');
            setNavDestination({ coords: [destLat, destLng], name: destination.name || destination.address || 'Destination' });
            setNavRoute((route.geometry?.coordinates || []).map(([x, y]) => [y, x]));
            setNavSteps(route.legs?.flatMap(leg => leg.steps || []) || []);
            setNavStepIndex(0);
            setNavDistanceMiles(route.distance / 1609.344);
            setNavDurationMinutes(Math.max(1, Math.round(route.duration / 60)));
            setIsNavigating(true);
            setShowCallSidebar(false);
            setShowAddressSearch(false);
            setAddressResults([]);
            setAddressQuery('');
            setMapCenter(null);
            if (options.setEnroute !== false) await handleStatusChange('Enroute');
            toast.success(`Navigation started to ${destination.name || destination.address || 'destination'}`);
        } catch (error) {
            toast.error(error?.message || 'Unable to build route');
        } finally {
            setRouting(false);
        }
    };

    const startInAppNavigation = () => startNavigationToPoint({
        coords: selectedCall?.latitude && selectedCall?.longitude ? [Number(selectedCall.latitude), Number(selectedCall.longitude)] : null,
        name: selectedCall?.location || selectedCall?.incident || 'Call location',
    });

    const searchAddress = async (event) => {
        event?.preventDefault();
        const query = addressQuery.trim();
        if (query.length < 3) return;
        setAddressSearching(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&addressdetails=1&q=${encodeURIComponent(query)}`, { headers: { 'Accept-Language': 'en-US' } });
            if (!response.ok) throw new Error('Address search unavailable');
            const results = await response.json();
            setAddressResults((results || []).map(item => ({
                coords: [Number(item.lat), Number(item.lon)],
                name: item.display_name,
                address: item.display_name,
                type: item.type,
            })));
            if (!results?.length) toast.error('No matching address found');
        } catch (error) {
            toast.error(error?.message || 'Unable to search addresses');
        } finally {
            setAddressSearching(false);
        }
    };

    const stopInAppNavigation = () => {
        setIsNavigating(false);
        setNavDestination(null);
        setNavRoute([]);
        setNavSteps([]);
        setNavStepIndex(0);
        setNavDistanceMiles(0);
        setNavDurationMinutes(0);
    };

    const recenter = async () => {
        const fresh = await getFreshDeviceLocation();
        if (!fresh) {
            toast.error('Unable to get your current location');
            return;
        }
        setMapCenter([...fresh]);
        window.setTimeout(() => setMapCenter(null), 800);
        toast.success('Map centered on your current location');
    };

    const fetchOtherUnits = async () => {
        try {
            const [activeOfficers, users] = await Promise.all([
                base44.entities.ActiveOfficer.list('-last_update', 250),
                base44.entities.User.list('-updated_date', 250),
            ]);
            const userByEmail = new Map(
                (users || []).filter(user => user.email).map(user => [user.email.toLowerCase(), user])
            );
            const currentEmail = currentUser?.email?.toLowerCase();
            const visible = (activeOfficers || []).flatMap(active => {
                const email = active.officer_email?.toLowerCase();
                if (!email || email === currentEmail) return [];
                const latitude = Number(active.latitude);
                const longitude = Number(active.longitude);
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

                const profile = userByEmail.get(email) || {};
                return [{
                    ...profile,
                    id: profile.id || active.id,
                    active_officer_id: active.id,
                    email: active.officer_email,
                    full_name: active.officer_name || profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
                    unit_number: profile.unit_number || active.current_location || 'ON DUTY',
                    latitude,
                    longitude,
                    status: profile.status && profile.status !== 'Out of Service' ? profile.status : 'Available',
                    last_updated: active.last_update || active.updated_date || active.created_date,
                    current_location: active.current_location,
                    show_on_map: true,
                }];
            });
            setOtherUnits(visible);
        } catch (e) {
            console.warn('[NAV] active officer fetch failed:', e?.message);
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
            const all = await base44.entities.DispatchCall.list('-created_date', 500);
            const uniqueCalls = new Map();
            for (const call of all || []) {
                const descriptionKey = String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
                const key = call.external_call_id || descriptionKey || call.id;
                const current = uniqueCalls.get(key);
                const currentHasCad = /^B\d+$/i.test(String(current?.call_id || ''));
                const candidateHasCad = /^B\d+$/i.test(String(call.call_id || ''));
                if (!current || (!currentHasCad && candidateHasCad)) uniqueCalls.set(key, call);
            }
            const active = [...uniqueCalls.values()].filter(c =>
                !['Cleared', 'Cancelled'].includes(c.status)
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
    // Officer-safety rule: every authorized officer sees every recently active unit.
    const mapVisibleUnits = otherUnits;

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
                    destination={navDestination} route={navRoute} trafficSegments={null}
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
                    isNavigating={isNavigating}
                    baseMapType={jurisdictionFilters.baseMapType}
                    jurisdictionFilters={jurisdictionFilters}
                    showPoliceStations={jurisdictionFilters.showPoliceStations}
                    showFireStations={jurisdictionFilters.showFireStations}
                    showJails={jurisdictionFilters.showJails}
                    onNavigateToJail={(destination) => startNavigationToPoint(destination)}
                    searchPin={null}
                    mapTheme={mapTheme}
                    showHeatmap={showHeatmap}
                    allCalls={activeCalls}
                    onCallClick={(call) => {
                        setSelectedCall(call); setShowCallSidebar(true); setCallSidebarCollapsed(false); setCallDistrict(null);
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


            {isNavigating && navDestination && (
                <div className="absolute left-1/2 top-12 z-[1012] w-[min(92vw,620px)] -translate-x-1/2 rounded-xl border border-blue-500/40 bg-[#07111f]/95 p-3 shadow-2xl backdrop-blur-md pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600"><Navigation2 className="h-6 w-6 text-white" /></div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-mono font-bold tracking-widest text-blue-300">IN-APP NAVIGATION</div>
                            <div className="truncate text-sm font-bold text-white">{formatInstruction(navSteps[navStepIndex])}</div>
                            <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-mono text-slate-400">
                                <span>{navDistanceMiles.toFixed(1)} MI</span><span>{navDurationMinutes} MIN</span><span className="truncate">TO {navDestination.name}</span>
                            </div>
                        </div>
                        <button onClick={stopInAppNavigation} className="flex h-9 items-center gap-1 rounded border border-red-500/40 px-3 text-[10px] font-mono font-bold text-red-300 hover:bg-red-500/10"><Square className="h-3 w-3" />STOP</button>
                    </div>
                </div>
            )}

            {/* Street address search and destination routing */}
            {showAddressSearch && (
                <div className={`absolute left-1/2 z-[1200] w-[min(92vw,560px)] -translate-x-1/2 pointer-events-auto ${isNavigating ? 'top-32' : 'top-12'}`}>
                    <form onSubmit={searchAddress} className="flex items-center gap-2 rounded-xl border border-[#45637f] bg-[#07111f] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
                        <Search className="ml-2 h-4 w-4 text-slate-400" />
                        <input
                            autoFocus
                            value={addressQuery}
                            onChange={(event) => setAddressQuery(event.target.value)}
                            placeholder="Search an address, building, or place"
                            className="h-9 flex-1 bg-transparent px-1 text-sm text-white outline-none placeholder:text-slate-500"
                        />
                        <button type="submit" disabled={addressSearching || addressQuery.trim().length < 3}
                            className="flex h-9 items-center gap-1 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                            <Navigation2 className="h-4 w-4" /> {addressSearching ? 'SEARCHING' : 'GO'}
                        </button>
                    </form>
                    {addressResults.length > 0 && (
                        <div className="relative z-[1220] mt-2 max-h-[55vh] overflow-y-auto rounded-xl border border-[#45637f] bg-[#07111f] shadow-[0_24px_70px_rgba(0,0,0,0.8)]">
                            <div className="border-b border-[#1e2d4a] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Select a destination
                            </div>
                            {addressResults.map((result, index) => (
                                <button key={`${result.name}-${index}`} onClick={() => startNavigationToPoint(result)}
                                    className="flex w-full items-start gap-3 border-b border-[#1e2d4a] px-4 py-3 text-left hover:bg-[#142336] last:border-b-0">
                                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
                                    <span className="text-xs leading-relaxed text-slate-100">{result.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

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

            {/* ══ RIGHT MAP TOOLBAR ══ */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute right-3 top-16 z-[1210] pointer-events-auto"
            >
                <div className="flex flex-col overflow-hidden rounded-xl border border-[#31475e] bg-[#07111f]/95 shadow-2xl backdrop-blur-md">
                    {[
                        {
                            key: 'recenter',
                            onClick: recenter,
                            title: 'Center on my current location',
                            icon: <Crosshair className="h-4 w-4" />,
                            active: isLiveTracking,
                        },
                        {
                            key: 'search',
                            onClick: () => {
                                setShowAddressSearch(open => !open);
                                if (showAddressSearch) {
                                    setAddressResults([]);
                                    setAddressQuery('');
                                }
                            },
                            title: showAddressSearch ? 'Close address search' : 'Search for a destination',
                            icon: showAddressSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />,
                            active: showAddressSearch,
                        },
                        {
                            key: 'calls',
                            onClick: () => setShowActiveCalls(visible => !visible),
                            title: showActiveCalls ? 'Hide calls from map' : 'Show calls on map',
                            icon: showActiveCalls ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
                            active: showActiveCalls,
                        },
                        {
                            key: 'theme',
                            onClick: () => setMapTheme(theme => theme === 'day' ? 'night' : 'day'),
                            title: mapTheme === 'night' ? 'Use day map' : 'Use night map',
                            icon: <Layers className="h-4 w-4" />,
                            active: mapTheme === 'night',
                        },
                        {
                            key: 'heatmap',
                            onClick: () => setShowHeatmap(visible => !visible),
                            title: showHeatmap ? 'Hide call heatmap' : 'Show call heatmap',
                            icon: <Flame className="h-4 w-4" />,
                            active: showHeatmap,
                            disabled: activeCalls.length === 0,
                        },
                    ].map((button, index, controls) => (
                        <button
                            key={button.key}
                            type="button"
                            onClick={button.onClick}
                            title={button.title}
                            aria-label={button.title}
                            aria-pressed={button.active}
                            disabled={button.disabled}
                            className={`flex h-11 w-11 items-center justify-center transition-colors ${
                                index < controls.length - 1 ? 'border-b border-[#263c52]' : ''
                            } ${
                                button.active
                                    ? 'bg-[#153b65] text-[#8cc7ff]'
                                    : 'bg-transparent text-slate-300 hover:bg-[#142336] hover:text-white'
                            } disabled:cursor-not-allowed disabled:opacity-30`}
                        >
                            {button.icon}
                        </button>
                    ))}
                </div>
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
                        className={`absolute top-[34px] right-0 bottom-[32px] bg-[#0a0e1a]/97 backdrop-blur-md border-l border-[#1e2d4a] z-[1006] pointer-events-auto flex flex-col transition-[width] duration-200 ${callSidebarCollapsed ? 'w-12 overflow-hidden' : 'w-80 overflow-y-auto'}`}
                    >
                        {/* Header / collapsed edge tab */}
                        <div className={`flex-none flex items-center border-b border-[#1e2d4a] bg-[#0d1220] ${callSidebarCollapsed ? 'flex-col gap-2 px-1 py-3' : 'justify-between px-3 py-3'}`}>
                            {callSidebarCollapsed ? (
                                <button
                                    type="button"
                                    onClick={() => setCallSidebarCollapsed(false)}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#31506d] bg-[#13263a] text-[#8cc7ff] hover:bg-[#19334e]"
                                    title="Open call details"
                                    aria-label="Open call details"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                            ) : (
                                <>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-[#f5a623]" />
                                        <span className="truncate text-xs font-bold tracking-widest text-white font-mono">CALL DETAIL</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setCallSidebarCollapsed(true)}
                                            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-[#1e2d4a] hover:text-white"
                                            title="Collapse call details"
                                            aria-label="Collapse call details"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => setShowCallSidebar(false)}
                                            className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-[#1e2d4a] hover:text-white transition-colors"
                                            title="Close call details"
                                            aria-label="Close call details">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {!callSidebarCollapsed && <>
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
                            <button
                                onClick={startInAppNavigation}
                                disabled={routing || !selectedCall.latitude || !selectedCall.longitude}
                                className="px-3 py-1 rounded border border-green-500/40 text-green-400 text-[9px] font-mono font-bold hover:bg-green-500/10 transition-all disabled:opacity-40"
                            >
                                {routing ? 'ROUTING...' : '🧭 START GPS'}
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

                        {/* Field Unit Console */}
                        <div className="flex-none border-t border-[#1e2d4a] p-3 bg-[#0a0e1a]">
                            <div className="text-[9px] font-mono text-[#f5a623] font-bold tracking-widest mb-2">FIELD UNIT CONSOLE</div>
                            <FieldCallActions call={selectedCall} />
                        </div>
                        </>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}