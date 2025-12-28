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
        
        if (upcomingManeuverDistance && upcomingManeuverDistance < 400) {
            // Very close to maneuver - zoom in tight
            targetZoom = 19;
        } else if (upcomingManeuverDistance && upcomingManeuverDistance < 1200) {
            // Approaching maneuver
            targetZoom = 18;
        } else if (speed < 25) {
            // City streets - closer zoom
            targetZoom = 17;
        } else if (speed < 55) {
            // Medium speed roads
            targetZoom = 16;
        } else {
            // Highway - farther zoom for overview
            targetZoom = 15;
        }

        // Smooth zoom transition
        const currentZoom = map.getZoom();
        const zoomDiff = Math.abs(targetZoom - currentZoom);
        
        if (zoomDiff > 0.3) {
            map.setZoom(targetZoom, { animate: true, duration: 0.8 });
        }

        // Keep user positioned lower on screen for look-ahead (Waze-style)
        map.panTo(currentLocation, {
            animate: true,
            duration: 0.3,
            easeLinearity: 0.25,
            noMoveStart: true
        });

        // Set map bearing to follow heading for turn-by-turn
        if (heading !== null && heading !== undefined) {
            try {
                // Leaflet doesn't support bearing natively, but we rotate via CSS if needed
                // For now, keep north-up but this could be enhanced with a plugin
            } catch (e) {
                console.warn('Map rotation not supported');
            }
        }

    }, [map, isNavigating, currentLocation, speed, upcomingManeuverDistance, heading]);

    return null;
}