import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import MapView from '@/components/map/MapView';
import SearchBar from '@/components/map/SearchBar';
import LocationButton from '@/components/map/LocationButton';
import DirectionsPanel from '@/components/map/DirectionsPanel';

export default function Navigation() {
    const [currentLocation, setCurrentLocation] = useState(null);
    const [destination, setDestination] = useState(null);
    const [route, setRoute] = useState(null);
    const [directions, setDirections] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [distance, setDistance] = useState('');
    const [duration, setDuration] = useState('');
    const [destinationName, setDestinationName] = useState('');

    // Get current location on mount
    useEffect(() => {
        getCurrentLocation();
    }, []);

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
                toast.error('Unable to get your location. Please enable location services.');
                setIsLocating(false);
                // Set a default location (San Francisco)
                setCurrentLocation([37.7749, -122.4194]);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, []);

    const searchDestination = async (query) => {
        setIsSearching(true);
        
        try {
            // Use Nominatim for geocoding (free and doesn't require API key)
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
            );
            const data = await response.json();
            
            if (data && data.length > 0) {
                const result = data[0];
                const destCoords = [parseFloat(result.lat), parseFloat(result.lon)];
                setDestination({ coords: destCoords, name: result.display_name });
                setDestinationName(result.display_name.split(',')[0]);
                
                // Get route if we have current location
                if (currentLocation) {
                    await getRoute(currentLocation, destCoords);
                }
            } else {
                toast.error('Location not found. Please try a different address.');
            }
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search location. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    const getRoute = async (start, end) => {
        try {
            // Use OSRM for routing (free and doesn't require API key)
            const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`
            );
            const data = await response.json();
            
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const routeData = data.routes[0];
                
                // Extract coordinates for the polyline
                const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                setRoute(coordinates);
                
                // Calculate distance and duration
                const distanceKm = (routeData.distance / 1000).toFixed(1);
                const distanceMiles = (routeData.distance / 1609.34).toFixed(1);
                setDistance(`${distanceMiles} mi`);
                
                const durationMins = Math.round(routeData.duration / 60);
                if (durationMins >= 60) {
                    const hours = Math.floor(durationMins / 60);
                    const mins = durationMins % 60;
                    setDuration(`${hours} hr ${mins} min`);
                } else {
                    setDuration(`${durationMins} min`);
                }
                
                // Extract turn-by-turn directions
                const steps = routeData.legs[0].steps.map(step => ({
                    instruction: step.maneuver.instruction || formatManeuver(step.maneuver),
                    distance: step.distance > 1000 
                        ? `${(step.distance / 1609.34).toFixed(1)} mi` 
                        : `${Math.round(step.distance * 3.281)} ft`
                }));
                setDirections(steps);
            } else {
                toast.error('Could not find a route. Please try a different destination.');
            }
        } catch (error) {
            console.error('Routing error:', error);
            toast.error('Failed to get directions. Please try again.');
        }
    };

    const formatManeuver = (maneuver) => {
        const type = maneuver.type;
        const modifier = maneuver.modifier;
        
        if (type === 'depart') return 'Start your journey';
        if (type === 'arrive') return 'You have arrived at your destination';
        if (type === 'turn') return `Turn ${modifier}`;
        if (type === 'continue') return 'Continue straight';
        if (type === 'roundabout') return `At the roundabout, take the exit`;
        if (type === 'merge') return `Merge ${modifier || ''}`;
        
        return `${type} ${modifier || ''}`.trim();
    };

    const clearRoute = () => {
        setDestination(null);
        setRoute(null);
        setDirections(null);
        setDistance('');
        setDuration('');
        setDestinationName('');
    };

    return (
        <div className="h-screen w-screen relative overflow-hidden bg-[#F5F5F7]">
            {/* Map */}
            <MapView
                currentLocation={currentLocation}
                destination={destination}
                route={route}
            />

            {/* Search Bar */}
            <SearchBar
                onSearch={searchDestination}
                isSearching={isSearching}
                onClear={clearRoute}
            />

            {/* Location Button */}
            <LocationButton
                onClick={getCurrentLocation}
                isLocating={isLocating}
            />

            {/* No Location Warning */}
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
                            Enable location services for accurate directions
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Directions Panel */}
            <DirectionsPanel
                directions={directions}
                destination={destinationName}
                distance={distance}
                duration={duration}
                onClose={clearRoute}
            />
        </div>
    );
}