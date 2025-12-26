import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Map as MapIcon, Wifi, WifiOff, Radio, Car, Settings, Mic, Volume2, X, CheckCircle2, Navigation as NavigationIcon, MapPin, XCircle, Plus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import SearchBar from '@/components/map/SearchBar';
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
import { useVoiceGuidance, useVoiceCommand } from '@/components/map/VoiceGuidance';
import { generateTrafficData } from '@/components/map/TrafficLayer';

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
    const [showActiveCalls, setShowActiveCalls] = useState(true);
    const [isLoadingCalls, setIsLoadingCalls] = useState(false);
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
    
    // Multi-user tracking state
    const [otherUnits, setOtherUnits] = useState([]);
    const [currentUnitId, setCurrentUnitId] = useState(null);
    const [unitStatus, setUnitStatus] = useState('Available');
    const [showStatusPanel, setShowStatusPanel] = useState(false);
    const [activeCallInfo, setActiveCallInfo] = useState(null);
    
    // Dispatch state
    const [showDispatchPanel, setShowDispatchPanel] = useState(false);
    const [selectedCallForDispatch, setSelectedCallForDispatch] = useState(null);
    const [showCallDetail, setShowCallDetail] = useState(false);
    const [selectedCall, setSelectedCall] = useState(null);
    
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
            getCurrentLocation();
            fetchActiveCalls();
        };
        init();
        
        // Start live tracking by default
        if (isOnline) {
            startContinuousTracking();
        }
        
        // Refresh active calls every 2 minutes
        callsRefreshInterval.current = setInterval(() => {
            if (showActiveCalls && isOnline) {
                fetchActiveCalls();
            }
        }, 120000);
        
        // Refresh other units every 5 seconds
        unitsRefreshInterval.current = setInterval(() => {
            if (isOnline) {
                fetchOtherUnits();
            }
        }, 5000);
        
        return () => {
            stopContinuousTracking();
            if (rerouteCheckInterval.current) {
                clearInterval(rerouteCheckInterval.current);
            }
            if (callsRefreshInterval.current) {
                clearInterval(callsRefreshInterval.current);
            }
            if (unitsRefreshInterval.current) {
                clearInterval(unitsRefreshInterval.current);
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

    // Initialize unit when user, location, and unitName are ready
    useEffect(() => {
        if (currentUser && currentLocation && unitName && !currentUnitId) {
            initializeUnit();
        }
    }, [currentUser, currentLocation, unitName]);

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

    const startContinuousTracking = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported');
            return;
        }

        setIsLiveTracking(true);
        
        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const coords = [position.coords.latitude, position.coords.longitude];
                setCurrentLocation(coords);
                
                // Update heading if available
                if (position.coords.heading !== null && position.coords.heading !== undefined) {
                    setHeading(position.coords.heading);
                } else if (lastPosition.current) {
                    // Calculate heading from previous position
                    const calculatedHeading = calculateHeading(
                        lastPosition.current,
                        coords
                    );
                    if (calculatedHeading !== null) {
                        setHeading(calculatedHeading);
                    }
                }
                
                // Update speed and accuracy
                if (position.coords.speed !== null) {
                    setSpeed(position.coords.speed * 2.237); // Convert m/s to mph
                }
                setAccuracy(position.coords.accuracy);
                
                // Add to location history (keep last 50 points)
                setLocationHistory(prev => {
                    const newHistory = [...prev, coords];
                    return newHistory.slice(-50);
                });
                
                lastPosition.current = coords;
                
                // Update unit location in database
                updateUnitLocation();
                
                // Update navigation progress if navigating
                if (isNavigating && directions) {
                    updateNavigationProgress(coords);
                }
            },
            (error) => {
                console.error('Error tracking location:', error);
                if (error.code === error.PERMISSION_DENIED) {
                    toast.error('Location permission denied');
                    setIsLiveTracking(false);
                }
            },
            { 
                enableHighAccuracy: true, 
                maximumAge: 1000,
                timeout: 10000
            }
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
        } catch (error) {
            console.error('Error loading user:', error);
        }
    };

    const initializeUnit = async () => {
        if (!currentUser || !unitName || !currentLocation) return;
        
        try {
            // Check if unit exists
            const existingUnits = await base44.entities.Unit.filter({ user_id: currentUser.id });
            
            if (existingUnits && existingUnits.length > 0) {
                const unit = existingUnits[0];
                setCurrentUnitId(unit.id);
                setUnitStatus(unit.status || 'Available');
                setActiveCallInfo(unit.current_call_info);
                
                // Update location and user info
                await base44.entities.Unit.update(unit.id, {
                    latitude: currentLocation[0],
                    longitude: currentLocation[1],
                    unit_name: unitName,
                    rank: currentUser.rank,
                    last_name: currentUser.last_name,
                    show_lights: showLights,
                    last_updated: new Date().toISOString()
                });
            } else {
                // Create new unit
                const newUnit = await base44.entities.Unit.create({
                    unit_name: unitName,
                    user_id: currentUser.id,
                    user_email: currentUser.email,
                    rank: currentUser.rank,
                    last_name: currentUser.last_name,
                    latitude: currentLocation[0],
                    longitude: currentLocation[1],
                    heading: heading || 0,
                    speed: speed || 0,
                    status: 'Available',
                    show_lights: showLights,
                    last_updated: new Date().toISOString()
                });
                setCurrentUnitId(newUnit.id);
                toast.success(`Unit ${unitName} initialized`);
            }
            
            // Start fetching other units
            fetchOtherUnits();
        } catch (error) {
            console.error('Error initializing unit:', error);
            toast.error('Failed to initialize unit');
        }
    };

    const updateUnitLocation = async () => {
        if (!currentUnitId || !currentLocation) return;
        
        try {
            await base44.entities.Unit.update(currentUnitId, {
                latitude: currentLocation[0],
                longitude: currentLocation[1],
                heading: heading || 0,
                speed: speed || 0,
                status: unitStatus,
                show_lights: showLights,
                current_call_info: activeCallInfo,
                last_updated: new Date().toISOString()
            });
            
            // Save to location history every 10 seconds
            if (Math.random() < 0.1) {
                await base44.entities.LocationHistory.create({
                    unit_id: currentUnitId,
                    unit_name: unitName,
                    latitude: currentLocation[0],
                    longitude: currentLocation[1],
                    heading: heading || 0,
                    speed: speed || 0,
                    status: unitStatus,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error updating unit location:', error);
        }
    };

    const fetchOtherUnits = async () => {
        try {
            const units = await base44.entities.Unit.list('-last_updated', 100);
            // Filter out stale units (not updated in last 5 minutes)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const activeUnits = units.filter(unit => {
                const lastUpdate = new Date(unit.last_updated);
                return lastUpdate > fiveMinutesAgo;
            });
            setOtherUnits(activeUnits || []);
        } catch (error) {
            console.error('Error fetching other units:', error);
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
        heading = (heading + 360) % 360;
        
        return heading;
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
            },
            (error) => {
                console.error('Error getting location:', error);
                toast.error('Unable to get your location');
                setIsLocating(false);
                setCurrentLocation([37.5407, -77.4360]);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
        );
    }, []);



    const updateNavigationProgress = (coords) => {
        if (!directions || currentStepIndex >= directions.length) {
            setIsNavigating(false);
            if (voiceEnabled) {
                speak('You have arrived at your destination');
            }
            toast.success('You have arrived at your destination!');
            return;
        }

        // Voice announcement for new steps
        if (voiceEnabled && currentStepIndex !== lastAnnouncedStep.current) {
            const currentStep = directions[currentStepIndex];
            if (currentStep) {
                speak(`In ${currentStep.distance}, ${currentStep.instruction}`);
                lastAnnouncedStep.current = currentStepIndex;
            }
        }

        const stepsRemaining = directions.length - currentStepIndex;
        if (stepsRemaining <= 3) {
            setCurrentStepIndex(currentStepIndex + 1);
        }
    };

    const searchDestination = async (query) => {
        setIsSearching(true);
        
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
            );
            const data = await response.json();
            
            if (data && data.length > 0) {
                const result = data[0];
                const destCoords = [parseFloat(result.lat), parseFloat(result.lon)];
                setDestination({ coords: destCoords, name: result.display_name });
                setDestinationName(result.display_name.split(',')[0]);
                
                if (currentLocation) {
                    const fetchedRoutes = await fetchRoutes(currentLocation, destCoords);
                    if (fetchedRoutes && fetchedRoutes.length > 0) {
                        setRoutes(fetchedRoutes);
                        setSelectedRouteIndex(0);
                        updateRouteDisplay(fetchedRoutes[0]);
                    }
                }
            } else {
                toast.error('Location not found');
            }
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search location');
        } finally {
            setIsSearching(false);
        }
    };

    const fetchRoutes = async (start, end) => {
        try {
            const mode = routePreferences.transportMode === 'cycling' ? 'bike' 
                : routePreferences.transportMode === 'walking' ? 'foot' 
                : 'driving';
            
            let url = `https://router.project-osrm.org/route/v1/${mode}/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=2&overview=full&geometries=geojson&steps=true`;
            
            // Note: OSRM has limited support for avoid options, but we include them in preferences for future API support
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.code === 'Ok' && data.routes) {
                return data.routes.map((route, index) => ({
                    ...route,
                    hasTraffic: Math.random() > 0.5 // Simulate traffic
                }));
            }
            return null;
        } catch (error) {
            console.error('Routing error:', error);
            return null;
        }
    };

    const updateRouteDisplay = (routeData) => {
        const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        // Generate traffic data
        const traffic = generateTrafficData(coordinates);
        setTrafficSegments(traffic);

        const distanceMiles = (routeData.distance / 1609.34).toFixed(1);
        setDistance(`${distanceMiles} mi`);
        
        const durationMins = Math.round(routeData.duration / 60);
        if (durationMins >= 60) {
            const hours = Math.floor(durationMins / 60);
            const mins = durationMins % 60;
            setDuration(`${hours}h ${mins}m`);
        } else {
            setDuration(`${durationMins} min`);
        }
        
        const steps = routeData.legs[0].steps.map(step => ({
            instruction: step.maneuver.instruction || formatManeuver(step.maneuver),
            distance: step.distance > 1000 
                ? `${(step.distance / 1609.34).toFixed(1)} mi` 
                : `${Math.round(step.distance * 3.281)} ft`
        }));
        setDirections(steps);
    };

    const handleSelectRoute = (index) => {
        setSelectedRouteIndex(index);
        updateRouteDisplay(routes[index]);
    };

    const startNavigation = () => {
        setIsNavigating(true);
        setCurrentStepIndex(0);
        setRemainingDistance(distance);
        lastAnnouncedStep.current = -1;
        
        // Check for traffic on selected route
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
        toast.success('Navigation started');
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
                handleRouteSelect(alternativeIndex);
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
        
        // Update or create unit if needed
        if (currentUser && currentLocation) {
            if (currentUnitId) {
                await base44.entities.Unit.update(currentUnitId, { unit_name: name });
            } else {
                await initializeUnit();
            }
        }
    };

    const handleStatusChange = async (newStatus) => {
        setUnitStatus(newStatus);
        if (currentUnitId) {
            try {
                await base44.entities.Unit.update(currentUnitId, { 
                    status: newStatus,
                    last_updated: new Date().toISOString()
                });
                toast.success(`Status updated to ${newStatus}`);
            } catch (error) {
                console.error('Error updating status:', error);
                toast.error('Failed to update status');
            }
        }
    };

    const handleEnrouteToCall = async (call) => {
        if (!currentUnitId) {
            toast.error('Please set your unit name first');
            setShowUnitSettings(true);
            return;
        }

        const callInfo = `${call.incident} - ${call.location}`;
        setActiveCallInfo(callInfo);
        setUnitStatus('Enroute');
        
        try {
            await base44.entities.Unit.update(currentUnitId, {
                status: 'Enroute',
                current_call_id: `${call.timeReceived}-${call.incident}`,
                current_call_info: callInfo,
                last_updated: new Date().toISOString()
            });
            
            toast.success(`Enroute to ${call.incident}`);
            
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
        } catch (error) {
            console.error('Error marking enroute:', error);
            toast.error('Failed to update status');
        }
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

    const fetchActiveCalls = async () => {
        if (!isOnline) return;
        
        setIsLoadingCalls(true);
        try {
            const response = await base44.functions.invoke('fetchActiveCalls', {});
            if (response.data.success) {
                setActiveCalls(response.data.geocodedCalls);
                toast.success(`Loaded ${response.data.geocodedCalls.length} active calls`, {
                    duration: 2000
                });
            }
        } catch (error) {
            console.error('Error fetching active calls:', error);
            toast.error('Failed to load active calls');
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
        <div className="h-screen w-screen relative overflow-hidden bg-[#F5F5F7]">
            <MapView
                currentLocation={currentLocation}
                destination={destination}
                route={routeCoords}
                trafficSegments={trafficSegments}
                useOfflineTiles={!isOnline}
                activeCalls={showActiveCalls ? activeCalls : []}
                heading={heading}
                locationHistory={isLiveTracking ? locationHistory : []}
                unitName={unitName}
                showLights={showLights}
                otherUnits={otherUnits}
                currentUserId={currentUser?.id}
                speed={speed}
onCallClick={(call) => {
                    setSelectedCall(call);
                    setShowCallDetail(true);
                }}
            />

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
                    className="absolute top-1/2 -translate-y-1/2 left-4 z-[999] flex flex-col gap-2"
                >
                    <Button
                        onClick={() => handleStatusChange('Available')}
                        size="sm"
                        className={`${unitStatus === 'Available' ? 'bg-green-600 hover:bg-green-700' : 'bg-white/95 hover:bg-white'} shadow-lg px-3 py-6 flex flex-col items-center gap-1 min-w-[80px]`}
                    >
                        <CheckCircle2 className={`w-5 h-5 ${unitStatus === 'Available' ? 'text-white' : 'text-green-600'}`} />
                        <span className={`text-xs font-semibold ${unitStatus === 'Available' ? 'text-white' : 'text-gray-700'}`}>Available</span>
                    </Button>
                    
                    <Button
                        onClick={() => setShowCallsList(true)}
                        size="sm"
                        className={`${unitStatus === 'Enroute' ? 'bg-red-600 hover:bg-red-700' : 'bg-white/95 hover:bg-white'} shadow-lg px-3 py-6 flex flex-col items-center gap-1 min-w-[80px]`}
                    >
                        <NavigationIcon className={`w-5 h-5 ${unitStatus === 'Enroute' ? 'text-white' : 'text-red-600'}`} />
                        <span className={`text-xs font-semibold ${unitStatus === 'Enroute' ? 'text-white' : 'text-gray-700'}`}>Enroute</span>
                    </Button>
                    
                    <Button
                        onClick={() => handleStatusChange('On Scene')}
                        size="sm"
                        className={`${unitStatus === 'On Scene' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white/95 hover:bg-white'} shadow-lg px-3 py-6 flex flex-col items-center gap-1 min-w-[80px]`}
                    >
                        <MapPin className={`w-5 h-5 ${unitStatus === 'On Scene' ? 'text-white' : 'text-blue-600'}`} />
                        <span className={`text-xs font-semibold ${unitStatus === 'On Scene' ? 'text-white' : 'text-gray-700'}`}>On Scene</span>
                    </Button>
                    
                    <Button
                        onClick={() => handleStatusChange('Out of Service')}
                        size="sm"
                        className={`${unitStatus === 'Out of Service' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-white/95 hover:bg-white'} shadow-lg px-3 py-6 flex flex-col items-center gap-1 min-w-[80px]`}
                    >
                        <XCircle className={`w-5 h-5 ${unitStatus === 'Out of Service' ? 'text-white' : 'text-gray-600'}`} />
                        <span className={`text-xs font-semibold ${unitStatus === 'Out of Service' ? 'text-white' : 'text-gray-700'}`}>Out</span>
                    </Button>
                </motion.div>
            )}

            {/* Online/Offline Indicator & Live Tracking Status */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-4 left-4 z-[999] flex flex-col gap-2"
            >
                <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 ${
                    isOnline 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-amber-100 text-amber-700'
                }`}>
                    {isOnline ? (
                        <>
                            <Wifi className="w-3 h-3" />
                            <span className="text-xs font-medium">Online</span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="w-3 h-3" />
                            <span className="text-xs font-medium">Offline</span>
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
                className="absolute top-20 right-4 z-[999] flex flex-col gap-2"
            >
                <Button
                    onClick={() => setShowOfflineManager(true)}
                    size="icon"
                    className="h-12 w-12 rounded-2xl bg-white/98 backdrop-blur-2xl shadow-xl border border-gray-200/50 hover:bg-white text-[#007AFF] hover:scale-105 transition-transform"
                >
                    <MapIcon className="w-5 h-5" />
                </Button>
                
                <Button
                    onClick={() => {
                        setShowActiveCalls(!showActiveCalls);
                        if (!showActiveCalls && activeCalls.length === 0) {
                            fetchActiveCalls();
                        }
                    }}
                    size="icon"
                    className={`h-10 w-10 rounded-full backdrop-blur-xl shadow-lg border-white/20 ${
                        showActiveCalls 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-white/95 hover:bg-white text-gray-600'
                    }`}
                    disabled={isLoadingCalls}
                >
                    <Radio className={`w-5 h-5 ${isLoadingCalls ? 'animate-pulse' : ''}`} />
                </Button>
                
                {showActiveCalls && activeCalls.length > 0 && (
                    <Button
                        onClick={() => setShowCallsList(true)}
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-xl shadow-lg"
                    >
                        View List
                    </Button>
                )}

{(currentUser?.role === 'admin' || currentUser?.dispatch_role) && (
                    <Button
                        onClick={() => window.location.href = '/dispatch'}
                        size="icon"
                        className="h-10 w-10 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
                    >
                        <Plus className="w-5 h-5" />
                    </Button>
                )}

                <Button
                    onClick={() => setShowRoutePreferences(true)}
                    size="icon"
                    className="h-10 w-10 rounded-full bg-white/95 backdrop-blur-xl shadow-lg border-white/20 hover:bg-white text-gray-600"
                >
                    <Settings className="w-5 h-5" />
                </Button>

                <Button
                    onClick={() => {
                        const newState = !voiceEnabled;
                        setVoiceEnabled(newState);
                        localStorage.setItem('voiceEnabled', newState);
                        toast.success(newState ? 'Voice guidance enabled' : 'Voice guidance disabled');
                    }}
                    size="icon"
                    className={`h-10 w-10 rounded-full backdrop-blur-xl shadow-lg border-white/20 ${
                        voiceEnabled 
                            ? 'bg-[#007AFF] hover:bg-[#0056CC] text-white' 
                            : 'bg-white/95 hover:bg-white text-gray-600'
                    }`}
                >
                    <Volume2 className="w-5 h-5" />
                </Button>


            </motion.div>
            
            {/* Active Calls Counter */}
            <AnimatePresence>
                {activeCalls.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-4 right-4 z-[999]"
                    >
                        <Button
                            onClick={() => setShowActiveCalls(!showActiveCalls)}
                            className={`${
                                showActiveCalls 
                                    ? 'bg-red-500 hover:bg-red-600' 
                                    : 'bg-gray-500 hover:bg-gray-600'
                            } text-white px-4 py-2 text-sm font-semibold shadow-lg rounded-full`}
                        >
                            <Radio className="w-4 h-4 mr-2" />
                            {activeCalls.length} Active Calls
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isNavigating && (
                <>
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] w-[90%] md:w-[480px]"
                    >
                        <SearchBar
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
                        className="absolute bottom-52 right-4 z-[999]"
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
                <DirectionsPanel
                    directions={directions}
                    destination={destinationName}
                    distance={distance}
                    duration={duration}
                    onClose={clearRoute}
                />
            )}

            {!isNavigating && directions && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-[52vh] left-1/2 -translate-x-1/2 z-[1001]"
                >
                    <Button
                        onClick={startNavigation}
                        className="bg-[#007AFF] hover:bg-[#0056CC] text-white px-8 py-6 text-lg font-semibold rounded-2xl shadow-2xl"
                    >
                        Start Navigation
                    </Button>
                </motion.div>
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
                    currentUnitId={currentUnitId}
                />
            )}

            <UnitStatusPanel
                isOpen={showStatusPanel}
                onClose={() => setShowStatusPanel(false)}
                currentStatus={unitStatus}
                unitName={unitName || 'Unknown Unit'}
                onStatusChange={handleStatusChange}
                activeCall={activeCallInfo}
            />

            <DispatchPanel
                isOpen={showDispatchPanel}
                onClose={() => setShowDispatchPanel(false)}
                call={selectedCallForDispatch}
                onAssignUnit={handleAssignUnit}
            />
        </div>
    );
}