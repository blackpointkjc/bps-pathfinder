import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Map as MapIcon, Wifi, WifiOff, Radio, Car, Settings, Mic, Volume2, X, CheckCircle2, Navigation as NavigationIcon, MapPin, XCircle, Plus, Shield, Filter, MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import SearchBarWithHistory from '@/components/map/SearchBarWithHistory';
import LocationButton from '@/components/map/LocationButton';
import DirectionsPanel from '@/components/map/DirectionsPanel';
import RouteOptions from '@/components/map/RouteOptions';
import LiveNavigation from '@/components/map/LiveNavigation';
import OfflineMapManager from '@/components/map/OfflineMapManager';
import UnitSettings from '@/components/map/UnitSettings';
import RoutePreferences from '@/components/map/RoutePreferences';
import ActiveCallsList from '@/components/map/ActiveCallsList';
import OtherUnitsLayer from '@/components/map/OtherUnitsLayer';
import UnitStatusPanel from '@/components/map/UnitStatusPanel';
import DispatchPanel from '@/components/map/DispatchPanel';
import CallDetailView from '@/components/map/CallDetailView';
import CallDetailSidebar from '@/components/map/CallDetailSidebar';
import CallNotification from '@/components/dispatch/CallNotification';
import { useVoiceGuidance, useVoiceCommand } from '@/components/map/VoiceGuidance';
import { generateTrafficData } from '@/components/map/TrafficLayer';
import LayerFilterPanel from '@/components/map/LayerFilterPanel';

