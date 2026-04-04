import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Mic, X, Navigation as NavigationIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import VACountiesBoundaries from '@/components/map/VACountiesBoundaries';
import SearchBarWithHistory from '@/components/map/SearchBarWithHistory';
import LiveNavigation from '@/components/map/LiveNavigation';
import NavigationLeftControls from '@/components/map/NavigationLeftControls';
import NavigationRightControls from '@/components/map/NavigationRightControls';
import NavigationStatusBar from '@/components/map/NavigationStatusBar';
import NavigationModals from '@/components/map/NavigationModals';
import { useVoiceGuidance, useVoiceCommand } from '@/components/map/VoiceGuidance';
import { generateTrafficData } from '@/components/map/TrafficLayer';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';

export default function Navigation() {
    const navigate = useNavigate();
    const [currentLocation, setCurrentLocation] = useState(null);
    const [destination, setDestination] = useState(null);
    const [routes, setRoutes] = useState(null);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [directions, setDirections] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [distance, setDistance] = useState('');
    const [duration, setDuration] = useState('');
    const [destinationName, setDestinationName] = useState('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const [isNavigating, setIsNavigating] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [remainingDistance, setRemainingDistance] = useState('');
    const [isRerouting, setIsRerouting] = useState(false);
    const [trafficSegments, setTrafficSegments] = useState(null);
    const [trafficAlert, setTrafficAlert] = useState(null);

    const [activeCalls, setActiveCalls] = useState([]);
    const [allActiveCalls, setAllActiveCalls] = useState([]);
    const [callAgencyFilters, setCallAgencyFilters] = useState({ showRPD: true, showHPD: true, showCCPD: true });
    const [isLoadingCalls, setIsLoadingCalls] = useState(false);
    const [showCallFilterPanel, setShowCallFilterPanel] = useState(false);
    const [showOfflineManager, setShowOfflineManager] = useState(false);
    const [showActiveCalls, setShowActiveCalls] = useState(true);
    const [unitName, setUnitName] = useState(localStorage.getItem('unitName') || '');
    const [showUnitSettings, setShowUnitSettings] = useState(false);
    const [showUnitSettingsPanel, setShowUnitSettingsPanel] = useState(false);
    const [showLights, setShowLights] = useState(localStorage.getItem('showLights') === 'true');
    const [voiceEnabled, setVoiceEnabled] = useState(localStorage.getItem('voiceEnabled') === 'true');
    const [isListening, setIsListening] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [showCallsList, setShowCallsList] = useState(false);

    const [heading, setHeading] = useState(null);
    const [locationHistory, setLocationHistory] = useState([]);
    const [isLiveTracking, setIsLiveTracking] = useState(false);
    const [speed, setSpeed] = useState(0);
    const [accuracy, setAccuracy] = useState(null);
    const [isOffRoute, setIsOffRoute] = useState(false);

    const kalmanState = useRef({ lat: null, lng: null, variance: 1000 });

    const [otherUnits, setOtherUnits] = useState([]);
    const [unitStatus, setUnitStatus] = useState('Available');
    const [showStatusPanel, setShowStatusPanel] = useState(false);
    const [activeCallInfo, setActiveCallInfo] = useState(null);

    const [showDispatchPanel, setShowDispatchPanel] = useState(false);
    const [selectedCallForDispatch, setSelectedCallForDispatch] = useState(null);
    const [showCallDetail, setShowCallDetail] = useState(false);
    const [selectedCall, setSelectedCall] = useState(null);
    const [showCallSidebar, setShowCallSidebar] = useState(false);
    const [mapCenter, setMapCenter] = useState(null);
    const [pendingCallNotification, setPendingCallNotification] = useState(null);
    const lastCheckedCallIdRef = useRef(null);
    const [showDirectionsModal, setShowDirectionsModal] = useState(false);
    const [showAllUnitsPanel, setShowAllUnitsPanel] = useState(false);
    const [showHistoricalLogs, setShowHistoricalLogs] = useState(false);
    const [autoDispatchSuggestion, setAutoDispatchSuggestion] = useState(null);
    const [showUnitGrouping, setShowUnitGrouping] = useState(false);
    const [userPannedAway, setUserPannedAway] = useState(false);

    const [showLayerFilters, setShowLayerFilters] = useState(false);
    const [jurisdictionFilters, setJurisdictionFilters] = useState({
        richmondBeat: 'all', henricoDistrict: 'all', chesterfieldDistrict: 'all',
        baseMapType: 'street', searchAddress: '',
        showPoliceStations: true, showFireStations: false, showEMS: false, showJails: true
    });
    const [searchPin, setSearchPin] = useState(null);
    const [currentStreet, setCurrentStreet] = useState('Locating...');
    const [showAddressLookup, setShowAddressLookup] = useState(false);
    const [mapTheme, setMapTheme] = useState(() => {
        const saved = localStorage.getItem('mapTheme');
        if (saved) return saved;
        const hour = new Date().getHours();
        return hour >= 6 && hour < 19 ? 'day' : 'night';
    });
    const [realTimeAlert, setRealTimeAlert] = useState(null);

    const locationWatchId = useRef(null);
    const rerouteCheckInterval = useRef(null);
    const callsRefreshInterval = useRef(null);
    const lastPosition = useRef(null);
    const lastAnnouncedStep = useRef(-1);
    const lastHeadingRef = useRef(null);
    const lastLocationUpdateRef = useRef(0);
    const lastUnitStatesRef = useRef({});
    const lastCallCountRef = useRef(0);
    const lastHighPriorityCallsRef = useRef(new Set());

    const [criticalAlertSound] = useState(() => {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDWH0fPTgjMGHm7A7+OZUQ4PVKbh8LFVGA5On+DvwGMbBzaE0fPReiYEI3DC7+GTUAwQWK3l7q5XFAxAnN/zv2kdBDWH0PPTgyEEI3DD7+CTUQ0RWKzl7q5ZEwtCnN/zvmgdBDWH0fPRfiYEI3DE7+CTTw0PVqfj8K9VFg1Mnt/zv2kbBDOGz/PSfyYEJHPD7t+NTA0PWK3l761ZEgxBm9/zu2MbBDKGzvLPfSUEJXfE7t6OTQ0RW7Hl7ahVFQ5NneDvvWMbBjOGzvLP');
        audio.volume = 0.8;
        return audio;
    });

    const { speak, stop: stopSpeech } = useVoiceGuidance(voiceEnabled);
    const { startListening, stopListening } = useVoiceCommand((transcript) => {
        setIsListening(false);
        toast.info(`Heard: "${transcript}"`);
        searchDestination(transcript);
    });

    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); toast.success('Back online'); };
        const handleOffline = () => { setIsOnline(false); toast.error('No internet connection - using offline mode'); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, []);

    useEffect(() => {
        const init = async () => {
            await loadCurrentUser();
            const savedUnitName = localStorage.getItem('unitName');
            if (!savedUnitName) { setShowUnitSettings(true); toast.info('Please enter your unit number to continue'); }
            if (navigator.geolocation) {
                toast.info('Getting your location...');
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const coords = [position.coords.latitude, position.coords.longitude];
                        setCurrentLocation(coords);
                        setIsLocating(false);
                        toast.success('Location ready');
                        if (isOnline) startContinuousTracking();
                    },
                    () => { toast.error('Please enable location services'); setIsLocating(false); },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }
            fetchActiveCalls();
        };
        init();

        callsRefreshInterval.current = setInterval(() => { if (isOnline) fetchActiveCalls(true); }, 10000);

        const ingestInterval = setInterval(async () => {
            if (isOnline) { try { await base44.functions.invoke('ingestGractivecalls', {}); } catch (e) {} }
        }, 5 * 60 * 1000);

        if (navigator.onLine) base44.functions.invoke('ingestGractivecalls', {}).catch(() => {});

        return () => {
            stopContinuousTracking();
            clearInterval(ingestInterval);
            if (rerouteCheckInterval.current) clearInterval(rerouteCheckInterval.current);
            if (callsRefreshInterval.current) clearInterval(callsRefreshInterval.current);
        };
    }, []);

    useEffect(() => {
        if (isOnline && !isLiveTracking) startContinuousTracking();
    }, [isOnline]);

    useEffect(() => {
        if (currentUser && currentLocation) updateUserLocation();
    }, [currentUser, currentLocation, heading, speed, unitStatus, showLights, activeCallInfo]);

    // Dedicated interval to push location updates even when coords haven't changed
    useEffect(() => {
        if (!currentUser) return;
        const interval = setInterval(() => {
            if (currentLocation) updateUserLocation();
        }, 10000);
        return () => clearInterval(interval);
    }, [currentUser, currentLocation, unitStatus, showLights, activeCallInfo, heading, speed]);

    useEffect(() => {
        if (!currentUser || !currentLocation) return;
        const logInterval = setInterval(async () => {
            if (currentLocation && currentUser) {
                try {
                    await base44.functions.invoke('logLocation', { latitude: currentLocation[0], longitude: currentLocation[1], status: unitStatus, speed: speed || 0 });
                } catch (error) { console.error('Failed to log location:', error); }
            }
        }, 120000);
        if (currentLocation) {
            base44.functions.invoke('logLocation', { latitude: currentLocation[0], longitude: currentLocation[1], status: unitStatus, speed: speed || 0 }).catch(() => {});
        }
        return () => clearInterval(logInterval);
    }, [currentUser, currentLocation]);

    useEffect(() => {
        if (currentUser) {
            fetchOtherUnits();
            const interval = setInterval(() => fetchOtherUnits(true), 5000);
            return () => clearInterval(interval);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        const checkForNewCalls = async () => {
            try {
                const calls = await base44.entities.DispatchCall.list('-created_date', 50);
                const assignedCalls = calls.filter(call => call.assigned_units && Array.isArray(call.assigned_units) && call.assigned_units.includes(currentUser.id));
                if (assignedCalls.length > 0) {
                    const latestCall = assignedCalls[0];
                    if (lastCheckedCallIdRef.current !== latestCall.id && latestCall.latitude && latestCall.longitude) {
                        lastCheckedCallIdRef.current = latestCall.id;
                        setPendingCallNotification(latestCall);
                    }
                }
            } catch (error) {}
        };
        checkForNewCalls();
        const interval = setInterval(checkForNewCalls, 10000);
        return () => clearInterval(interval);
    }, [currentUser]);

    useEffect(() => {
        if (isNavigating && currentLocation && destination && isOnline) {
            rerouteCheckInterval.current = setInterval(() => checkForBetterRoute(), 60000);
            return () => { if (rerouteCheckInterval.current) clearInterval(rerouteCheckInterval.current); };
        }
    }, [isNavigating, currentLocation, destination, isOnline]);

    useEffect(() => {
        const interval = setInterval(() => { if (!isNavigating) getCurrentLocation(); }, 30000);
        return () => clearInterval(interval);
    }, [isNavigating]);

    const getDistanceMeters = (coord1, coord2) => {
        const R = 6371000;
        const lat1 = coord1[0] * Math.PI / 180, lat2 = coord2[0] * Math.PI / 180;
        const dLat = (coord2[0] - coord1[0]) * Math.PI / 180, dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const applySmoothing = (lat, lng, accuracy, speed) => {
        if (speed < 1 || (accuracy && accuracy < 10)) { kalmanState.current = { lat, lng, variance: 100 }; return [lat, lng]; }
        if (kalmanState.current.lat === null) { kalmanState.current = { lat, lng, variance: 100 }; return [lat, lng]; }
        const weight = Math.min(0.3, speed / 20);
        const newLat = kalmanState.current.lat * (1 - weight) + lat * weight;
        const newLng = kalmanState.current.lng * (1 - weight) + lng * weight;
        kalmanState.current = { lat: newLat, lng: newLng, variance: 100 };
        return [newLat, newLng];
    };

    const smoothHeading = (newHeading, currentSpeed) => {
        if (lastHeadingRef.current === null) { lastHeadingRef.current = newHeading; return newHeading; }
        let diff = newHeading - lastHeadingRef.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        const easingFactor = currentSpeed > 10 ? 0.3 : 0.15;
        const smoothed = lastHeadingRef.current + diff * easingFactor;
        lastHeadingRef.current = ((smoothed % 360) + 360) % 360;
        return lastHeadingRef.current;
    };

    const checkIfOffRoute = (position, routeCoordinates) => {
        if (!routeCoordinates || routeCoordinates.length === 0 || !isNavigating) return;
        let minDist = Infinity;
        for (const coord of routeCoordinates) { const d = getDistanceMeters(position, coord); if (d < minDist) minDist = d; }
        if (minDist > 100) { setIsOffRoute(true); toast.warning('Off route - recalculating...'); setTimeout(() => checkForBetterRoute(), 2000); }
        else setIsOffRoute(false);
    };

    const startContinuousTracking = () => {
        if (!navigator.geolocation) { toast.error('Geolocation is not supported'); return; }
        setIsLiveTracking(true);
        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const rawCoords = [position.coords.latitude, position.coords.longitude];
                const rawSpeed = position.coords.speed !== null && position.coords.speed >= 0 ? Math.max(0, position.coords.speed * 2.237) : 0;
                const now = Date.now();
                if (!window.lastStreetUpdate || now - window.lastStreetUpdate > 5000) {
                    window.lastStreetUpdate = now;
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${rawCoords[0]}&lon=${rawCoords[1]}&zoom=16&addressdetails=1`, { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } })
                        .then(res => res.json()).then(data => {
                            if (data?.address) {
                                const a = data.address;
                                const s = a.road || a.street || a.highway || a.path || a.footway || a.cycleway || a.residential || a.suburb || a.neighbourhood || a.village || a.town || a.county || '';
                                const c = a.city || a.town || a.village || a.county || '';
                                if (s) setCurrentStreet(c && c !== s ? `${s}, ${c}` : s);
                                else if (data.display_name) setCurrentStreet(data.display_name.split(',')[0]);
                                else setCurrentStreet('Near unknown road');
                            }
                        })
                        .catch(() => setCurrentStreet('Location unavailable'));
                }
                if (lastPosition.current) {
                    const dist = getDistanceMeters(lastPosition.current, rawCoords);
                    if ((dist / 1) * 2.237 > 150) return;
                }
                const finalCoords = rawSpeed > 5 ? applySmoothing(rawCoords[0], rawCoords[1], position.coords.accuracy, rawSpeed) : rawCoords;
                setCurrentLocation(finalCoords);
                let newHeading = null;
                if (rawSpeed > 3 && position.coords.heading !== null && position.coords.heading >= 0) newHeading = position.coords.heading;
                else if (rawSpeed > 3 && lastPosition.current) newHeading = calculateHeading(lastPosition.current, finalCoords);
                else if (position.coords.heading !== null && position.coords.heading >= 0) newHeading = position.coords.heading;
                if (newHeading !== null && !isNaN(newHeading)) setHeading(smoothHeading(newHeading, rawSpeed));
                setSpeed(Math.max(0, Math.round(rawSpeed)));
                setAccuracy(position.coords.accuracy);
                setLocationHistory(prev => [...prev, finalCoords].slice(-30));
                lastPosition.current = finalCoords;
                if (isNavigating && routeCoords) checkIfOffRoute(finalCoords, routeCoords);
                if (isNavigating && directions) updateNavigationProgress(finalCoords);
            },
            (error) => { if (error.code === error.PERMISSION_DENIED) { toast.error('Location permission denied'); setIsLiveTracking(false); } },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    };

    const stopContinuousTracking = () => {
        if (locationWatchId.current) { navigator.geolocation.clearWatch(locationWatchId.current); locationWatchId.current = null; }
        setIsLiveTracking(false);
    };

    const loadCurrentUser = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            if (user.status) setUnitStatus(user.status);
            if (user.current_call_info) setActiveCallInfo(user.current_call_info);
        } catch (error) {}
    };

    const updateUserLocation = useCallback(async () => {
        if (!currentUser || !currentLocation) return;
        const now = Date.now();
        if (now - lastLocationUpdateRef.current < 3000) return;
        lastLocationUpdateRef.current = now;
        try {
            await base44.auth.updateMe({
                latitude: currentLocation[0], longitude: currentLocation[1],
                heading: heading || 0, speed: speed || 0,
                status: unitStatus, show_lights: showLights, current_call_info: activeCallInfo,
                show_on_map: true,
                last_updated: new Date().toISOString()
            });
        } catch (error) { console.error('Error updating user location:', error); }
    }, [currentUser, currentLocation, heading, speed, unitStatus, showLights, activeCallInfo]);

    const fetchOtherUnits = async (silentMode = false) => {
        if (!currentUser) return;
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const users = response.data?.users || [];
            if (silentMode) {
                users.forEach(user => {
                    const lastState = lastUnitStatesRef.current[user.id];
                    if (lastState && lastState.status !== user.status) {
                        const uName = user.unit_number || user.full_name;
                        setRealTimeAlert({ type: 'unit_status_change', message: `${uName}: ${lastState.status} → ${user.status}`, data: user });
                    }
                    lastUnitStatesRef.current[user.id] = { status: user.status, call_info: user.current_call_info };
                });
            } else {
                users.forEach(user => { lastUnitStatesRef.current[user.id] = { status: user.status, call_info: user.current_call_info }; });
            }
            setOtherUnits(users);
        } catch (error) { console.error('fetchOtherUnits error:', error); }
    };

    const calculateHeading = (from, to) => {
        const lat1 = from[0]*Math.PI/180, lat2 = to[0]*Math.PI/180, dLon = (to[1]-from[1])*Math.PI/180;
        const y = Math.sin(dLon)*Math.cos(lat2), x = Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
        return Math.round(((Math.atan2(y, x)*180/Math.PI) + 360) % 360);
    };

    const getCurrentLocation = useCallback(() => {
        setIsLocating(true);
        if (!navigator.geolocation) { toast.error('Geolocation not supported'); setIsLocating(false); return; }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const coords = [position.coords.latitude, position.coords.longitude];
                setCurrentLocation(coords);
                setIsLocating(false);
                if (currentUser) {
                    try {
                        await base44.auth.updateMe({ latitude: coords[0], longitude: coords[1], heading: position.coords.heading || heading || 0, speed: position.coords.speed ? position.coords.speed * 2.237 : 0, status: unitStatus, show_lights: showLights, show_on_map: true, current_call_info: activeCallInfo, last_updated: new Date().toISOString() });
                        toast.success('Location updated & synced to map');
                    } catch (error) { toast.warning('Location found but sync failed'); }
                } else {
                    toast.success(`Location found`);
                }
            },
            (error) => {
                if (error.code === error.PERMISSION_DENIED) toast.error('Location permission denied');
                else toast.error('Unable to get your location');
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }, [currentUser, unitStatus, showLights, activeCallInfo, heading]);

    const checkForBetterRoute = async () => {
        if (!currentLocation || !destination) return;
        try {
            const newRoutes = await fetchRoutes(currentLocation, destination.coords);
            if (newRoutes?.length > 0) {
                let fastestIndex = 0, fastestDuration = newRoutes[0].duration;
                for (let i = 1; i < newRoutes.length; i++) { if (newRoutes[i].duration < fastestDuration) { fastestDuration = newRoutes[i].duration; fastestIndex = i; } }
                const currentRoute = routes[selectedRouteIndex];
                if (currentRoute.duration - fastestDuration > 120) {
                    setIsRerouting(true);
                    toast.info(`Faster route found! Saving ${Math.round((currentRoute.duration - fastestDuration) / 60)} min`);
                    setTimeout(() => { setRoutes(newRoutes); setSelectedRouteIndex(fastestIndex); updateRouteDisplay(newRoutes[fastestIndex]); setIsRerouting(false); }, 2000);
                }
            }
        } catch (error) {}
    };

    const updateNavigationProgress = (coords) => {
        if (!directions || currentStepIndex >= directions.length - 1) {
            setIsNavigating(false);
            if (voiceEnabled) speak('You have arrived at your destination');
            toast.success('You have arrived at your destination!');
            handleStatusChange('On Scene');
            return;
        }
        if (routeCoords?.length > 0) {
            let minDist = Infinity, closestIndex = 0;
            for (let i = 0; i < routeCoords.length; i++) { const d = getDistanceMeters(coords, routeCoords[i]); if (d < minDist) { minDist = d; closestIndex = i; } }
            let remainingDist = 0;
            for (let i = closestIndex; i < routeCoords.length - 1; i++) remainingDist += getDistanceMeters(routeCoords[i], routeCoords[i+1]);
            setRemainingDistance(`${(remainingDist/1609.34).toFixed(1)} mi`);
            const stepProgress = Math.floor(closestIndex / (routeCoords.length / directions.length));
            if (stepProgress > currentStepIndex && stepProgress < directions.length) {
                setCurrentStepIndex(stepProgress);
                if (voiceEnabled && stepProgress !== lastAnnouncedStep.current) { const s = directions[stepProgress]; if (s) { speak(`In ${s.distance}, ${s.instruction}`); lastAnnouncedStep.current = stepProgress; } }
            }
        }
    };

    const searchDestination = async (query) => {
        if (!query?.trim()) { toast.error('Please enter a destination'); return; }
        if (!currentLocation) { toast.error('Getting your location first...'); getCurrentLocation(); return; }
        setIsSearching(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Virginia, USA')}&limit=5`, { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } });
            const data = await response.json();
            if (data?.length > 0) {
                const result = data.find(r => r.display_name.toLowerCase().includes('virginia')) || data[0];
                const destCoords = [parseFloat(result.lat), parseFloat(result.lon)];
                setDestination({ coords: destCoords, name: result.display_name });
                setDestinationName(result.display_name.split(',')[0]);
                const fetchedRoutes = await fetchRoutes(currentLocation, destCoords);
                if (fetchedRoutes?.length > 0) {
                    let fastestIndex = 0, fastestDuration = fetchedRoutes[0].duration;
                    for (let i = 1; i < fetchedRoutes.length; i++) { if (fetchedRoutes[i].duration < fastestDuration) { fastestDuration = fetchedRoutes[i].duration; fastestIndex = i; } }
                    setRoutes(fetchedRoutes); setSelectedRouteIndex(fastestIndex); updateRouteDisplay(fetchedRoutes[fastestIndex]);
                } else toast.error('Could not calculate route');
            } else toast.error('Location not found');
        } catch (error) { toast.error('Search failed: ' + error.message); }
        finally { setIsSearching(false); }
    };

    const fetchRoutes = async (start, end) => {
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=2&overview=full&geometries=geojson&steps=true`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.code === 'Ok' && data.routes?.length > 0) return data.routes.map(route => ({ ...route, hasTraffic: Math.random() > 0.5 }));
            else { toast.error('Routing error: ' + (data.message || data.code)); return null; }
        } catch (error) { toast.error('Network error: ' + error.message); return null; }
    };

    const updateRouteDisplay = (routeData) => {
        if (!routeData?.geometry || !routeData?.legs?.[0]) { toast.error('Invalid route data received'); return; }
        const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        setTrafficSegments(generateTrafficData(coordinates));
        const distanceMiles = (routeData.distance / 1609.34).toFixed(1);
        setDistance(`${distanceMiles} mi`);
        const baseDurationMins = Math.round(routeData.duration / 60);
        const etaTime = new Date(Date.now() + baseDurationMins * 60000);
        const etaFormatted = etaTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        setDuration(baseDurationMins >= 60 ? `${Math.floor(baseDurationMins/60)}h ${baseDurationMins%60}m (ETA ${etaFormatted})` : `${baseDurationMins} min (ETA ${etaFormatted})`);
        const steps = routeData.legs[0].steps.map(step => {
            const { type, modifier } = step.maneuver || {};
            const street = step.name || '';
            let instruction = '';
            if (type === 'depart') instruction = street ? `Head ${modifier || 'forward'} on ${street}` : 'Start your journey';
            else if (type === 'arrive') instruction = 'Arrive at your destination';
            else if (type === 'turn') instruction = street ? `Turn ${modifier} onto ${street}` : `Turn ${modifier}`;
            else if (type === 'merge' || type === 'on ramp') instruction = street ? `Merge onto ${street}` : 'Merge';
            else if (type === 'off ramp') instruction = street ? `Take exit onto ${street}` : 'Take exit';
            else if (type === 'continue' || type === 'new name') instruction = street ? `Continue on ${street}` : 'Continue straight';
            else instruction = step.maneuver?.instruction || `Continue for ${Math.round(step.distance * 3.281)} ft`;
            const distText = step.distance > 1000 ? `${(step.distance/1609.34).toFixed(1)} mi` : `${Math.round(step.distance * 3.281)} ft`;
            return { instruction, distance: distText };
        });
        setDirections(steps);
        if (steps.length > 0) toast.success(`Route ready: ${distanceMiles} mi, ${baseDurationMins} min - Tap Start Navigation`);
    };

    const handleSelectRoute = (index) => { setSelectedRouteIndex(index); updateRouteDisplay(routes[index]); };

    const startNavigation = () => {
        if (!directions?.length) { toast.error('No directions available'); return; }
        setIsNavigating(true); setCurrentStepIndex(0); setRemainingDistance(distance); lastAnnouncedStep.current = -1;
        if (routes?.[selectedRouteIndex]?.hasTraffic) {
            setTrafficAlert({ message: 'Moderate traffic detected ahead', canReroute: routes.length > 1 });
            if (voiceEnabled) speak('Warning: moderate traffic detected on your route');
        }
        if (voiceEnabled && directions?.[0]) speak(`Starting navigation to ${destinationName}. ${directions[0].instruction}`);
        toast.success('Navigation started - Follow the route');
    };

    const exitNavigation = async () => {
        setIsNavigating(false); setTrafficAlert(null); stopSpeech();
        if (rerouteCheckInterval.current) clearInterval(rerouteCheckInterval.current);
        if (unitStatus === 'Enroute' && currentUser) { await handleStatusChange('On Scene'); toast.success('Status set to On Scene'); }
    };

    const handleSaveUnitName = async (name) => {
        setUnitName(name); localStorage.setItem('unitName', name);
        const assignedCar = localStorage.getItem('assignedCar') || '';
        if (currentUser) {
            try { await base44.auth.updateMe({ unit_number: name, assigned_vehicle: assignedCar }); toast.success('Unit number saved'); await updateUserLocation(); } catch (error) {}
        }
    };

    const handleStatusChange = async (newStatus, eta = null) => {
        const oldStatus = unitStatus;
        setUnitStatus(newStatus);
        const shouldShowLights = newStatus === 'Enroute' || newStatus === 'On Scene' || newStatus === 'Dispatched';
        setShowLights(shouldShowLights); localStorage.setItem('showLights', shouldShowLights);
        if (currentUser) {
            try {
                await base44.functions.invoke('updateOfficerStatus', { status: newStatus, estimated_return: eta });
                const updateData = { status: newStatus, show_lights: shouldShowLights, last_updated: new Date().toISOString() };
                if (eta) updateData.estimated_return = new Date(eta).toISOString();
                if (newStatus === 'Available' || newStatus === 'Out of Service') { updateData.current_call_id = null; updateData.current_call_info = null; setActiveCallInfo(null); }
                await base44.auth.updateMe(updateData);
                toast.success(`Status: ${newStatus}`);
                if ((newStatus === 'Available' || newStatus === 'Returning to Station') && activeCalls.length > 0) checkAutoDispatch();
                await updateUserLocation();
            } catch (error) { setUnitStatus(oldStatus); toast.error('Failed to update status'); }
        }
    };

    const assessCallPriority = (call) => {
        const combined = `${call.incident || ''} ${call.description || ''}`.toLowerCase();
        if (/shooting|stabbing|officer down|shots fired|active shooter|code 3/.test(combined)) return { level: 'critical', score: 4, label: 'CRITICAL' };
        if (/assault|robbery|burglary in progress|domestic|pursuit|accident with injury/.test(combined)) return { level: 'high', score: 3, label: 'HIGH' };
        if (/suspicious|disturbance|trespass|alarm/.test(combined)) return { level: 'medium', score: 2, label: 'MEDIUM' };
        return { level: 'low', score: 1, label: 'LOW' };
    };

    const checkAutoDispatch = async () => {
        if (!currentLocation || !activeCalls?.length) return;
        try {
            const sortedCalls = [...activeCalls].sort((a, b) => assessCallPriority(b).score - assessCallPriority(a).score);
            const call = sortedCalls[0];
            const dist = calculateDistance(currentLocation[0], currentLocation[1], call.latitude, call.longitude);
            setAutoDispatchSuggestion({
                call: { ...call, priority: assessCallPriority(call) },
                unit: { id: currentUser.id, unit_number: unitName || currentUser.full_name, status: unitStatus },
                distance: `${(dist * 0.621371).toFixed(1)} mi`, eta: `${Math.ceil((dist / 60) * 60)} min`
            });
        } catch (error) {}
    };

    const handleEnrouteToCall = async (call) => {
        if (!call.latitude || !call.longitude || isNaN(call.latitude) || isNaN(call.longitude)) { toast.error('Call location not available for navigation'); return; }
        const callInfo = `${call.incident} - ${call.location}`;
        const callId = call.id || `${call.timeReceived}-${call.incident}`;
        if (currentUser) {
            setActiveCallInfo(callInfo); setUnitStatus('Enroute');
            try {
                await base44.auth.updateMe({ status: 'Enroute', current_call_id: callId, current_call_info: callInfo, last_updated: new Date().toISOString() });
                await base44.entities.UnitStatusLog.create({ unit_id: currentUser.id, unit_name: unitName || currentUser.full_name, old_status: unitStatus, new_status: 'Enroute', location_lat: currentLocation?.[0], location_lng: currentLocation?.[1], call_id: callId, notes: `Responding to ${call.incident}` });
                await base44.entities.CallStatusLog.create({ call_id: callId, incident_type: call.incident, location: call.location, old_status: call.status, new_status: 'Enroute', unit_id: currentUser.id, unit_name: unitName || currentUser.full_name, latitude: call.latitude, longitude: call.longitude });
                const priority = assessCallPriority(call);
                if (priority.score >= 3) criticalAlertSound.play().catch(() => {});
                toast.success(`Enroute to ${call.incident}`);
            } catch (error) { console.error('Error updating user status:', error); }
        }
        setDestination({ coords: [call.latitude, call.longitude], name: call.location });
        setDestinationName(call.incident);
        if (currentLocation) {
            const fetchedRoutes = await fetchRoutes(currentLocation, [call.latitude, call.longitude]);
            if (fetchedRoutes?.length > 0) {
                let fastestIndex = 0, fastestDuration = fetchedRoutes[0].duration;
                for (let i = 1; i < fetchedRoutes.length; i++) { if (fetchedRoutes[i].duration < fastestDuration) { fastestDuration = fetchedRoutes[i].duration; fastestIndex = i; } }
                setRoutes(fetchedRoutes); setSelectedRouteIndex(fastestIndex); updateRouteDisplay(fetchedRoutes[fastestIndex]); setShowDirectionsModal(true);
            }
        }
    };

    const applyCallFilter = (calls, filters) => {
        setActiveCalls(calls.filter(call => {
            const agency = (call.agency || '').toUpperCase();
            if ((agency.includes('RPD') || agency.includes('RICHMOND')) && filters.showRPD) return true;
            if ((agency.includes('HPD') || agency.includes('HCPD') || agency.includes('HENRICO')) && filters.showHPD) return true;
            if ((agency.includes('CCPD') || agency.includes('CCFD') || agency.includes('CHESTERFIELD')) && filters.showCCPD) return true;
            return false;
        }));
    };

    const handleCallFilterChange = (newFilters) => { setCallAgencyFilters(newFilters); applyCallFilter(allActiveCalls, newFilters); };

    const handleLayerFilterChange = async (newFilters) => {
        setJurisdictionFilters(newFilters);
        if (newFilters.searchAddress && newFilters.searchAddress !== jurisdictionFilters.searchAddress) {
            try {
                toast.info('Searching...');
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newFilters.searchAddress + ', Virginia, USA')}&limit=5`, { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } });
                const data = await response.json();
                if (data?.length > 0) {
                    const result = data.find(r => r.display_name.toLowerCase().includes('virginia')) || data[0];
                    const coords = [parseFloat(result.lat), parseFloat(result.lon)];
                    setMapCenter(coords);
                    setSearchPin({ coords, address: result.display_name, propertyInfo: 'Loading property information...' });
                    toast.success(`Found: ${result.display_name.split(',')[0]}`);
                    try {
                        const propertyInfo = await base44.integrations.Core.InvokeLLM({ prompt: `Search public records for property info at: ${result.display_name}\nFind: Owner name, assessed value, year built, property type, lot size, last sale, tax info. Format with bullet points. Say "Not found" if unavailable.`, add_context_from_internet: true });
                        setSearchPin({ coords, address: result.display_name, propertyInfo: propertyInfo || 'Property information not available' });
                        toast.success('Property information loaded');
                    } catch (error) { setSearchPin({ coords, address: result.display_name, propertyInfo: 'Error loading property information.' }); }
                } else { toast.error('Address not found'); setSearchPin(null); }
            } catch (error) { toast.error('Failed to search address'); setSearchPin(null); }
        }
    };

    const fetchActiveCalls = async (silent = false) => {
        if (!isOnline) { if (!silent) toast.error('Cannot fetch calls while offline'); return; }
        setIsLoadingCalls(true);
        try {
            const allCalls = await base44.entities.DispatchCall.list('-created_date', 500);
            const recentCalls = allCalls.filter(call => {
                const isActive = !call.status || !['Closed', 'Cleared', 'Cancelled'].includes(call.status);
                const agency = (call.agency || '').toUpperCase();
                const isAllowed = agency.includes('RPD') || agency.includes('RICHMOND') || agency.includes('RFD') || agency.includes('HPD') || agency.includes('HCPD') || agency.includes('HENRICO') || agency.includes('HFD') || agency.includes('CCPD') || agency.includes('CCFD') || agency.includes('CHESTERFIELD');
                return isActive && isAllowed;
            });
            if (silent && lastCallCountRef.current > 0) {
                const newCallCount = recentCalls.length - lastCallCountRef.current;
                if (newCallCount > 0) {
                    const newHighPriority = recentCalls.filter(call => {
                        const priority = assessCallPriority(call);
                        const key = `${call.time_received}-${call.incident}-${call.location}`;
                        return priority.score >= 3 && !lastHighPriorityCallsRef.current.has(key);
                    });
                    if (newHighPriority.length > 0) {
                        newHighPriority.forEach(call => {
                            const priority = assessCallPriority(call);
                            setRealTimeAlert({ type: 'new_incident', message: `${priority.label}: ${call.incident} at ${call.location}`, data: call, priority: priority.score });
                            if (priority.score === 4) criticalAlertSound.play().catch(() => {});
                        });
                    } else { toast.info(`${newCallCount} new call${newCallCount > 1 ? 's' : ''} detected`, { duration: 3000, position: 'bottom-right' }); }
                    lastHighPriorityCallsRef.current = new Set(recentCalls.filter(c => assessCallPriority(c).score >= 3).map(c => `${c.time_received}-${c.incident}-${c.location}`));
                }
            }
            lastCallCountRef.current = recentCalls.length;
            setShowActiveCalls(true); setAllActiveCalls(recentCalls); applyCallFilter(recentCalls, callAgencyFilters);
            if (!silent) toast.success(`Loaded ${recentCalls.length} active calls`);
        } catch (error) {
            if (!silent) toast.error('Failed to load active calls');
            setAllActiveCalls([]); setActiveCalls([]);
        } finally { setIsLoadingCalls(false); }
    };

    const clearRoute = () => { setDestination(null); setRoutes(null); setDirections(null); setTrafficSegments(null); setDistance(''); setDuration(''); setDestinationName(''); setIsNavigating(false); setCurrentStepIndex(0); setShowDirectionsModal(false); };

    const handleLightsChange = (enabled) => { setShowLights(enabled); localStorage.setItem('showLights', enabled); };
    const handleVoiceCommand = () => {
        setIsListening(true);
        if (!startListening()) { toast.error('Voice commands not supported'); setIsListening(false); }
        else toast.info('Listening... Say a destination');
    };

    const selectedRoute = routes?.[selectedRouteIndex];
    const routeCoords = selectedRoute ? selectedRoute.geometry.coordinates.map(coord => [coord[1], coord[0]]) : null;

    return (
        <div className="h-screen w-screen relative overflow-hidden bg-[#F5F5F7] pointer-events-none">
            <div className="pointer-events-auto w-full h-full">
                <MapView
                    currentLocation={currentLocation} destination={destination} route={routeCoords}
                    trafficSegments={trafficSegments} useOfflineTiles={!isOnline} activeCalls={activeCalls}
                    heading={heading} locationHistory={isLiveTracking ? locationHistory : []}
                    unitName={unitName || currentUser?.unit_number} showLights={showLights}
                    otherUnits={otherUnits} currentUserId={currentUser?.id} speed={speed}
                    mapCenter={mapCenter} isNavigating={isNavigating} baseMapType={jurisdictionFilters.baseMapType}
                    jurisdictionFilters={jurisdictionFilters} showPoliceStations={jurisdictionFilters.showPoliceStations}
                    showFireStations={jurisdictionFilters.showFireStations} showJails={jurisdictionFilters.showJails}
                    searchPin={searchPin} mapTheme={mapTheme}
                    onCallClick={(call) => { setSelectedCall(call); setShowCallSidebar(true); }}
                    onNavigateToJail={async (jail) => {
                        setDestination({ coords: jail.coords, name: jail.name }); setDestinationName(jail.name);
                        if (currentLocation) {
                            const fetchedRoutes = await fetchRoutes(currentLocation, jail.coords);
                            if (fetchedRoutes?.length > 0) {
                                let fi = 0, fd = fetchedRoutes[0].duration;
                                for (let i = 1; i < fetchedRoutes.length; i++) { if (fetchedRoutes[i].duration < fd) { fd = fetchedRoutes[i].duration; fi = i; } }
                                setRoutes(fetchedRoutes); setSelectedRouteIndex(fi); updateRouteDisplay(fetchedRoutes[fi]);
                            }
                        }
                    }}
                >
                    <VACountiesBoundaries />
                </MapView>
            </div>

            {/* Traffic Alert */}
            <AnimatePresence>
                {trafficAlert && isNavigating && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-20 left-4 right-4 z-[999] md:left-1/2 md:-translate-x-1/2 md:w-[480px]">
                        <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-lg">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-semibold text-sm">{trafficAlert.message}</p>
                                    {trafficAlert.canReroute && <Button onClick={() => { const alt = routes.findIndex((r, i) => i !== selectedRouteIndex && !r.hasTraffic); if (alt !== -1) { handleSelectRoute(alt); setTrafficAlert(null); toast.success('Rerouting to avoid traffic'); } }} size="sm" className="mt-2 bg-white text-amber-600 hover:bg-gray-100">Auto-Reroute</Button>}
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setTrafficAlert(null)} className="text-white hover:bg-white/20"><X className="w-4 h-4" /></Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Back Button */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute top-2 left-2 z-[1003] pointer-events-auto">
                <Button onClick={() => navigate(createPageUrl('CADHome'))} className="bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white rounded-md p-2">← BACK</Button>
            </motion.div>

            {/* Compass */}
            {heading !== null && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute top-20 left-2 z-[999] pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-white/95 backdrop-blur-xl shadow-lg border-2 border-gray-200 flex items-center justify-center relative">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-[10px] font-bold text-gray-400 absolute" style={{ top: '4px' }}>N</div>
                            <div className="text-[10px] font-bold text-gray-300 absolute" style={{ right: '4px' }}>E</div>
                            <div className="text-[10px] font-bold text-gray-300 absolute" style={{ bottom: '4px' }}>S</div>
                            <div className="text-[10px] font-bold text-gray-300 absolute" style={{ left: '4px' }}>W</div>
                        </div>
                        <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: `rotate(${heading}deg)`, transition: 'transform 0.3s ease' }}>
                            <polygon points="20,5 22,18 20,16 18,18" fill="#EF4444" stroke="#DC2626" strokeWidth="1"/>
                            <polygon points="20,35 22,22 20,24 18,22" fill="#9CA3AF" stroke="#6B7280" strokeWidth="1"/>
                        </svg>
                    </div>
                </motion.div>
            )}

            <NavigationStatusBar isOnline={isOnline} accuracy={accuracy} isLiveTracking={isLiveTracking} currentStreet={currentStreet} isOffRoute={isOffRoute} isNavigating={isNavigating} speed={speed} />

            <NavigationLeftControls
                isNavigating={isNavigating} unitStatus={unitStatus} isLocating={isLocating}
                getCurrentLocation={getCurrentLocation} handleStatusChange={handleStatusChange}
                clearRoute={clearRoute} currentUser={currentUser} setUnitStatus={setUnitStatus} setActiveCallInfo={setActiveCallInfo}
            />

            <NavigationRightControls
                showActiveCalls={showActiveCalls} setShowActiveCalls={setShowActiveCalls} activeCalls={activeCalls}
                fetchActiveCalls={fetchActiveCalls} fetchOtherUnits={fetchOtherUnits} isLoadingCalls={isLoadingCalls}
                setShowCallFilterPanel={setShowCallFilterPanel} setShowLayerFilters={setShowLayerFilters}
                setShowAddressLookup={setShowAddressLookup} setShowCallsList={setShowCallsList}
                setShowUnitSettingsPanel={setShowUnitSettingsPanel} setShowOfflineManager={setShowOfflineManager}
                voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled} mapTheme={mapTheme} setMapTheme={setMapTheme} isOnline={isOnline}
            />

            {/* Recenter Button */}
            <AnimatePresence>
                {isNavigating && userPannedAway && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute bottom-40 right-4 z-[1002] pointer-events-auto">
                        <Button onClick={() => { setUserPannedAway(false); toast.success('Recentered on your location'); }} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-6 rounded-2xl shadow-2xl flex items-center gap-2">
                            <NavigationIcon className="w-6 h-6" /><span className="font-semibold">Recenter</span>
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isNavigating && (
                <>
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="absolute top-4 z-[1002] pointer-events-auto" style={{ left: '50%', transform: 'translateX(-50%)', width: 'min(400px, calc(100vw - 100px))' }}>
                        <SearchBarWithHistory onSearch={searchDestination} isSearching={isSearching} onClear={clearRoute} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto">
                        <Button onClick={handleVoiceCommand} disabled={isListening} size="icon" className={`h-14 w-14 rounded-full shadow-lg ${isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-white/95 hover:bg-white'}`}>
                            <Mic className={`w-6 h-6 ${isListening ? 'text-white' : 'text-[#007AFF]'}`} />
                        </Button>
                    </motion.div>
                </>
            )}

            <AnimatePresence>
                {!currentLocation && !isLocating && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute bottom-32 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] md:right-auto z-[1000] bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <p className="text-sm text-amber-700">Enable location services for navigation</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {isNavigating && directions && (
                <LiveNavigation currentStep={directions[currentStepIndex]} nextStep={directions[currentStepIndex + 1]} remainingDistance={remainingDistance} remainingTime={duration} onExit={exitNavigation} isRerouting={isRerouting} />
            )}

            {!isNavigating && directions?.length > 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute bottom-[420px] left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto">
                    <Button onClick={startNavigation} size="lg" className="bg-[#007AFF] hover:bg-[#0056CC] text-white px-8 py-6 text-xl font-bold rounded-2xl shadow-2xl animate-pulse">
                        <NavigationIcon className="w-6 h-6 mr-2" />Start Navigation
                    </Button>
                </motion.div>
            )}

            <NavigationModals
                showUnitSettings={showUnitSettings} setShowUnitSettings={setShowUnitSettings}
                unitName={unitName} handleSaveUnitName={handleSaveUnitName} showLights={showLights} handleLightsChange={handleLightsChange}
                showLayerFilters={showLayerFilters} setShowLayerFilters={setShowLayerFilters}
                jurisdictionFilters={jurisdictionFilters} handleLayerFilterChange={handleLayerFilterChange}
                showCallsList={showCallsList} setShowCallsList={setShowCallsList} activeCalls={activeCalls}
                showCallDetail={showCallDetail} setShowCallDetail={setShowCallDetail}
                selectedCall={selectedCall} setSelectedCall={setSelectedCall}
                showCallSidebar={showCallSidebar} setShowCallSidebar={setShowCallSidebar}
                handleEnrouteToCall={handleEnrouteToCall} setMapCenter={setMapCenter}
                showStatusPanel={showStatusPanel} setShowStatusPanel={setShowStatusPanel}
                unitStatus={unitStatus} currentUser={currentUser} handleStatusChange={handleStatusChange}
                activeCallInfo={activeCallInfo} currentLocation={currentLocation}
                showDispatchPanel={showDispatchPanel} setShowDispatchPanel={setShowDispatchPanel}
                selectedCallForDispatch={selectedCallForDispatch} handleAssignUnit={(call, unit) => toast.success(`${unit.unit_name} assigned to ${call.incident}`)}
                showDirectionsModal={showDirectionsModal} setShowDirectionsModal={setShowDirectionsModal}
                directions={directions} destinationName={destinationName} distance={distance} duration={duration}
                routes={routes} handleSelectRoute={handleSelectRoute} selectedRouteIndex={selectedRouteIndex}
                pendingCallNotification={pendingCallNotification}
                handleAcceptCall={(call) => { setPendingCallNotification(null); if (call.latitude && call.longitude) handleEnrouteToCall(call); else toast.error('Call location not available'); }}
                handleDismissNotification={() => setPendingCallNotification(null)}
                showAllUnitsPanel={showAllUnitsPanel} setShowAllUnitsPanel={setShowAllUnitsPanel}
                showHistoricalLogs={showHistoricalLogs} setShowHistoricalLogs={setShowHistoricalLogs}
                showUnitGrouping={showUnitGrouping} setShowUnitGrouping={setShowUnitGrouping}
                showUnitSettingsPanel={showUnitSettingsPanel} setShowUnitSettingsPanel={setShowUnitSettingsPanel}
                autoDispatchSuggestion={autoDispatchSuggestion} setAutoDispatchSuggestion={setAutoDispatchSuggestion}
                showAddressLookup={showAddressLookup} setShowAddressLookup={setShowAddressLookup} setSearchPin={setSearchPin}
                realTimeAlert={realTimeAlert} setRealTimeAlert={setRealTimeAlert}
                showCallFilterPanel={showCallFilterPanel} setShowCallFilterPanel={setShowCallFilterPanel}
                callAgencyFilters={callAgencyFilters} handleCallFilterChange={handleCallFilterChange}
                showOfflineManager={showOfflineManager} setShowOfflineManager={setShowOfflineManager} isOnline={isOnline}
            />
        </div>
    );
}