import React, { useEffect, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import TrafficLayer from './TrafficLayer';
import ActiveCallMarkers from './ActiveCallMarkers';
import OtherUnitsLayer from './OtherUnitsLayer';
import JurisdictionBoundaries from './JurisdictionBoundaries';
import PrecinctMarkers from './PrecinctMarkers';
import PoliceStationMarkers from './PoliceStationMarkers';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Police car icon with lights
const createCurrentLocationIcon = (withLights = false) => {
    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 40px; height: 40px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" style="position: relative; z-index: 2; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));">
                    ${withLights ? `
                    <circle cx="8" cy="6" r="1.5" fill="#00FF00">
                        <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="16" cy="6" r="1.5" fill="#00FF00">
                        <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite"/>
                    </circle>
                    ` : ''}
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" fill="#1E40AF" stroke="#1E3A8A" stroke-width="0.5"/>
                    <circle cx="7" cy="17" r="2" fill="#1F2937" stroke="#111827" stroke-width="0.5"/>
                    <circle cx="17" cy="17" r="2" fill="#1F2937" stroke="#111827" stroke-width="0.5"/>
                    <rect x="6" y="11" width="3" height="2" fill="#60A5FA" rx="0.5"/>
                    <rect x="11" y="11" width="3" height="2" fill="#60A5FA" rx="0.5"/>
                </svg>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    });
};