export default function Navigation() {
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
    const [showOfflineManager, setShowOfflineManager] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    
    // Live navigation state
    const [isNavigating, setIsNavigating] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [remainingDistance, setRemainingDistance] = useState('');
    const [isRerouting, setIsRerouting] = useState(false);
    const [trafficSegments, setTrafficSegments] = useState(null);
    
    // Active calls state
    const [activeCalls, setActiveCalls] = useState([]);
    const [allActiveCalls, setAllActiveCalls] = useState([]);
    const [callFilter, setCallFilter] = useState('all'); // 'all', 'henrico', 'chesterfield', 'richmond'
    const [isLoadingCalls, setIsLoadingCalls] = useState(false);
    const [showActiveCalls, setShowActiveCalls] = useState(true);
    const [unitName, setUnitName] = useState(localStorage.getItem('unitName') || '');
    const [showUnitSettings, setShowUnitSettings] = useState(false);
    const [showLights, setShowLights] = useState(
        localStorage.getItem('showLights') === 'true'
    );
    const [trafficAlert, setTrafficAlert] = useState(null);
    const [showRoutePreferences, setShowRoutePreferences] = useState(false);
    const [routePreferences, setRoutePreferences] = useState(() => {
        const saved = localStorage.getItem('routePreferences');
        return saved ? JSON.parse(saved) : {
            transportMode: 'driving',
            avoidFerries: false,
            avoidUnpaved: false,
            avoidHighways: false,
            preferScenic: false
        };
    });
    const [voiceEnabled, setVoiceEnabled] = useState(
        localStorage.getItem('voiceEnabled') === 'true'
    );
    const [isListening, setIsListening] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [showCallsList, setShowCallsList] = useState(false);
    
    // Live tracking state
    const [heading, setHeading] = useState(null);
    const [locationHistory, setLocationHistory] = useState([]);
    const [isLiveTracking, setIsLiveTracking] = useState(false);
    const [speed, setSpeed] = useState(0);
    const [accuracy, setAccuracy] = useState(null);
    const [smoothedLocation, setSmoothedLocation] = useState(null);
    const [isOffRoute, setIsOffRoute] = useState(false);
    const [offRouteTimer, setOffRouteTimer] = useState(null);
    
    // Kalman filter state
    const kalmanState = useRef({
        lat: null,
        lng: null,
        variance: 1000
    });
    
    // Multi-user tracking state
    const [otherUnits, setOtherUnits] = useState([]);
    const [unitStatus, setUnitStatus] = useState('Available');
    const [showStatusPanel, setShowStatusPanel] = useState(false);
    const [activeCallInfo, setActiveCallInfo] = useState(null);
    
    // Dispatch state
    const [showDispatchPanel, setShowDispatchPanel] = useState(false);
    const [selectedCallForDispatch, setSelectedCallForDispatch] = useState(null);
    const [showCallDetail, setShowCallDetail] = useState(false);
    const [selectedCall, setSelectedCall] = useState(null);
    const [showCallSidebar, setShowCallSidebar] = useState(false);
    const [mapCenter, setMapCenter] = useState(null);
    const [pendingCallNotification, setPendingCallNotification] = useState(null);
    const lastCheckedCallIdRef = useRef(null);
    
    // Layer filter state
    const [showLayerFilters, setShowLayerFilters] = useState(false);
    const [jurisdictionFilters, setJurisdictionFilters] = useState({
        richmondBeat: 'all',
        henricoDistrict: 'all',
        chesterfieldDistrict: 'all',
        baseMapType: 'street',
        searchAddress: '',
        showPoliceStations: true
    });
    const [searchPin, setSearchPin] = useState(null);
    
    const locationWatchId = useRef(null);
    const rerouteCheckInterval = useRef(null);
    const callsRefreshInterval = useRef(null);
    const unitsRefreshInterval = useRef(null);
    const lastPosition = useRef(null);
    const lastAnnouncedStep = useRef(-1);
    
    const { speak, stop: stopSpeech } = useVoiceGuidance(voiceEnabled);
    const { startListening, stopListening } = useVoiceCommand((transcript) => {
        setIsListening(false);
        toast.info(`Heard: "${transcript}"`);
        searchDestination(transcript);
    });

    // Monitor online/offline status
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            toast.success('Back online');
        };
        const handleOffline = () => {
            setIsOnline(false);
            toast.error('No internet connection - using offline mode');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const init = async () => {
            await loadCurrentUser();
            // Get location immediately and forcefully
            if (navigator.geolocation) {
                toast.info('Getting your location...');
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const coords = [position.coords.latitude, position.coords.longitude];
                        console.log('📍 Initial location:', coords);
                        setCurrentLocation(coords);
                        setIsLocating(false);
                        toast.success('Location ready');
                        
                        // Start live tracking after initial location
                        if (isOnline) {
                            startContinuousTracking();
                        }
                    },
                    (error) => {
                        console.error('Location error:', error);
                        toast.error('Please enable location services');
                        setIsLocating(false);
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }
            fetchActiveCalls();
        };
        init();
        
        // Refresh active calls every 60 seconds for real-time updates (silent mode)
        callsRefreshInterval.current = setInterval(() => {
            if (isOnline) {
                fetchActiveCalls(true); // Silent refresh
            }
        }, 60000);
        

        
        return () => {
            stopContinuousTracking();
            if (rerouteCheckInterval.current) {
                clearInterval(rerouteCheckInterval.current);
            }
            if (callsRefreshInterval.current) {
                clearInterval(callsRefreshInterval.current);
            }

        };
    }, []);

    // Toggle tracking when online status changes
    useEffect(() => {
        if (isOnline && !isLiveTracking) {
            startContinuousTracking();
        } else if (!isOnline && isLiveTracking) {
            stopContinuousTracking();
        }
    }, [isOnline]);

    // Initialize user location when user and location are ready
    useEffect(() => {
        if (currentUser && currentLocation) {
            updateUserLocation();
        }
    }, [currentUser, currentLocation, heading, speed, unitStatus, showLights, activeCallInfo]);

    // Fetch other units on mount and then every 10 seconds for real-time tracking
    useEffect(() => {
        if (currentUser) {
            fetchOtherUnits();
            const interval = setInterval(fetchOtherUnits, 10000);
            return () => clearInterval(interval);
        }
    }, [currentUser]);

    // Check for new dispatch calls assigned to this user
    useEffect(() => {
        if (!currentUser) return;

        const checkForNewCalls = async () => {
            try {
                // Check DispatchCall entity for assigned calls
                const calls = await base44.entities.DispatchCall.list('-created_date', 50);
                
                // Filter for calls that have this user in assigned_units
                const assignedCalls = calls.filter(call => 
                    call.assigned_units && 
                    Array.isArray(call.assigned_units) && 
                    call.assigned_units.includes(currentUser.id)
                );

                if (assignedCalls && assignedCalls.length > 0) {
                    const latestCall = assignedCalls[0];
                    // Only show notification if it's a new call and has coordinates
                    if (lastCheckedCallIdRef.current !== latestCall.id && 
                        latestCall.latitude && latestCall.longitude) {
                        lastCheckedCallIdRef.current = latestCall.id;
                        console.log('📞 New call assigned:', latestCall);
                        setPendingCallNotification(latestCall);
                    }
                }
            } catch (error) {
                console.error('Error checking for new calls:', error);
            }
        };

        checkForNewCalls();
        const interval = setInterval(checkForNewCalls, 10000); // Check every 10 seconds

        return () => clearInterval(interval);
    }, [currentUser]);

    // Check for better routes periodically when navigating
    useEffect(() => {
        if (isNavigating && currentLocation && destination && isOnline) {
            rerouteCheckInterval.current = setInterval(() => {
                checkForBetterRoute();
            }, 60000); // Check every minute

            return () => {
                if (rerouteCheckInterval.current) {
                    clearInterval(rerouteCheckInterval.current);
                }
            };
        }
    }, [isNavigating, currentLocation, destination, isOnline]);

    const checkForBetterRoute = async () => {
        if (!currentLocation || !destination) return;

        try {
            const newRoutes = await fetchRoutes(currentLocation, destination.coords);
            if (newRoutes && newRoutes.length > 0) {
                const currentRoute = routes[selectedRouteIndex];
                const bestNewRoute = newRoutes[0];

                // If new route saves more than 5 minutes, suggest rerouting
                if (currentRoute.duration - bestNewRoute.duration > 300) {
                    setIsRerouting(true);
                    toast.info('Faster route found! Rerouting...');
                    
                    setTimeout(() => {
                        setRoutes(newRoutes);
                        setSelectedRouteIndex(0);
                        updateRouteDisplay(newRoutes[0]);
                        setIsRerouting(false);
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking for better route:', error);
        }
    };

    // Simplified smoothing - only apply when moving fast
    const applySmoothing = (lat, lng, accuracy, speed) => {
        // Don't smooth if stationary or accuracy is very good
        if (speed < 1 || (accuracy && accuracy < 10)) {
            kalmanState.current = { lat, lng, variance: 100 };
            return [lat, lng];
        }
        
        if (kalmanState.current.lat === null) {
            kalmanState.current = { lat, lng, variance: 100 };
            return [lat, lng];
        }
        
        // Simple weighted average
        const weight = Math.min(0.3, speed / 20); // More weight to new position when faster
        const newLat = kalmanState.current.lat * (1 - weight) + lat * weight;
        const newLng = kalmanState.current.lng * (1 - weight) + lng * weight;
        
        kalmanState.current = { lat: newLat, lng: newLng, variance: 100 };
        return [newLat, newLng];
    };
    
    // Simplified route checking
    const checkIfOffRoute = (position, routeCoordinates) => {
        if (!routeCoordinates || routeCoordinates.length === 0 || !isNavigating) return;
        
        let minDist = Infinity;
        for (let i = 0; i < routeCoordinates.length; i++) {
            const dist = getDistanceMeters(position, routeCoordinates[i]);
            if (dist < minDist) minDist = dist;
        }
        
        if (minDist > 100) {
            setIsOffRoute(true);
            toast.warning('Off route - recalculating...');
            setTimeout(() => checkForBetterRoute(), 2000);
        } else {
            setIsOffRoute(false);
        }
    };
    
    const getDistanceMeters = (coord1, coord2) => {
        const R = 6371000; // Earth radius in meters
        const lat1 = coord1[0] * Math.PI / 180;
        const lat2 = coord2[0] * Math.PI / 180;
        const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
        const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
    };
    
    // Smooth heading with easing
    const lastHeadingRef = useRef(null);
    const smoothHeading = (newHeading, currentSpeed) => {
        if (lastHeadingRef.current === null) {
            lastHeadingRef.current = newHeading;
            return newHeading;
        }
        
        // Calculate shortest angular distance
        let diff = newHeading - lastHeadingRef.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        // Easing factor (higher speed = more responsive)
        const easingFactor = currentSpeed > 10 ? 0.3 : 0.15;
        const smoothed = lastHeadingRef.current + diff * easingFactor;
        const normalized = ((smoothed % 360) + 360) % 360;
        
        lastHeadingRef.current = normalized;
        return normalized;
    };

    const startContinuousTracking = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported');
            return;
        }

        setIsLiveTracking(true);
        
        // High accuracy and frequent updates while navigating
        const updateInterval = isNavigating ? 1000 : 5000; // 1s while navigating, 5s otherwise
        const trackingOptions = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        };
        
        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const rawCoords = [position.coords.latitude, position.coords.longitude];
                const rawSpeed = position.coords.speed !== null && position.coords.speed >= 0 
                    ? Math.max(0, position.coords.speed * 2.237) 
                    : 0;

                console.log('📍 Raw GPS:', rawCoords, 'Accuracy:', position.coords.accuracy, 'm', 'Speed:', rawSpeed, 'mph');

                // Ignore impossible jumps
                if (lastPosition.current) {
                    const dist = getDistanceMeters(lastPosition.current, rawCoords);
                    const timeDiff = 1;
                    const impliedSpeed = (dist / timeDiff) * 2.237;

                    if (impliedSpeed > 150) {
                        console.warn('🚫 Ignoring GPS jump:', impliedSpeed, 'mph');
                        return;
                    }
                }

                // Only smooth when moving
                const finalCoords = rawSpeed > 5 
                    ? applySmoothing(rawCoords[0], rawCoords[1], position.coords.accuracy, rawSpeed)
                    : rawCoords;

                console.log('✅ Using location:', finalCoords);
                setCurrentLocation(finalCoords);
                setSmoothedLocation(finalCoords);
                
                // Smart heading: use GPS course when moving, compass when stationary
                let newHeading = null;
                if (rawSpeed > 3) {
                    // Use GPS course when moving > 3 mph
                    if (position.coords.heading !== null && position.coords.heading >= 0) {
                        newHeading = position.coords.heading;
                    } else if (lastPosition.current) {
                        newHeading = calculateHeading(lastPosition.current, finalCoords);
                    }
                } else {
                    // Use compass heading when stationary/slow
                    if (position.coords.heading !== null && position.coords.heading >= 0) {
                        newHeading = position.coords.heading;
                    }
                }
                
                if (newHeading !== null && !isNaN(newHeading)) {
                    const smoothed = smoothHeading(newHeading, rawSpeed);
                    setHeading(smoothed);
                }

                setSpeed(rawSpeed);
                setAccuracy(position.coords.accuracy);
                
                // Show accuracy warning
                if (position.coords.accuracy > 50) {
                    console.warn('⚠️ Low GPS accuracy:', position.coords.accuracy, 'm');
                }

                // Add to location history
                setLocationHistory(prev => {
                    const newHistory = [...prev, finalCoords];
                    return newHistory.slice(-30);
                });

                lastPosition.current = finalCoords;

                // Check if off route
                if (isNavigating && routeCoords) {
                    checkIfOffRoute(finalCoords, routeCoords);
                }

                // Update navigation progress if navigating
                if (isNavigating && directions) {
                    updateNavigationProgress(finalCoords);
                }
            },
            (error) => {
                console.error('Error tracking location:', error);
                if (error.code === error.PERMISSION_DENIED) {
                    toast.error('Location permission denied');
                    setIsLiveTracking(false);
                }
            },
            trackingOptions
        );
    };

    const stopContinuousTracking = () => {
        if (locationWatchId.current) {
            navigator.geolocation.clearWatch(locationWatchId.current);
            locationWatchId.current = null;
        }
        setIsLiveTracking(false);
    };

    const loadCurrentUser = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Load user's saved status
            if (user.status) {
                setUnitStatus(user.status);
            }
            if (user.current_call_info) {
                setActiveCallInfo(user.current_call_info);
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
    };

    const lastLocationUpdateRef = useRef(0);

    const updateUserLocation = async () => {
        if (!currentUser || !currentLocation) return;

        // Throttle updates to once every 5 seconds
        const now = Date.now();
        if (now - lastLocationUpdateRef.current < 5000) return;
        lastLocationUpdateRef.current = now;

        try {
            const updateData = {
                latitude: currentLocation[0],
                longitude: currentLocation[1],
                heading: heading || 0,
                speed: speed || 0,
                status: unitStatus,
                show_lights: showLights,
                current_call_info: activeCallInfo,
                last_updated: new Date().toISOString()
            };

            console.log('📍 Updating location:', updateData);
            await base44.auth.updateMe(updateData);
        } catch (error) {
            console.error('Error updating user location:', error);
        }
    };

    const fetchOtherUnits = async () => {
        if (!currentUser) return;
        
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const users = response.data?.users || [];
            
            const activeUsers = users.filter(user => {
                if (user.id === currentUser.id) return false;
                
                // Check show_on_map flag - hide if explicitly set to false
                if (user.show_on_map === false) {
                    console.log('🚫 Hiding user from map:', user.unit_number || user.full_name);
                    return false;
                }
                
                // Hide users who are Out of Service
                if (user.status === 'Out of Service') {
                    console.log('🚫 Hiding Out of Service unit:', user.unit_number || user.full_name);
                    return false;
                }
                
                const hasLocation = user.latitude && user.longitude && 
                                  !isNaN(user.latitude) && !isNaN(user.longitude) &&
                                  user.latitude !== 0 && user.longitude !== 0;
                
                return hasLocation;
            });
            
            console.log('🗺️ Other units on map:', activeUsers.length);
            setOtherUnits(activeUsers);
        } catch (error) {
            console.error('❌ Error fetching other units:', error);
        }
    };

    const calculateHeading = (from, to) => {
        const lat1 = from[0] * Math.PI / 180;
        const lat2 = to[0] * Math.PI / 180;
        const dLon = (to[1] - from[1]) * Math.PI / 180;
        
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        
        let heading = Math.atan2(y, x) * 180 / Math.PI;
        // Normalize to 0-360
        heading = (heading + 360) % 360;
        
        return Math.round(heading);
    };

    const getCurrentLocation = useCallback(() => {
        setIsLocating(true);

        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            setIsLocating(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = [position.coords.latitude, position.coords.longitude];
                console.log('📍 Got location:', coords, 'Accuracy:', position.coords.accuracy, 'm');
                setCurrentLocation(coords);
                setIsLocating(false);

                // Only show accuracy if it's reasonable
                if (position.coords.accuracy < 100) {
                    toast.success(`Location found (±${Math.round(position.coords.accuracy)}m accuracy)`);
                } else {
                    toast.warning(`Location found but low accuracy (±${Math.round(position.coords.accuracy)}m). Enable high accuracy in settings.`);
                }
            },
            (error) => {
                console.error('Error getting location:', error);
                if (error.code === error.PERMISSION_DENIED) {
                    toast.error('Location permission denied. Enable location in browser settings.');
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    toast.error('Location unavailable. Check GPS/location services.');
                } else {
                    toast.error('Unable to get your location');
                }
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }, []);



    const updateNavigationProgress = (coords) => {
        if (!directions || currentStepIndex >= directions.length - 1) {
            // Arrived at destination
            setIsNavigating(false);
            if (voiceEnabled) {
                speak('You have arrived at your destination');
            }
            toast.success('You have arrived at your destination!');
            handleStatusChange('On Scene');
            return;
        }

        // Calculate distance to next maneuver
        if (routeCoords && routeCoords.length > 0) {
            // Find closest point on route
            let minDist = Infinity;
            let closestIndex = 0;
            
            for (let i = 0; i < routeCoords.length; i++) {
                const dist = getDistanceMeters(coords, routeCoords[i]);
                if (dist < minDist) {
                    minDist = dist;
                    closestIndex = i;
                }
            }
            
            // Calculate remaining distance
            let remainingDist = 0;
            for (let i = closestIndex; i < routeCoords.length - 1; i++) {
                remainingDist += getDistanceMeters(routeCoords[i], routeCoords[i + 1]);
            }
            
            const remainingMiles = (remainingDist / 1609.34).toFixed(1);
            setRemainingDistance(`${remainingMiles} mi`);
            
            // Auto-advance to next step when close enough
            // Simplified: advance every ~500m of progress
            const stepProgress = Math.floor(closestIndex / (routeCoords.length / directions.length));
            if (stepProgress > currentStepIndex && stepProgress < directions.length) {
                setCurrentStepIndex(stepProgress);
                
                // Voice announcement for new step
                if (voiceEnabled && stepProgress !== lastAnnouncedStep.current) {
                    const newStep = directions[stepProgress];
                    if (newStep) {
                        speak(`In ${newStep.distance}, ${newStep.instruction}`);
                        lastAnnouncedStep.current = stepProgress;
                    }
                }
            }
        }
    };

    const searchDestination = async (query) => {
        if (!currentLocation) {
            toast.error('Please wait for your location first');
            getCurrentLocation();
            return;
        }

        setIsSearching(true);
        console.log('🔍 Searching for:', query);
        
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
                { headers: { 'User-Agent': 'Emergency-Dispatch-CAD/1.0' } }
            );
            const data = await response.json();
            console.log('📦 Search results:', data);

            if (data && data.length > 0) {
                const result = data[0];
                const destCoords = [parseFloat(result.lat), parseFloat(result.lon)];
                
                console.log('📍 From:', currentLocation, 'To:', destCoords);
                
                setDestination({ coords: destCoords, name: result.display_name });
                setDestinationName(result.display_name.split(',')[0]);
                toast.info('Calculating route...');

                const fetchedRoutes = await fetchRoutes(currentLocation, destCoords);
                console.log('🗺️ Routes received:', fetchedRoutes);
                
                if (fetchedRoutes && fetchedRoutes.length > 0) {
                    setRoutes(fetchedRoutes);
                    setSelectedRouteIndex(0);
                    updateRouteDisplay(fetchedRoutes[0]);
                    toast.success(`Route ready: ${distance || 'calculating...'}`);
                } else {
                    toast.error('Could not calculate route');
                }
            } else {
                toast.error('Location not found');
            }
        } catch (error) {
            console.error('❌ Search error:', error);
            toast.error('Search failed: ' + error.message);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchRoutes = async (start, end) => {
        try {
            if (!start || !end || start.length !== 2 || end.length !== 2) {
                console.error('❌ Invalid coordinates:', { start, end });
                toast.error('Invalid coordinates');
                return null;
            }

            console.log('🛣️ Calculating route from', start, 'to', end);
            
            const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=2&overview=full&geometries=geojson&steps=true`;
            console.log('🌐 URL:', url);

            const response = await fetch(url);
            const data = await response.json();
            console.log('📦 OSRM Response:', data);

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                console.log('✅ Success:', data.routes.length, 'routes found');
                console.log('📏 First route distance:', (data.routes[0].distance / 1609.34).toFixed(1), 'mi');
                console.log('⏱️ First route duration:', Math.round(data.routes[0].duration / 60), 'min');
                return data.routes.map((route) => ({
                    ...route,
                    hasTraffic: Math.random() > 0.5
                }));
            } else {
                console.error('❌ Routing failed:', data.message || data.code);
                toast.error('Routing error: ' + (data.message || data.code));
                return null;
            }
        } catch (error) {
            console.error('❌ Fetch error:', error);
            toast.error('Network error: ' + error.message);
            return null;
        }
    };

    const updateRouteDisplay = (routeData) => {
        console.log('📋 Updating route display with:', routeData);
        
        if (!routeData || !routeData.geometry || !routeData.legs || !routeData.legs[0]) {
            console.error('❌ Invalid route data:', routeData);
            toast.error('Invalid route data received');
            return;
        }

        const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        console.log('📍 Route has', coordinates.length, 'points');

        // Generate traffic data
        const traffic = generateTrafficData(coordinates);
        setTrafficSegments(traffic);

        // Calculate distance and duration
        const distanceMiles = (routeData.distance / 1609.34).toFixed(1);
        setDistance(`${distanceMiles} mi`);

        const baseDurationMins = Math.round(routeData.duration / 60);
        const now = new Date();
        const etaTime = new Date(now.getTime() + baseDurationMins * 60000);
        const etaFormatted = etaTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        if (baseDurationMins >= 60) {
            const hours = Math.floor(baseDurationMins / 60);
            const mins = baseDurationMins % 60;
            setDuration(`${hours}h ${mins}m (ETA ${etaFormatted})`);
        } else {
            setDuration(`${baseDurationMins} min (ETA ${etaFormatted})`);
        }

        // Generate turn-by-turn directions
        const steps = routeData.legs[0].steps.map((step, idx) => {
            const maneuver = step.maneuver || {};
            const streetName = step.name || '';
            const type = maneuver.type || '';
            const modifier = maneuver.modifier || '';

            let instruction = '';
            
            if (type === 'depart') {
                instruction = streetName ? `Head ${modifier || 'forward'} on ${streetName}` : 'Start your journey';
            } else if (type === 'arrive') {
                instruction = 'Arrive at your destination';
            } else if (type === 'turn') {
                instruction = streetName ? `Turn ${modifier} onto ${streetName}` : `Turn ${modifier}`;
            } else if (type === 'merge' || type === 'on ramp') {
                instruction = streetName ? `Merge onto ${streetName}` : 'Merge';
            } else if (type === 'off ramp') {
                instruction = streetName ? `Take exit onto ${streetName}` : 'Take exit';
            } else if (type === 'continue' || type === 'new name') {
                instruction = streetName ? `Continue on ${streetName}` : 'Continue straight';
            } else {
                instruction = maneuver.instruction || `Continue for ${Math.round(step.distance * 3.281)} ft`;
            }

            const distText = step.distance > 1000 
                ? `${(step.distance / 1609.34).toFixed(1)} mi` 
                : `${Math.round(step.distance * 3.281)} ft`;

            console.log(`Step ${idx}: ${instruction} - ${distText}`);

            return { instruction, distance: distText };
        });

        console.log('✅ Generated', steps.length, 'direction steps');
        setDirections(steps);
        
        if (steps.length > 0) {
            toast.success(`Route ready: ${distanceMiles} mi, ${baseDurationMins} min`);
        } else {
            toast.error('No directions generated');
        }
    };

    const handleSelectRoute = (index) => {
        setSelectedRouteIndex(index);
        updateRouteDisplay(routes[index]);
    };

    const startNavigation = () => {
        if (!directions || directions.length === 0) {
            toast.error('No directions available');
            console.error('❌ Cannot start - no directions');
            return;
        }
        
        console.log('🚀 Starting navigation');
        console.log('📍 Current:', currentLocation);
        console.log('🎯 Destination:', destination);
        console.log('📋 Steps:', directions.length);
        
        setIsNavigating(true);
        setCurrentStepIndex(0);
        setRemainingDistance(distance);
        lastAnnouncedStep.current = -1;
        
        if (routes && routes[selectedRouteIndex]?.hasTraffic) {
            setTrafficAlert({
                message: 'Moderate traffic detected ahead',
                canReroute: routes.length > 1
            });
            if (voiceEnabled) {
                speak('Warning: moderate traffic detected on your route');
            }
        }
        
        if (voiceEnabled && directions && directions.length > 0) {
            speak(`Starting navigation to ${destinationName}. ${directions[0].instruction}`);
        }
        toast.success('Navigation started - Follow the route');
    };

    const exitNavigation = () => {
        setIsNavigating(false);
        setTrafficAlert(null);
        stopSpeech();
        if (rerouteCheckInterval.current) {
            clearInterval(rerouteCheckInterval.current);
        }
    };

    const handleAutoReroute = () => {
        if (routes && routes.length > 1) {
            // Find alternative route without traffic
            const alternativeIndex = routes.findIndex((r, i) => i !== selectedRouteIndex && !r.hasTraffic);
            if (alternativeIndex !== -1) {
                handleSelectRoute(alternativeIndex);
                setTrafficAlert(null);
                toast.success('Rerouting to avoid traffic');
                if (voiceEnabled) {
                    speak('Rerouting to avoid traffic');
                }
            }
        }
    };

    const formatManeuver = (maneuver) => {
        const type = maneuver.type;
        const modifier = maneuver.modifier;
        
        if (type === 'depart') return 'Start your journey';
        if (type === 'arrive') return 'You have arrived';
        if (type === 'turn') return `Turn ${modifier}`;
        if (type === 'continue') return 'Continue straight';
        
        return `${type} ${modifier || ''}`.trim();
    };

    const handleSaveUnitName = async (name) => {
        setUnitName(name);
        localStorage.setItem('unitName', name);
        
        // Update user with unit number
        if (currentUser) {
            try {
                await base44.auth.updateMe({ unit_number: name });
                toast.success('Unit number saved');
            } catch (error) {
                console.error('Error saving unit number:', error);
            }
        }
    };

    const handleStatusChange = async (newStatus, eta = null) => {
        setUnitStatus(newStatus);
        if (currentUser) {
            try {
                const updateData = { 
                    status: newStatus,
                    last_updated: new Date().toISOString()
                };
                if (eta) {
                    updateData.estimated_return = new Date(eta).toISOString();
                }
                console.log('🔄 Updating status to:', newStatus);
                await base44.auth.updateMe(updateData);
                toast.success(`Status: ${newStatus}`);
                
                // Immediately update location to reflect new status
                await updateUserLocation();
            } catch (error) {
                console.error('Error updating status:', error);
                toast.error('Failed to update status');
            }
        }
    };

    const handleEnrouteToCall = async (call) => {
        if (!call.latitude || !call.longitude || isNaN(call.latitude) || isNaN(call.longitude)) {
            toast.error('Call location not available for navigation');
            return;
        }

        const callInfo = `${call.incident} - ${call.location}`;
        const callId = call.id || `${call.timeReceived}-${call.incident}`;

        // Update user status if logged in
        if (currentUser) {
            setActiveCallInfo(callInfo);
            setUnitStatus('Enroute');

            try {
                await base44.auth.updateMe({
                    status: 'Enroute',
                    current_call_id: callId,
                    current_call_info: callInfo,
                    last_updated: new Date().toISOString()
                });
                toast.success(`Enroute to ${call.incident}`);
            } catch (error) {
                console.error('Error updating user status:', error);
            }
        } else {
            toast.info(`Navigating to ${call.incident}`);
        }

        // Automatically route to call
        const callCoords = [call.latitude, call.longitude];
        setDestination({ coords: callCoords, name: call.location });
        setDestinationName(call.incident);

        if (currentLocation) {
            const fetchedRoutes = await fetchRoutes(currentLocation, callCoords);
            if (fetchedRoutes && fetchedRoutes.length > 0) {
                setRoutes(fetchedRoutes);
                setSelectedRouteIndex(0);
                updateRouteDisplay(fetchedRoutes[0]);
            }
        }
    };

    const handleAcceptCall = async (call) => {
        setPendingCallNotification(null);
        
        // Ensure call has proper coordinates
        if (!call.latitude || !call.longitude) {
            toast.error('Call location not available');
            return;
        }
        
        await handleEnrouteToCall(call);
    };

    const handleDismissNotification = () => {
        setPendingCallNotification(null);
    };

    const handleAssignUnit = async (call, unit) => {
        toast.success(`${unit.unit_name} assigned to ${call.incident}`);
        // In a real system, this would notify the assigned unit
    };

    const handleLightsChange = (enabled) => {
        setShowLights(enabled);
        localStorage.setItem('showLights', enabled);
    };

    const handleSaveRoutePreferences = (prefs) => {
        setRoutePreferences(prefs);
        localStorage.setItem('routePreferences', JSON.stringify(prefs));
    };

    const handleVoiceCommand = () => {
        setIsListening(true);
        const success = startListening();
        if (!success) {
            toast.error('Voice commands not supported in this browser');
            setIsListening(false);
        } else {
            toast.info('Listening... Say a destination');
        }
    };

    const applyCallFilter = (calls, filter) => {
        console.log(`🔍 Applying filter: ${filter} to ${calls.length} calls`);
        
        let filtered = calls;
        
        if (filter === 'richmond') {
            filtered = calls.filter(call => call.agency?.includes('RPD') || call.agency?.includes('RFD') || call.agency?.includes('BPS'));
        } else if (filter === 'henrico') {
            filtered = calls.filter(call => call.agency?.includes('HPD') || call.agency?.includes('HCPD') || call.agency?.includes('Henrico'));
        } else if (filter === 'chesterfield') {
            filtered = calls.filter(call => call.agency?.includes('CCPD') || call.agency?.includes('CCFD') || call.agency?.includes('Chesterfield'));
        }
        // else filter === 'all', show all calls without filtering
        
        console.log(`✅ Filter result: ${filtered.length} calls`);
        setActiveCalls(filtered);
    };

    const cycleCallFilter = () => {
        const filters = ['all', 'richmond', 'henrico', 'chesterfield'];
        const currentIndex = filters.indexOf(callFilter);
        const nextFilter = filters[(currentIndex + 1) % filters.length];
        setCallFilter(nextFilter);
        applyCallFilter(allActiveCalls, nextFilter);

        const filterNames = { all: 'All Areas', richmond: 'Richmond', henrico: 'Henrico', chesterfield: 'Chesterfield' };
        toast.info(`Showing calls: ${filterNames[nextFilter]}`);
        };

        const handleLayerFilterChange = async (newFilters) => {
        setJurisdictionFilters(newFilters);

        // Handle address search if provided - just drop a pin, don't navigate
        if (newFilters.searchAddress && newFilters.searchAddress !== jurisdictionFilters.searchAddress) {
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newFilters.searchAddress)}&limit=1`
                );
                const data = await response.json();

                if (data && data.length > 0) {
                    const result = data[0];
                    const coords = [parseFloat(result.lat), parseFloat(result.lon)];
                    
                    // Just center the map on the location and drop a pin with loading state
                    setMapCenter(coords);
                    setSearchPin({ coords, address: result.display_name, propertyInfo: 'Loading property information...' });
                    toast.success(`Found: ${result.display_name.split(',')[0]}`);
                    
                    // Get property info using AI
                    try {
                        const propertyInfo = await base44.integrations.Core.InvokeLLM({
                            prompt: `I need property ownership information for: ${result.display_name}

Search public records, county assessor databases, and real estate listings to find:
1. Current property owner name(s)
2. Property value/assessed value
3. Year built
4. Property type (residential, commercial, etc.)
5. Last sale date and price if available

Format the response as a concise bullet list. If information is not available, say "Information not found" for that item.`,
                            add_context_from_internet: true
                        });
                        
                        if (propertyInfo) {
                            setSearchPin({ coords, address: result.display_name, propertyInfo });
                        } else {
                            setSearchPin({ coords, address: result.display_name, propertyInfo: 'Property information not available' });
                        }
                    } catch (error) {
                        console.error('Error getting property info:', error);
                        setSearchPin({ coords, address: result.display_name, propertyInfo: 'Error loading property information' });
                    }
                } else {
                    toast.error('Address not found');
                }
            } catch (error) {
                console.error('Error searching address:', error);
                toast.error('Failed to search address');
            }
        }
    };

    const fetchActiveCalls = async (silent = false) => {
        if (!isOnline) {
            if (!silent) toast.error('Cannot fetch calls while offline');
            return;
        }

        setIsLoadingCalls(true);
        try {
            console.log('🔄 Fetching ALL active calls...');

            const response = await base44.functions.invoke('fetchAllActiveCalls', {});

            console.log('📦 Full Response:', response.data);

            if (response.data && response.data.success) {
                const allCalls = response.data.geocodedCalls || [];

                // Filter out calls older than 30 minutes
                const now = new Date();
                const filteredCalls = allCalls.filter(call => {
                    if (!call.timeReceived) return true; // Keep if no timestamp

                    // Parse time format like "12:45 PM" or "01:30 AM"
                    const timeStr = call.timeReceived.trim();
                    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

                    if (!timeMatch) return true; // Keep if can't parse

                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const isPM = timeMatch[3].toUpperCase() === 'PM';

                    // Convert to 24-hour format
                    let hours24 = hours;
                    if (isPM && hours !== 12) hours24 = hours + 12;
                    if (!isPM && hours === 12) hours24 = 0;

                    // Create date for today with parsed time
                    const callTime = new Date();
                    callTime.setHours(hours24, minutes, 0, 0);

                    // If call time is in the future, it's from yesterday
                    if (callTime > now) {
                        callTime.setDate(callTime.getDate() - 1);
                    }

                    const ageMinutes = (now - callTime) / 1000 / 60;
                    return ageMinutes <= 30;
                });

                console.log(`✅ Loaded ${filteredCalls.length} calls (${allCalls.length - filteredCalls.length} filtered as old)`);
                if (filteredCalls.length > 0) {
                    console.log('📊 Sample call:', filteredCalls[0]);
                    console.log('📍 Calls with coordinates:', filteredCalls.filter(c => c.latitude && c.longitude).length);
                }

                // Always set to true to show calls layer
                setShowActiveCalls(true);
                setAllActiveCalls(filteredCalls);
                applyCallFilter(filteredCalls, callFilter);

                if (allCalls.length > 0 && !silent) {
                    toast.success(`Loaded ${allCalls.length} active calls`);
                } else if (!silent) {
                    toast.warning(`Found ${response.data.totalCalls} calls but none could be geocoded`);
                }
            } else {
                const errorMsg = response.data?.error || 'Failed to load active calls';
                console.error('❌ Failed:', errorMsg);
                if (!silent) toast.error(errorMsg);
            }
        } catch (error) {
            console.error('❌ Error fetching active calls:', error);
            if (!silent) toast.error(`Error: ${error.message}`);
        } finally {
            setIsLoadingCalls(false);
        }
    };

    const clearRoute = () => {
        setDestination(null);
        setRoutes(null);
        setDirections(null);
        setTrafficSegments(null);
        setDistance('');
        setDuration('');
        setDestinationName('');
        setIsNavigating(false);
        setCurrentStepIndex(0);
    };

    const selectedRoute = routes && routes[selectedRouteIndex];
    const routeCoords = selectedRoute 
        ? selectedRoute.geometry.coordinates.map(coord => [coord[1], coord[0]])
        : null;

    return (
        <div className="h-screen w-screen relative overflow-hidden bg-[#F5F5F7] pointer-events-none">
            <div className="pointer-events-auto w-full h-full">
                <MapView
                    currentLocation={currentLocation}
                    destination={destination}
                    route={routeCoords}
                    trafficSegments={trafficSegments}
                    useOfflineTiles={!isOnline}
                    activeCalls={activeCalls}
                    heading={heading}
                    locationHistory={isLiveTracking ? locationHistory : []}
                    unitName={unitName || currentUser?.unit_number}
                    showLights={showLights}
                    otherUnits={otherUnits}
                    currentUserId={currentUser?.id}
                    speed={speed}
                    mapCenter={mapCenter}
                    isNavigating={isNavigating}
                    baseMapType={jurisdictionFilters.baseMapType}
                    jurisdictionFilters={jurisdictionFilters}
                    showPoliceStations={jurisdictionFilters.showPoliceStations}
                    searchPin={searchPin}
                    onCallClick={(call) => {
                        setSelectedCall(call);
                        setShowCallSidebar(true);
                    }}
                    onNavigateToJail={async (jail) => {
                        setDestination({ coords: jail.coords, name: jail.name });
                        setDestinationName(jail.name);
                        
                        if (currentLocation) {
                            const fetchedRoutes = await fetchRoutes(currentLocation, jail.coords);
                            if (fetchedRoutes && fetchedRoutes.length > 0) {
                                setRoutes(fetchedRoutes);
                                setSelectedRouteIndex(0);
                                updateRouteDisplay(fetchedRoutes[0]);
                            }
                        }
                    }}
                />
            </div>

            {/* Traffic Alert */}
            <AnimatePresence>
                {trafficAlert && isNavigating && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute top-20 left-4 right-4 z-[999] md:left-1/2 md:-translate-x-1/2 md:w-[480px]"
                    >
                        <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-lg">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-semibold text-sm">{trafficAlert.message}</p>
                                    {trafficAlert.canReroute && (
                                        <Button
                                            onClick={handleAutoReroute}
                                            size="sm"
                                            className="mt-2 bg-white text-amber-600 hover:bg-gray-100"
                                        >
                                            Auto-Reroute
                                        </Button>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setTrafficAlert(null)}
                                    className="text-white hover:bg-white/20"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick Status Buttons */}
            {!isNavigating && (
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute top-1/2 -translate-y-1/2 left-2 z-[1002] flex flex-col gap-1.5 pointer-events-auto"
                >
                    <Button onClick={() => handleStatusChange('Available')} size="sm" className={`${unitStatus === 'Available' ? 'bg-green-600 hover:bg-green-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg`}>
                        <CheckCircle2 className={`w-4 h-4 ${unitStatus === 'Available' ? 'text-white' : 'text-green-600'}`} />
                        <span className={`text-[8px] font-semibold ${unitStatus === 'Available' ? 'text-white' : 'text-gray-700'}`}>Avail</span>
                    </Button>
                    <Button onClick={() => setShowCallsList(true)} size="sm" className={`${unitStatus === 'Enroute' ? 'bg-red-600 hover:bg-red-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg`}>
                        <NavigationIcon className={`w-4 h-4 ${unitStatus === 'Enroute' ? 'text-white' : 'text-red-600'}`} />
                        <span className={`text-[8px] font-semibold ${unitStatus === 'Enroute' ? 'text-white' : 'text-gray-700'}`}>Route</span>
                    </Button>
                    <Button onClick={() => handleStatusChange('On Scene')} size="sm" className={`${unitStatus === 'On Scene' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg`}>
                        <MapPin className={`w-4 h-4 ${unitStatus === 'On Scene' ? 'text-white' : 'text-blue-600'}`} />
                        <span className={`text-[8px] font-semibold ${unitStatus === 'On Scene' ? 'text-white' : 'text-gray-700'}`}>Scene</span>
                    </Button>
                    <Button onClick={() => handleStatusChange('On Patrol')} size="sm" className={`${unitStatus === 'On Patrol' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg`}>
                        <Car className={`w-4 h-4 ${unitStatus === 'On Patrol' ? 'text-white' : 'text-indigo-600'}`} />
                        <span className={`text-[8px] font-semibold ${unitStatus === 'On Patrol' ? 'text-white' : 'text-gray-700'}`}>Patrol</span>
                    </Button>
                    <Button onClick={() => setShowStatusPanel(true)} size="sm" className="bg-white/95 hover:bg-white shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg">
                        <Settings className="w-4 h-4 text-gray-600" />
                        <span className="text-[8px] font-semibold text-gray-700">More</span>
                    </Button>
                </motion.div>
            )}

            {/* Online/Offline Indicator & Live Tracking Status */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-2 md:top-4 left-2 md:left-4 z-[999] flex flex-col gap-1.5 md:gap-2"
            >
                <div className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full flex items-center gap-1.5 md:gap-2 ${
                    isOnline 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-amber-100 text-amber-700'
                }`}>
                    {isOnline ? (
                        <>
                            <Wifi className="w-3 h-3" />
                            <span className="text-[10px] md:text-xs font-medium">Online</span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="w-3 h-3" />
                            <span className="text-[10px] md:text-xs font-medium">Offline</span>
                        </>
                    )}
                </div>
                
                {isLiveTracking && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full flex items-center gap-2"
                    >
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium">Live Tracking</span>
                    </motion.div>
                )}
                
                {accuracy && accuracy > 50 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full flex items-center gap-2"
                    >
                        <MapPinOff className="w-3 h-3" />
                        <span className="text-xs font-medium">Low GPS</span>
                    </motion.div>
                )}
                
                {isOffRoute && isNavigating && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full flex items-center gap-2"
                    >
                        <AlertCircle className="w-3 h-3 animate-pulse" />
                        <span className="text-xs font-medium">Off Route</span>
                    </motion.div>
                )}
                
                {speed > 0 && isLiveTracking && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/95 backdrop-blur-xl shadow-md px-3 py-1.5 rounded-full"
                    >
                        <span className="text-xs font-semibold text-gray-700">
                            {Math.round(speed)} mph
                        </span>
                    </motion.div>
                )}
            </motion.div>

            {/* Offline Maps Button */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-2 right-2 z-[1002] flex flex-col gap-1.5 pointer-events-auto"
            >
                <Button
                    onClick={() => setShowOfflineManager(true)}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-white/98 backdrop-blur-2xl shadow-lg border border-gray-200/50 hover:bg-white text-[#007AFF]"
                >
                    <MapIcon className="w-4 h-4" />
                </Button>

                <Button
                    onClick={() => {
                        const newState = !showActiveCalls;
                        setShowActiveCalls(newState);
                        if (newState && activeCalls.length === 0) {
                            fetchActiveCalls();
                        }
                        toast.success(newState ? 'Active calls visible' : 'Active calls hidden');
                    }}
                    size="sm"
                    className={`${showActiveCalls ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-400 hover:bg-gray-500'} text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg flex items-center gap-1`}
                >
                    <Radio className="w-3 h-3" />
                    <span>{showActiveCalls ? 'ON' : 'OFF'}</span>
                </Button>

                <Button
                    onClick={() => fetchActiveCalls(false)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg"
                    disabled={isLoadingCalls}
                >
                    <NavigationIcon className={`w-3 h-3 ${isLoadingCalls ? 'animate-spin' : ''}`} />
                </Button>

                <Button
                    onClick={cycleCallFilter}
                    size="sm"
                    className="bg-red-500 hover:bg-red-600 text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg"
                    disabled={isLoadingCalls}
                >
                    <Shield className="w-3 h-3" />
                </Button>

                {activeCalls.length > 0 && showActiveCalls && (
                    <Button
                        onClick={() => setShowCallsList(true)}
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white text-[9px] px-2 py-1.5 rounded-lg shadow-lg"
                    >
                        ({activeCalls.length})
                    </Button>
                )}

                {(currentUser?.role === 'admin' || currentUser?.dispatch_role) && (
                    <Button
                        onClick={() => window.location.href = '/dispatchcenter'}
                        size="icon"
                        className="h-8 w-8 rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
                        title="Dispatch Center"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                )}

                {currentUser?.role === 'admin' && (
                    <Button
                        onClick={() => window.location.href = '/adminportal'}
                        size="icon"
                        className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-900 text-white shadow-lg"
                        title="Admin Portal"
                    >
                        <Shield className="w-4 h-4" />
                    </Button>
                )}

                <Button
                    onClick={() => window.location.href = '/callhistory'}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
                    title="Call History"
                >
                    <Radio className="w-4 h-4" />
                </Button>

                <Button
                    onClick={() => setShowLayerFilters(true)}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
                    title="Layer Filters & Search"
                >
                    <Filter className="w-4 h-4" />
                </Button>

                <Button
                    onClick={() => setShowRoutePreferences(true)}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-white/95 backdrop-blur-xl shadow-lg border-white/20 hover:bg-white text-gray-600"
                >
                    <Settings className="w-4 h-4" />
                </Button>

                <Button
                    onClick={() => {
                        const newState = !voiceEnabled;
                        setVoiceEnabled(newState);
                        localStorage.setItem('voiceEnabled', newState);
                        toast.success(newState ? 'Voice guidance enabled' : 'Voice guidance disabled');
                    }}
                    size="icon"
                    className={`h-8 w-8 rounded-lg backdrop-blur-xl shadow-lg border-white/20 ${
                        voiceEnabled 
                            ? 'bg-[#007AFF] hover:bg-[#0056CC] text-white' 
                            : 'bg-white/95 hover:bg-white text-gray-600'
                    }`}
                >
                    <Volume2 className="w-4 h-4" />
                </Button>
            </motion.div>
            


            {!isNavigating && (
                <>
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-[1002] w-[400px] max-w-[calc(100vw-32px)] pointer-events-auto"
                    >
                        <SearchBarWithHistory
                            onSearch={searchDestination}
                            isSearching={isSearching}
                            onClear={clearRoute}
                        />
                    </motion.div>
                    <LocationButton
                        onClick={getCurrentLocation}
                        isLocating={isLocating}
                    />
                    
                    {/* Voice Command Button */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute bottom-52 right-4 z-[1002] pointer-events-auto"
                    >
                        <Button
                            onClick={handleVoiceCommand}
                            disabled={isListening}
                            size="icon"
                            className={`h-12 w-12 rounded-full shadow-lg ${
                                isListening 
                                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                                    : 'bg-white/95 hover:bg-white'
                            }`}
                        >
                            <Mic className={`w-5 h-5 ${isListening ? 'text-white' : 'text-[#007AFF]'}`} />
                        </Button>
                    </motion.div>
                </>
            )}

            <AnimatePresence>
                {!currentLocation && !isLocating && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute bottom-32 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] md:right-auto z-[1000] bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3"
                    >
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <p className="text-sm text-amber-700">
                            Enable location services for navigation
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {isNavigating && directions ? (
                <LiveNavigation
                    currentStep={directions[currentStepIndex]}
                    nextStep={directions[currentStepIndex + 1]}
                    remainingDistance={remainingDistance}
                    remainingTime={duration}
                    onExit={exitNavigation}
                    isRerouting={isRerouting}
                />
            ) : routes && routes.length > 1 ? (
                <RouteOptions
                    routes={routes}
                    onSelectRoute={handleSelectRoute}
                    selectedRouteIndex={selectedRouteIndex}
                />
            ) : null}

            {!isNavigating && directions && (
                <>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute bottom-[420px] left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto"
                    >
                        <Button
                            onClick={startNavigation}
                            size="lg"
                            className="bg-[#007AFF] hover:bg-[#0056CC] text-white px-8 py-6 text-xl font-bold rounded-2xl shadow-2xl animate-pulse"
                        >
                            <NavigationIcon className="w-6 h-6 mr-2" />
                            Start Navigation
                        </Button>
                    </motion.div>
                    
                    <DirectionsPanel
                        directions={directions}
                        destination={destinationName}
                        distance={distance}
                        duration={duration}
                        onClose={clearRoute}
                    />
                </>
            )}

            {showOfflineManager && (
                <OfflineMapManager
                    currentLocation={currentLocation}
                    onClose={() => setShowOfflineManager(false)}
                />
            )}

            <UnitSettings
                isOpen={showUnitSettings}
                onClose={() => setShowUnitSettings(false)}
                unitName={unitName}
                onSave={handleSaveUnitName}
                showLights={showLights}
                onLightsChange={handleLightsChange}
            />

            <RoutePreferences
                isOpen={showRoutePreferences}
                onClose={() => setShowRoutePreferences(false)}
                preferences={routePreferences}
                onSave={handleSaveRoutePreferences}
            />

            <LayerFilterPanel
                isOpen={showLayerFilters}
                onClose={() => setShowLayerFilters(false)}
                filters={jurisdictionFilters}
                onFilterChange={handleLayerFilterChange}
            />

            <ActiveCallsList
                isOpen={showCallsList}
                onClose={() => setShowCallsList(false)}
                calls={activeCalls}
                onNavigateToCall={(call) => {
                    setShowCallsList(false);
                    setSelectedCall(call);
                    setShowCallDetail(true);
                }}
            />

            {showCallDetail && selectedCall && (
                <CallDetailView
                    call={selectedCall}
                    onClose={() => {
                        setShowCallDetail(false);
                        setSelectedCall(null);
                    }}
                    onEnroute={() => {
                        handleEnrouteToCall(selectedCall);
                        setShowCallDetail(false);
                    }}
                />
            )}

            {showCallSidebar && selectedCall && (
                <CallDetailSidebar
                    call={selectedCall}
                    onClose={() => {
                        setShowCallSidebar(false);
                        setSelectedCall(null);
                    }}
                    onEnroute={() => {
                        handleEnrouteToCall(selectedCall);
                        setShowCallSidebar(false);
                    }}
                    onCenter={() => {
                        if (selectedCall.latitude && selectedCall.longitude) {
                            setMapCenter([selectedCall.latitude, selectedCall.longitude]);
                        }
                    }}
                />
            )}

            <UnitStatusPanel
                isOpen={showStatusPanel}
                onClose={() => setShowStatusPanel(false)}
                currentStatus={unitStatus}
                unitName={unitName || currentUser?.unit_number || currentUser?.full_name || 'Unknown Unit'}
                onStatusChange={handleStatusChange}
                activeCall={activeCallInfo}
                currentLocation={currentLocation}
            />

            <DispatchPanel
                isOpen={showDispatchPanel}
                onClose={() => setShowDispatchPanel(false)}
                call={selectedCallForDispatch}
                onAssignUnit={handleAssignUnit}
            />

            {/* Call Notification */}
            {pendingCallNotification && (
                <CallNotification
                    call={pendingCallNotification}
                    onAccept={handleAcceptCall}
                    onDismiss={handleDismissNotification}
                />
            )}
        </div>
    );
}