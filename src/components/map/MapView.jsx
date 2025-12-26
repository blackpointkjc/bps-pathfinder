import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import TrafficLayer from './TrafficLayer';
import ActiveCallMarkers from './ActiveCallMarkers';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom blue marker for current location with pulse animation
const currentLocationIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="position: relative; width: 24px; height: 24px;">
            <div style="
                position: absolute;
                width: 48px;
                height: 48px;
                background: rgba(0, 122, 255, 0.2);
                border-radius: 50%;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                animation: pulse-ring 2s ease-out infinite;
            "></div>
            <div style="
                position: absolute;
                width: 24px;
                height: 24px;
                background: #007AFF;
                border: 4px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 12px rgba(0,122,255,0.6);
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 2;
            "></div>
            <div style="
                position: absolute;
                width: 8px;
                height: 8px;
                background: white;
                border-radius: 50%;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 3;
            "></div>
        </div>
        <style>
            @keyframes pulse-ring {
                0% {
                    transform: translate(-50%, -50%) scale(0.5);
                    opacity: 1;
                }
                100% {
                    transform: translate(-50%, -50%) scale(1.5);
                    opacity: 0;
                }
            }
        </style>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
});

// Custom marker with heading indicator
const createLocationWithHeading = (heading) => {
    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 48px; height: 48px;">
                <div style="
                    position: absolute;
                    width: 48px;
                    height: 48px;
                    background: rgba(0, 122, 255, 0.2);
                    border-radius: 50%;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    animation: pulse-ring 2s ease-out infinite;
                "></div>
                <div style="
                    position: absolute;
                    width: 24px;
                    height: 24px;
                    background: #007AFF;
                    border: 4px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 12px rgba(0,122,255,0.6);
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                "></div>
                ${heading !== null ? `
                <div style="
                    position: absolute;
                    width: 0;
                    height: 0;
                    border-left: 8px solid transparent;
                    border-right: 8px solid transparent;
                    border-bottom: 20px solid #007AFF;
                    top: -8px;
                    left: 50%;
                    transform: translateX(-50%) rotate(${heading}deg);
                    transform-origin: 8px 28px;
                    z-index: 1;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                "></div>
                ` : ''}
                <div style="
                    position: absolute;
                    width: 8px;
                    height: 8px;
                    background: white;
                    border-radius: 50%;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 3;
                "></div>
            </div>
            <style>
                @keyframes pulse-ring {
                    0% {
                        transform: translate(-50%, -50%) scale(0.5);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(1.5);
                        opacity: 0;
                    }
                }
            </style>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
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
function MapController({ center, routeBounds }) {
    const map = useMap();
    
    useEffect(() => {
        if (routeBounds) {
            map.fitBounds(routeBounds, { padding: [50, 50] });
        } else if (center) {
            map.setView(center, 15);
        }
    }, [center, routeBounds, map]);
    
    return null;
}

export default function MapView({ currentLocation, destination, route, trafficSegments, useOfflineTiles, activeCalls, heading, locationHistory, unitName }) {
    const defaultCenter = currentLocation || [37.7749, -122.4194]; // Default to SF
    
    // Calculate route bounds if route exists
    const routeBounds = route && route.length > 0 
        ? L.latLngBounds(route.map(coord => [coord[0], coord[1]]))
        : null;

    return (
        <MapContainer
            center={defaultCenter}
            zoom={13}
            className="h-full w-full"
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url={useOfflineTiles 
                    ? '' 
                    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                }
            />
            
            <MapController 
                center={currentLocation} 
                routeBounds={routeBounds}
            />
            
            {currentLocation && (
                <>
                    <Marker 
                        position={currentLocation} 
                        icon={heading !== null ? createLocationWithHeading(heading) : currentLocationIcon}
                    >
                        <Popup>
                            <div className="p-1">
                                <p className="font-semibold text-sm">{unitName || 'Your Location'}</p>
                                {heading !== null && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Heading: {Math.round(heading)}°
                                    </p>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                    
                    {unitName && (
                        <Marker
                            position={[currentLocation[0] + 0.0003, currentLocation[1]]}
                            icon={new L.DivIcon({
                                className: 'unit-label',
                                html: `
                                    <div style="
                                        background: white;
                                        padding: 4px 8px;
                                        border-radius: 12px;
                                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                                        display: flex;
                                        align-items: center;
                                        gap: 4px;
                                        font-size: 12px;
                                        font-weight: 600;
                                        color: #1D1D1F;
                                        white-space: nowrap;
                                        border: 2px solid #007AFF;
                                    ">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
                                            <circle cx="7" cy="17" r="2"></circle>
                                            <circle cx="17" cy="17" r="2"></circle>
                                        </svg>
                                        ${unitName}
                                    </div>
                                `,
                                iconSize: [0, 0],
                                iconAnchor: [-10, 30]
                            })}
                        />
                    )}
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
            <ActiveCallMarkers calls={activeCalls} />
        </MapContainer>
    );
}