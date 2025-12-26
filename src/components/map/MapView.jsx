import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom blue marker for current location
const currentLocationIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="
            width: 24px;
            height: 24px;
            background: #007AFF;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,122,255,0.5);
        "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

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

export default function MapView({ currentLocation, destination, route }) {
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
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            
            <MapController 
                center={currentLocation} 
                routeBounds={routeBounds}
            />
            
            {currentLocation && (
                <Marker position={currentLocation} icon={currentLocationIcon}>
                    <Popup>
                        <span className="font-medium">Your Location</span>
                    </Popup>
                </Marker>
            )}
            
            {destination && (
                <Marker position={destination.coords} icon={destinationIcon}>
                    <Popup>
                        <span className="font-medium">{destination.name}</span>
                    </Popup>
                </Marker>
            )}
            
            {route && route.length > 0 && (
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
            )}
        </MapContainer>
    );
}