import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Map as MapIcon, Wifi, WifiOff, Radio, Car, Settings, Mic, Volume2, X, CheckCircle2, Navigation as NavigationIcon, MapPin, XCircle, Plus, Shield, Filter, MapPinOff, Users, History, Search, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import SearchBarWithHistory from '@/components/map/SearchBarWithHistory';
import DirectionsPanel from '@/components/map/DirectionsPanel';
import RouteOptions from '@/components/map/RouteOptions';
import LiveNavigation from '@/components/map/LiveNavigation';
import UnitSettings from '@/components/map/UnitSettings';
import ActiveCallsList from '@/components/map/ActiveCallsList';
import OtherUnitsLayer from '@/components/map/OtherUnitsLayer';
import UnitStatusPanel from '@/components/map/UnitStatusPanel';
import AllUnitsPanel from '@/components/map/AllUnitsPanel';
import HistoricalLogsPanel from '@/components/dispatch/HistoricalLogsPanel';
import AutoDispatchSuggestion from '@/components/map/AutoDispatchSuggestion';
import UnitGroupingPanel from '@/components/map/UnitGroupingPanel';
import DispatchPanel from '@/components/map/DispatchPanel';
import CallDetailView from '@/components/map/CallDetailView';
import CallDetailSidebar from '@/components/map/CallDetailSidebar';
import CallNotification from '@/components/dispatch/CallNotification';
import { useVoiceGuidance, useVoiceCommand } from '@/components/map/VoiceGuidance';
import { generateTrafficData } from '@/components/map/TrafficLayer';
import LayerFilterPanel from '@/components/map/LayerFilterPanel';
import AddressLookupTool from '@/components/map/AddressLookupTool';

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
    const [showAllUnitsPanel, setShowAllUnitsPanel] = useState(false);
    const [showHistoricalLogs, setShowHistoricalLogs] = useState(false);
    const [autoDispatchSuggestion, setAutoDispatchSuggestion] = useState(null);
    const [showUnitGrouping, setShowUnitGrouping] = useState(false);
    const [userPannedAway, setUserPannedAway] = useState(false);
    const [criticalAlertSound] = useState(() => {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDWH0fPTgjMGHm7A7+OZUQ4PVKbh8LFVGA5On+DvwGMbBzaE0fPReiYEI3DC7+GTUAwQWK3l7q5XFAxAnN/zv2kdBDWH0PPTgyEEI3DD7+CTUQ0RWKzl7q5ZEwtCnN/zvmgdBDWH0fPRfiYEI3DE7+CTTw0PVqfj8K9VFg1Mnt/zv2kbBDOGz/PSfyYEJHPD7t+NTA0PWK3l761ZEgxBm9/zu2MbBDKGzvLPfSUEJXfE7t6OTQ0RW7Hl7ahVFQ5NneDvvWMbBjOGzvLP');
        audio.volume = 0.8;
        return audio;
    });
    
    // Layer filter state
    const [showLayerFilters, setShowLayerFilters] = useState(false);
    const [jurisdictionFilters, setJurisdictionFilters] = useState({
        richmondBeat: 'all',
        henricoDistrict: 'all',
        chesterfieldDistrict: 'all',
        baseMapType: 'street',
        searchAddress: '',
        showPoliceStations: true,
        showFireStations: false,
        showEMS: false,
        showJails: true
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
                        setCurrentLocation(coords);
                        setIsLocating(false);
                        toast.success('Location ready');
                        
                        // Start live tracking after initial location
                        if (isOnline) {
                            startContinuousTracking();
                        }
                    },
                    (error) => {
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

    // Fetch other units on mount and then every 5 seconds for real-time tracking with push notifications
    useEffect(() => {
        if (currentUser) {
            fetchOtherUnits();
            const interval = setInterval(() => {
                fetchOtherUnits(true); // Silent mode - check for status changes
            }, 5000);
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
                    if (lastCheckedCallIdRef.current !== latestCall.id && 
                    latestCall.latitude && latestCall.longitude) {
                    lastCheckedCallIdRef.current = latestCall.id;
                    setPendingCallNotification(latestCall);
                    }
                }
            } catch (error) {
                // Silent fail
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

    // Auto location update every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (!isNavigating) {
                getCurrentLocation();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [isNavigating]);

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

                // Reverse geocode to get street name (throttled)
                const now = Date.now();
                if (!window.lastStreetUpdate || now - window.lastStreetUpdate > 5000) {
                    window.lastStreetUpdate = now;
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${rawCoords[0]}&lon=${rawCoords[1]}&zoom=18`, {
                        headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' }
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.address) {
                            const street = data.address.road || data.address.street || 'Unknown Street';
                            const city = data.address.city || data.address.town || '';
                            setCurrentStreet(city ? `${street}, ${city}` : street);
                        }
                    })
                    .catch(err => {
                        console.error('Street lookup error:', err);
                        setCurrentStreet('Location unavailable');
                    });
                }

                // Ignore impossible jumps
                if (lastPosition.current) {
                    const dist = getDistanceMeters(lastPosition.current, rawCoords);
                    const timeDiff = 1;
                    const impliedSpeed = (dist / timeDiff) * 2.237;

                    if (impliedSpeed > 150) {
                        return;
                    }
                }

                // Only smooth when moving
                const finalCoords = rawSpeed > 5 
                    ? applySmoothing(rawCoords[0], rawCoords[1], position.coords.accuracy, rawSpeed)
                    : rawCoords;

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

                // Ensure speed is set correctly
                const displaySpeed = Math.max(0, Math.round(rawSpeed));
                setSpeed(displaySpeed);
                setAccuracy(position.coords.accuracy);

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
            // Silent fail
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

                await base44.auth.updateMe(updateData);
        } catch (error) {
            console.error('Error updating user location:', error);
        }
    };

    const lastUnitStatesRef = useRef({});

    const fetchOtherUnits = async (silentMode = false) => {
        if (!currentUser) return;

        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const users = response.data?.users || [];

            const activeUsers = users.filter(user => {
                if (user.id === currentUser.id) return false;

                if (user.show_on_map === false) {
                    return false;
                }

                if (user.status === 'Out of Service') {
                    return false;
                }

                const hasLocation = user.latitude && user.longitude && 
                                  !isNaN(user.latitude) && !isNaN(user.longitude) &&
                                  user.latitude !== 0 && user.longitude !== 0;

                return hasLocation;
            });

            // Check for status changes and trigger notifications
            if (silentMode) {
                activeUsers.forEach(user => {
                    const lastState = lastUnitStatesRef.current[user.id];
                    if (lastState && lastState.status !== user.status) {
                        const unitName = user.unit_number || user.full_name;
                        toast.info(`${unitName}: ${lastState.status} → ${user.status}`, {
                            duration: 3000,
                            position: 'bottom-right'
                        });
                    }
                    lastUnitStatesRef.current[user.id] = {
                        status: user.status,
                        call_info: user.current_call_info
                    };
                });
            } else {
                // Initialize on first load
                activeUsers.forEach(user => {
                    lastUnitStatesRef.current[user.id] = {
                        status: user.status,
                        call_info: user.current_call_info
                    };
                });
            }

            setOtherUnits(activeUsers);
        } catch (error) {
            // Silent fail
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
        if (!query || !query.trim()) {
            toast.error('Please enter a destination');
            return;
        }

        if (!currentLocation) {
            toast.error('Getting your location first...');
            getCurrentLocation();
            setTimeout(() => {
                if (currentLocation) searchDestination(query);
            }, 3000);
            return;
        }

        setIsSearching(true);

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Virginia, USA')}&limit=5`,
                { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } }
            );
            const data = await response.json();

            if (data && data.length > 0) {
                const result = data.find(r => r.display_name.toLowerCase().includes('virginia')) || data[0];
                const destCoords = [parseFloat(result.lat), parseFloat(result.lon)];

                setDestination({ coords: destCoords, name: result.display_name });
                setDestinationName(result.display_name.split(',')[0]);

                const fetchedRoutes = await fetchRoutes(currentLocation, destCoords);

                if (fetchedRoutes && fetchedRoutes.length > 0) {
                    setRoutes(fetchedRoutes);
                    setSelectedRouteIndex(0);
                    updateRouteDisplay(fetchedRoutes[0]);
                } else {
                    toast.error('Could not calculate route');
                }
            } else {
                toast.error('Location not found');
            }
        } catch (error) {
            toast.error('Search failed: ' + error.message);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchRoutes = async (start, end) => {
        try {
            if (!start || !end || start.length !== 2 || end.length !== 2) {
                toast.error('Invalid coordinates');
                return null;
            }

            const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=2&overview=full&geometries=geojson&steps=true`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const processedRoutes = data.routes.map((route) => ({
                    ...route,
                    hasTraffic: Math.random() > 0.5
                }));

                return processedRoutes;
            } else {
                toast.error('Routing error: ' + (data.message || data.code));
                return null;
            }
        } catch (error) {
            toast.error('Network error: ' + error.message);
            return null;
        }
    };

    const updateRouteDisplay = (routeData) => {
        if (!routeData || !routeData.geometry || !routeData.legs || !routeData.legs[0]) {
            toast.error('Invalid route data received');
            return;
        }

        const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);

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

            return { instruction, distance: distText };
        });

        setDirections(steps);

        if (steps.length > 0) {
            toast.success(`Route ready: ${distanceMiles} mi, ${baseDurationMins} min - Tap Start Navigation`);
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
            return;
        }

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
        
        if (currentUser) {
            try {
                await base44.auth.updateMe({ unit_number: name });
                toast.success('Unit number saved');
            } catch (error) {
                // Silent fail
            }
        }
    };

    const handleStatusChange = async (newStatus, eta = null) => {
        const oldStatus = unitStatus;
        setUnitStatus(newStatus);
        
        // Auto-manage lights based on status
        const shouldShowLights = newStatus === 'Enroute' || newStatus === 'On Scene' || newStatus === 'Dispatched';
        setShowLights(shouldShowLights);
        localStorage.setItem('showLights', shouldShowLights);
        
        if (currentUser) {
            try {
                const updateData = { 
                    status: newStatus,
                    show_lights: shouldShowLights,
                    last_updated: new Date().toISOString()
                };
                if (eta) {
                    updateData.estimated_return = new Date(eta).toISOString();
                }
                
                // Clear call info when going Available or OOS
                if (newStatus === 'Available' || newStatus === 'Out of Service') {
                    updateData.current_call_id = null;
                    updateData.current_call_info = null;
                    }

                    await base44.auth.updateMe(updateData);
                toast.success(`Status: ${newStatus}`);
                
                // Log status change
                await base44.entities.UnitStatusLog.create({
                    unit_id: currentUser.id,
                    unit_name: unitName || currentUser.full_name,
                    old_status: oldStatus,
                    new_status: newStatus,
                    location_lat: currentLocation?.[0],
                    location_lng: currentLocation?.[1],
                    notes: activeCallInfo
                });
                
                // Auto-update related call status
                if (currentUser.current_call_id) {
                    try {
                        const calls = await base44.entities.DispatchCall.filter({ 
                            id: currentUser.current_call_id 
                        });
                        
                        if (calls && calls.length > 0) {
                            const call = calls[0];
                            let callStatus = call.status;
                            let timeField = null;
                            
                            // Map officer status to call status
                            if (newStatus === 'Enroute' && call.status !== 'Enroute') {
                                callStatus = 'Enroute';
                                timeField = { time_enroute: new Date().toISOString() };
                            } else if (newStatus === 'On Scene' && call.status !== 'On Scene') {
                                callStatus = 'On Scene';
                                timeField = { time_on_scene: new Date().toISOString() };
                            } else if ((newStatus === 'Available' || newStatus === 'On Patrol' || newStatus === 'Out of Service') && 
                                     call.status !== 'Cleared' && call.status !== 'Closed') {
                                // Clear call when officer goes available, on patrol, or OOS after being assigned
                                callStatus = 'Cleared';
                                timeField = { time_cleared: new Date().toISOString() };
                            }
                            
                            // Update call if status changed
                            if (callStatus !== call.status) {
                                await base44.entities.DispatchCall.update(call.id, {
                                    status: callStatus,
                                    ...timeField
                                });
                                
                                // Log call status change
                                await base44.entities.CallStatusLog.create({
                                    call_id: call.id,
                                    incident_type: call.incident,
                                    location: call.location,
                                    old_status: call.status,
                                    new_status: callStatus,
                                    unit_id: currentUser.id,
                                    unit_name: unitName || currentUser.full_name,
                                    latitude: call.latitude,
                                    longitude: call.longitude,
                                    notes: `Officer went ${newStatus} - call cleared`
                                });
                            }
                        }
                    } catch (error) {
                        // Silent fail
                    }
                }
                
                // Auto-dispatch logic when becoming available
                if ((newStatus === 'Available' || newStatus === 'Returning to Station') && activeCalls.length > 0) {
                    checkAutoDispatch();
                }
                
                // Immediately update location to reflect new status
                await updateUserLocation();
            } catch (error) {
                toast.error('Failed to update status');
            }
        }
    };

    const checkAutoDispatch = async () => {
        if (!currentLocation || !activeCalls || activeCalls.length === 0) return;

        try {
            // Find highest priority call
            const sortedCalls = [...activeCalls].sort((a, b) => {
                const aPriority = assessCallPriority(a).score;
                const bPriority = assessCallPriority(b).score;
                return bPriority - aPriority;
            });

            const highestPriorityCall = sortedCalls[0];
            
            // Calculate distance to call
            const distance = calculateDistance(
                currentLocation[0],
                currentLocation[1],
                highestPriorityCall.latitude,
                highestPriorityCall.longitude
            );

            const distanceMiles = (distance * 0.621371).toFixed(1);
            const eta = Math.ceil((distance / 60) * 60); // Rough ETA in minutes

            setAutoDispatchSuggestion({
                call: { ...highestPriorityCall, priority: assessCallPriority(highestPriorityCall) },
                unit: {
                    id: currentUser.id,
                    unit_number: unitName || currentUser.full_name,
                    status: unitStatus
                },
                distance: `${distanceMiles} mi`,
                eta: `${eta} min`
            });
        } catch (error) {
            // Silent fail
        }
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    const assessCallPriority = (call) => {
        const incident = call.incident?.toLowerCase() || '';
        const description = call.description?.toLowerCase() || '';
        const combined = `${incident} ${description}`;

        if (
            combined.includes('shooting') || combined.includes('stabbing') ||
            combined.includes('officer down') || combined.includes('shots fired') ||
            combined.includes('active shooter') || combined.includes('code 3')
        ) {
            return { level: 'critical', score: 4, label: 'CRITICAL' };
        }

        if (
            combined.includes('assault') || combined.includes('robbery') ||
            combined.includes('burglary in progress') || combined.includes('domestic') ||
            combined.includes('pursuit') || combined.includes('accident with injury')
        ) {
            return { level: 'high', score: 3, label: 'HIGH' };
        }

        if (
            combined.includes('suspicious') || combined.includes('disturbance') ||
            combined.includes('trespass') || combined.includes('alarm')
        ) {
            return { level: 'medium', score: 2, label: 'MEDIUM' };
        }

        return { level: 'low', score: 1, label: 'LOW' };
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
                
                // Log unit status change
                await base44.entities.UnitStatusLog.create({
                    unit_id: currentUser.id,
                    unit_name: unitName || currentUser.full_name,
                    old_status: unitStatus,
                    new_status: 'Enroute',
                    location_lat: currentLocation?.[0],
                    location_lng: currentLocation?.[1],
                    call_id: callId,
                    notes: `Responding to ${call.incident}`
                });

                // Log call status change
                await base44.entities.CallStatusLog.create({
                    call_id: callId,
                    incident_type: call.incident,
                    location: call.location,
                    old_status: call.status,
                    new_status: 'Enroute',
                    unit_id: currentUser.id,
                    unit_name: unitName || currentUser.full_name,
                    latitude: call.latitude,
                    longitude: call.longitude,
                    notes: `${unitName || currentUser.full_name} enroute`
                });

                // Play alert sound for high-priority calls
                const priority = assessCallPriority(call);
                if (priority.score >= 3) {
                    criticalAlertSound.play().catch(err => console.log('Audio play failed:', err));
                }

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
        let filtered = calls;
        
        if (filter === 'richmond') {
            filtered = calls.filter(call => call.agency?.includes('RPD') || call.agency?.includes('RFD') || call.agency?.includes('BPS'));
        } else if (filter === 'henrico') {
            filtered = calls.filter(call => call.agency?.includes('HPD') || call.agency?.includes('HCPD') || call.agency?.includes('Henrico'));
        } else if (filter === 'chesterfield') {
            filtered = calls.filter(call => call.agency?.includes('CCPD') || call.agency?.includes('CCFD') || call.agency?.includes('Chesterfield'));
        }

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
                toast.info('Searching...');
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newFilters.searchAddress + ', Virginia, USA')}&limit=5`,
                    { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } }
                );
                const data = await response.json();

                if (data && data.length > 0) {
                    // Prefer results in Virginia
                    const virginiaResult = data.find(r => r.display_name.toLowerCase().includes('virginia')) || data[0];
                    const coords = [parseFloat(virginiaResult.lat), parseFloat(virginiaResult.lon)];
                    
                    // Just center the map on the location and drop a pin with loading state
                    setMapCenter(coords);
                    setSearchPin({ coords, address: virginiaResult.display_name, propertyInfo: 'Loading property information...' });
                    
                    // Show closest match notification if not exact
                    const isExactMatch = virginiaResult.display_name.toLowerCase().includes(newFilters.searchAddress.toLowerCase());
                    if (!isExactMatch && data.length > 1) {
                        toast.success(`Closest match: ${virginiaResult.display_name.split(',').slice(0, 2).join(',')}`);
                    } else {
                        toast.success(`Found: ${virginiaResult.display_name.split(',')[0]}`);
                    }
                    
                    // Get property info using AI with detailed instructions
                    try {
                        const propertyInfo = await base44.integrations.Core.InvokeLLM({
                            prompt: `Search for property ownership and detailed information for this address: ${virginiaResult.display_name}

Using public records, county assessor databases, property tax records, and real estate data, find:

1. **Property Owner**: Full legal name(s) of current owner(s)
2. **Property Value**: Current assessed value or market value
3. **Year Built**: Construction year
4. **Property Type**: Residential/Commercial/etc.
5. **Lot Size**: Parcel size in acres or sq ft
6. **Last Sale**: Date and price of most recent sale
7. **Tax Information**: Annual property tax amount if available

Format as a clear, organized list with bullet points.
If specific data is not available, indicate "Not found" for that item.
Be thorough and search multiple sources.`,
                            add_context_from_internet: true
                        });
                        
                        if (propertyInfo) {
                            setSearchPin({ coords, address: virginiaResult.display_name, propertyInfo });
                            toast.success('Property information loaded');
                        } else {
                            setSearchPin({ coords, address: virginiaResult.display_name, propertyInfo: 'Property information not available' });
                        }
                    } catch (error) {
                        console.error('Property info error:', error);
                        setSearchPin({ coords, address: virginiaResult.display_name, propertyInfo: 'Error loading property information. Try again.' });
                    }
                } else {
                    toast.error('Address not found - try entering city and state');
                    setSearchPin(null);
                }
            } catch (error) {
                console.error('Search error:', error);
                toast.error('Failed to search address');
                setSearchPin(null);
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
            const response = await base44.functions.invoke('fetchAllActiveCalls', {});

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
                if (!silent) toast.error(errorMsg);
            }
        } catch (error) {
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
                    showFireStations={jurisdictionFilters.showFireStations}
                    showJails={jurisdictionFilters.showJails}
                    jurisdictionFilters={jurisdictionFilters}
                    searchPin={searchPin}
                    mapTheme={mapTheme}
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
                    className="absolute top-24 left-2 z-[1002] flex flex-col gap-1.5 pointer-events-auto"
                >
                    <Button 
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveCallInfo(null);
                            clearRoute();
                            if (currentUser) {
                                try {
                                    await base44.auth.updateMe({
                                        current_call_id: null,
                                        current_call_info: null,
                                        status: 'Available'
                                    });
                                    setUnitStatus('Available');
                                    toast.success('Available');
                                } catch (error) {
                                    console.error('Error clearing call:', error);
                                }
                            }
                        }} 
                        size="sm" 
                        className={`${unitStatus === 'Available' ? 'bg-green-600 hover:bg-green-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg pointer-events-auto`}
                    >
                        <CheckCircle2 className={`w-4 h-4 ${unitStatus === 'Available' ? 'text-white' : 'text-green-600'}`} />
                        <span className={`text-[8px] font-semibold ${unitStatus === 'Available' ? 'text-white' : 'text-gray-700'}`}>Avil</span>
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
                    <Button onClick={() => setShowAllUnitsPanel(true)} size="sm" className="bg-white/95 hover:bg-white shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg">
                        <Users className="w-4 h-4 text-gray-600" />
                        <span className="text-[8px] font-semibold text-gray-700">Units</span>
                    </Button>
                    <Button onClick={() => setShowUnitGrouping(true)} size="sm" className="bg-white/95 hover:bg-white shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg">
                        <Shield className="w-4 h-4 text-indigo-600" />
                        <span className="text-[8px] font-semibold text-gray-700">Group</span>
                    </Button>
                    <Button 
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveCallInfo(null);
                            clearRoute();
                            if (currentUser) {
                                try {
                                    await base44.auth.updateMe({
                                        show_on_map: false,
                                        current_call_id: null,
                                        current_call_info: null,
                                        status: 'Out of Service'
                                    });
                                    setUnitStatus('Out of Service');
                                    toast.success('Out of Service - Hidden from map');
                                } catch (error) {
                                    console.error('Error updating status:', error);
                                }
                            }
                        }} 
                        size="sm" 
                        className={`${unitStatus === 'Out of Service' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-white/95 hover:bg-white'} shadow-lg w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg pointer-events-auto`}
                    >
                        <XCircle className={`w-4 h-4 ${unitStatus === 'Out of Service' ? 'text-white' : 'text-gray-600'}`} />
                        <span className={`text-[8px] font-semibold ${unitStatus === 'Out of Service' ? 'text-white' : 'text-gray-700'}`}>OOS</span>
                    </Button>
                </motion.div>
            )}

            {/* Compass */}
            {heading !== null && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-2 left-2 z-[999] pointer-events-none"
                >
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

            {/* Online/Offline Indicator & Live Tracking Status */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-2 md:top-4 left-20 md:left-24 z-[999] flex flex-wrap gap-1.5 md:gap-2"
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
                
                {accuracy && accuracy > 50 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-amber-100 text-amber-700 px-2 md:px-3 py-1 md:py-1.5 rounded-full flex items-center gap-1.5 md:gap-2"
                    >
                        <MapPinOff className="w-3 h-3" />
                        <span className="text-[10px] md:text-xs font-medium">Low GPS</span>
                    </motion.div>
                )}
                
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

            {/* Recenter Button - shown when navigating and user panned away */}
            <AnimatePresence>
                {isNavigating && userPannedAway && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute bottom-40 right-4 z-[1002] pointer-events-auto"
                    >
                        <Button
                            onClick={() => {
                                setUserPannedAway(false);
                                toast.success('Recentered on your location');
                            }}
                            size="lg"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-6 rounded-2xl shadow-2xl flex items-center gap-2"
                        >
                            <NavigationIcon className="w-6 h-6" />
                            <span className="font-semibold">Recenter</span>
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Top Right Controls */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-16 right-2 z-[1002] flex flex-col gap-1.5 pointer-events-auto"
            >

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
                        <Monitor className="w-4 h-4" />
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
                    onClick={() => setShowHistoricalLogs(true)}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
                    title="Historical Logs"
                >
                    <History className="w-4 h-4" />
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
                    onClick={() => setShowAddressLookup(true)}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-lg"
                    title="AI Address Lookup"
                >
                    <Search className="w-4 h-4" />
                </Button>

                <Button
                    onClick={() => {
                        const newTheme = mapTheme === 'day' ? 'night' : 'day';
                        setMapTheme(newTheme);
                        localStorage.setItem('mapTheme', newTheme);
                        toast.success(`${newTheme === 'day' ? '☀️ Day' : '🌙 Night'} mode`);
                    }}
                    size="icon"
                    className={`h-8 w-8 rounded-lg shadow-lg ${
                        mapTheme === 'night' 
                            ? 'bg-slate-800 hover:bg-slate-900 text-yellow-400' 
                            : 'bg-white hover:bg-gray-100 text-blue-600'
                    }`}
                    title="Toggle Day/Night Mode"
                >
                    {mapTheme === 'night' ? '🌙' : '☀️'}
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
                        {speed > 1 && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 bg-white/95 backdrop-blur-xl rounded-xl shadow-lg px-4 py-2 text-center"
                            >
                                <p className="text-sm font-semibold text-gray-700">{currentStreet}</p>
                            </motion.div>
                        )}
                    </motion.div>

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
            ) : null}

            {!isNavigating && directions && directions.length > 0 && (
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
                        routes={routes}
                        onSelectRoute={handleSelectRoute}
                        selectedRouteIndex={selectedRouteIndex}
                    />
                </>
            )}

            <UnitSettings
                isOpen={showUnitSettings}
                onClose={() => setShowUnitSettings(false)}
                unitName={unitName}
                onSave={handleSaveUnitName}
                showLights={showLights}
                onLightsChange={handleLightsChange}
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

            {/* All Units Panel */}
            <AllUnitsPanel
                isOpen={showAllUnitsPanel}
                onClose={() => setShowAllUnitsPanel(false)}
            />

            {/* Historical Logs Panel */}
            <HistoricalLogsPanel
                isOpen={showHistoricalLogs}
                onClose={() => setShowHistoricalLogs(false)}
            />

            {/* Auto-Dispatch Suggestion */}
            {autoDispatchSuggestion && (
                <AutoDispatchSuggestion
                    suggestion={autoDispatchSuggestion}
                    onAccept={async () => {
                        await handleEnrouteToCall(autoDispatchSuggestion.call);
                        setAutoDispatchSuggestion(null);
                    }}
                    onDismiss={() => setAutoDispatchSuggestion(null)}
                />
            )}

            {/* Unit Grouping Panel */}
            <UnitGroupingPanel
                isOpen={showUnitGrouping}
                onClose={() => setShowUnitGrouping(false)}
                currentUser={currentUser}
            />

            {/* AI Address Lookup Tool */}
            <AddressLookupTool
                isOpen={showAddressLookup}
                onClose={() => setShowAddressLookup(false)}
                onLocationFound={(coords, address) => {
                    setMapCenter(coords);
                    setSearchPin({ 
                        coords, 
                        address, 
                        propertyInfo: 'See Address Lookup Tool for full details'
                    });
                }}
            />
            </div>
            );
            }