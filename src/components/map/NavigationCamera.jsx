import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function NavigationCamera({ 
    isNavigating, 
    currentLocation, 
    heading, 
    speed = 0,
    upcomingManeuverDistance = null 
}) {
    const map = useMap();

    useEffect(() => {
        if (!isNavigating || !currentLocation) return;

        // Calculate zoom based on speed and upcoming maneuver
        let targetZoom;
        
        if (upcomingManeuverDistance && upcomingManeuverDistance < 1200) {
            // Zoom in when approaching maneuver
            targetZoom = 18;
        } else if (speed < 25) {
            // City streets - closer zoom
            targetZoom = 17;
        } else if (speed < 55) {
            // Medium speed - medium zoom
            targetZoom = 15;
        } else {
            // Highway - farther zoom
            targetZoom = 14;
        }

        // Smooth zoom transition
        const currentZoom = map.getZoom();
        const zoomDiff = Math.abs(targetZoom - currentZoom);
        
        if (zoomDiff > 0.5) {
            map.setZoom(targetZoom, { animate: true, duration: 1 });
        }

        // Keep user centered slightly lower on screen for look-ahead
        const mapSize = map.getSize();
        const offset = [0, mapSize.y * 0.15]; // Shift down 15% for look-ahead
        
        map.panTo(currentLocation, {
            animate: true,
            duration: 0.5,
            easeLinearity: 0.5,
            noMoveStart: true
        });

    }, [map, isNavigating, currentLocation, speed, upcomingManeuverDistance]);

    return null;
}