// Police car with heading and optional lights
const createLocationWithHeading = (heading, withLights = false) => {
    // Normalize heading to 0-360
    const normalizedHeading = heading ? ((heading % 360) + 360) % 360 : 0;
    
    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 50px; height: 50px; transform: rotate(${normalizedHeading}deg); transition: transform 0.3s ease;">
                <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" style="position: relative; z-index: 2; filter: drop-shadow(0 3px 10px rgba(0,0,0,0.4));">
                    ${withLights ? `
                    <circle cx="8" cy="5" r="1.8" fill="#FF0000">
                        <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="16" cy="5" r="1.8" fill="#0000FF">
                        <animate attributeName="opacity" values="0;1;0" dur="0.8s" repeatCount="indefinite"/>
                    </circle>
                    ` : ''}
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" fill="#1E40AF" stroke="#1E3A8A" stroke-width="0.8"/>
                    <circle cx="7" cy="17" r="2.2" fill="#1F2937" stroke="#111827" stroke-width="0.5"/>
                    <circle cx="17" cy="17" r="2.2" fill="#1F2937" stroke="#111827" stroke-width="0.5"/>
                    <rect x="6" y="10.5" width="3.5" height="2.5" fill="#60A5FA" rx="0.5"/>
                    <rect x="11" y="10.5" width="3.5" height="2.5" fill="#60A5FA" rx="0.5"/>
                    <polygon points="12,1 15,7 9,7" fill="#1E40AF" stroke="#1E3A8A" stroke-width="0.8"/>
                </svg>
            </div>
        `,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
    });
};

// Custom red marker for destination
const destinationIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="
            width: 32px;
            height: 32px;
            background: #FF3B30;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(255,59,48,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Component to handle map center updates
function MapController({ center, routeBounds, mapCenter, isNavigating, heading }) {
    const map = useMap();
    const prevCenterRef = useRef(center);
    const userInteractingRef = useRef(false);
    const lastUpdateTimeRef = useRef(0);

    useEffect(() => {
        // Track user interaction
        const handleMoveStart = () => { userInteractingRef.current = true; };
        const handleMoveEnd = () => { 
            setTimeout(() => { userInteractingRef.current = false; }, 5000);
        };

        map.on('movestart', handleMoveStart);
        map.on('moveend', handleMoveEnd);

        return () => {
            map.off('movestart', handleMoveStart);
            map.off('moveend', handleMoveEnd);
        };
    }, [map]);

    // Handle external map centering (from call detail sidebar)
    useEffect(() => {
        if (mapCenter) {
            map.setView(mapCenter, 16, { animate: true, duration: 0.5 });
        }
    }, [mapCenter, map]);

    useEffect(() => {
        // Don't auto-center if user is manually panning
        if (userInteractingRef.current) return;

        // Throttle updates to improve performance
        const now = Date.now();
        if (now - lastUpdateTimeRef.current < 1000) return;
        lastUpdateTimeRef.current = now;

        if (routeBounds && !isNavigating) {
            // Only fit bounds when first showing route, not during navigation
            map.fitBounds(routeBounds, { padding: [50, 50] });
        } else if (center && (!prevCenterRef.current || 
            Math.abs(center[0] - prevCenterRef.current[0]) > 0.00005 || 
            Math.abs(center[1] - prevCenterRef.current[1]) > 0.00005)) {

            // When navigating, keep map zoomed in and centered on user
            if (isNavigating) {
                map.setView(center, 18, { animate: true, duration: 0.3 });
            } else {
                // Don't auto-zoom when not navigating, just pan to follow user
                map.panTo(center, { animate: true, duration: 0.3 });
            }
            prevCenterRef.current = center;
        }
    }, [center, routeBounds, map, isNavigating]);

    return null;
}

const MapView = memo(function MapView({ currentLocation, destination, route, trafficSegments, useOfflineTiles, activeCalls, heading, locationHistory, unitName, showLights, otherUnits, currentUserId, onCallClick, speed, mapCenter, isNavigating, baseMapType = 'street', jurisdictionFilters }) {
    const defaultCenter = currentLocation || [37.5407, -77.4360]; // Default to Richmond, VA
    
    // Calculate route bounds if route exists
    const routeBounds = route && route.length > 0 
        ? L.latLngBounds(route.map(coord => [coord[0], coord[1]]))
        : null;
    
    console.log('🗺️ MapView rendering:');
    console.log('  - Active calls to render:', activeCalls?.length || 0);
    if (activeCalls && activeCalls.length > 0) {
        console.log('  - Sample call:', activeCalls[0]);
    }

    // Determine tile layer URL based on base map type
    const getTileLayerUrl = () => {
        if (useOfflineTiles) return '';

        switch (baseMapType) {
            case 'satellite':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            case 'topo':
                return 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
            case 'street':
            default:
                return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }
    };

    const getTileAttribution = () => {
        switch (baseMapType) {
            case 'satellite':
                return '&copy; <a href="https://www.esri.com/">Esri</a>';
            case 'topo':
                return '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>';
            case 'street':
            default:
                return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        }
    };

    return (
        <MapContainer
            center={defaultCenter}
            zoom={isNavigating ? 18 : 13}
            className="h-full w-full"
            zoomControl={false}
            minZoom={10}
            maxZoom={19}
        >
            <TileLayer
                key={baseMapType}
                attribution={getTileAttribution()}
                url={getTileLayerUrl()}
                maxZoom={baseMapType === 'satellite' ? 19 : 17}
            />

            {/* Jurisdiction Boundaries */}
            <JurisdictionBoundaries filters={jurisdictionFilters} />

            {/* Precinct Markers */}
            <PrecinctMarkers />
            
            <MapController 
                center={currentLocation} 
                routeBounds={routeBounds}
                mapCenter={mapCenter}
                isNavigating={isNavigating}
                heading={heading}
            />

            {currentLocation && (
                <>
                    <Marker 
                        position={currentLocation} 
                        icon={heading !== null ? createLocationWithHeading(heading, showLights) : createCurrentLocationIcon(showLights)}
                    >
                        <Popup>
                                <div className="p-2">
                                    <p className="font-bold text-base text-[#007AFF]">{unitName || 'Your Location'}</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Speed: {Math.round(speed || 0)} mph
                                    </p>
                                </div>
                            </Popup>
                        </Marker>
                        </>
                        )}
            
            {/* Location History Trail */}
            {locationHistory && locationHistory.length > 1 && (
                <Polyline
                    positions={locationHistory}
                    pathOptions={{
                        color: '#007AFF',
                        weight: 3,
                        opacity: 0.4,
                        dashArray: '5, 10',
                        lineCap: 'round',
                        lineJoin: 'round'
                    }}
                />
            )}
            
            {destination && (
                <Marker position={destination.coords} icon={destinationIcon}>
                    <Popup>
                        <span className="font-medium">{destination.name}</span>
                    </Popup>
                </Marker>
            )}
            
            {trafficSegments && trafficSegments.length > 0 ? (
                <TrafficLayer trafficSegments={trafficSegments} />
            ) : route && route.length > 0 ? (
                <Polyline
                    positions={route}
                    pathOptions={{
                        color: '#007AFF',
                        weight: 5,
                        opacity: 0.8,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }}
                />
            ) : null}

            {/* Active Emergency Calls */}
            {activeCalls && activeCalls.length > 0 && (
                <ActiveCallMarkers calls={activeCalls} onCallClick={onCallClick} />
            )}

            {/* Other Units */}
            {otherUnits && otherUnits.length > 0 && (
                <OtherUnitsLayer units={otherUnits} currentUserId={currentUserId} />
            )}
        </MapContainer>
        );
        });

        export default MapView;