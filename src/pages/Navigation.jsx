import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Map as MapIcon, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MapView from '@/components/map/MapView';
import SearchBar from '@/components/map/SearchBar';
import LocationButton from '@/components/map/LocationButton';
import DirectionsPanel from '@/components/map/DirectionsPanel';
import RouteOptions from '@/components/map/RouteOptions';
import LiveNavigation from '@/components/map/LiveNavigation';
import OfflineMapManager from '@/components/map/OfflineMapManager';
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
    
    const locationWatchId = useRef(null);
    const rerouteCheckInterval = useRef(null);

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
        getCurrentLocation();
        return () => {
            if (locationWatchId.current) {
                navigator.geolocation.clearWatch(locationWatchId.current);
            }
            if (rerouteCheckInterval.current) {
                clearInterval(rerouteCheckInterval.current);
            }
        };
    }, []);

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
                setCurrentLocation([37.7749, -122.4194]);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, []);

    const startLiveTracking = () => {
        if (!navigator.geolocation) return;

        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const coords = [position.coords.latitude, position.coords.longitude];
                setCurrentLocation(coords);
                
                if (isNavigating && directions) {
                    updateNavigationProgress(coords);
                }
            },
            (error) => {
                console.error('Error tracking location:', error);
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
        );
    };

    const updateNavigationProgress = (coords) => {
        // Calculate distance to next turn (simplified)
        if (!directions || currentStepIndex >= directions.length) {
            // Arrived at destination
            setIsNavigating(false);
            toast.success('You have arrived at your destination!');
            return;
        }

        // Update remaining distance (simplified - in real app, use proper calculations)
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
            const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=2&overview=full&geometries=geojson&steps=true`
            );
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
        startLiveTracking();
        toast.success('Navigation started');
    };

    const exitNavigation = () => {
        setIsNavigating(false);
        if (locationWatchId.current) {
            navigator.geolocation.clearWatch(locationWatchId.current);
        }
        if (rerouteCheckInterval.current) {
            clearInterval(rerouteCheckInterval.current);
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
            />

            {/* Online/Offline Indicator */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-20 left-4 z-[999]"
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
            </motion.div>

            {/* Offline Maps Button */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-20 right-4 z-[999]"
            >
                <Button
                    onClick={() => setShowOfflineManager(true)}
                    size="icon"
                    className="h-10 w-10 rounded-full bg-white/95 backdrop-blur-xl shadow-lg border-white/20 hover:bg-white text-[#007AFF]"
                >
                    <MapIcon className="w-5 h-5" />
                </Button>
            </motion.div>

            {!isNavigating && (
                <>
                    <SearchBar
                        onSearch={searchDestination}
                        isSearching={isSearching}
                        onClear={clearRoute}
                    />
                    <LocationButton
                        onClick={getCurrentLocation}
                        isLocating={isLocating}
                    />
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
        </div>
    );
}