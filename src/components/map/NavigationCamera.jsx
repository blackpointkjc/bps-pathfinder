import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export default function NavigationCamera({ 
    isNavigating, 
    currentLocation, 
    heading, 
    speed = 0,
    upcomingManeuverDistance = null,
    onUserInteraction
}) {
    const map = useMap();
    const userInteractingRef = useRef(false);
    const interactionTimeoutRef = useRef(null);

    useEffect(() => {
        const handleInteractionStart = () => {
            userInteractingRef.current = true;
            if (onUserInteraction) onUserInteraction(true);
            
            if (interactionTimeoutRef.current) {
                clearTimeout(interactionTimeoutRef.current);
            }
        };
        
        const handleInteractionEnd = () => {
            interactionTimeoutRef.current = setTimeout(() => {
                userInteractingRef.current = false;
                if (onUserInteraction) onUserInteraction(false);
            }, 8000);
        };
        
        map.on('dragstart', handleInteractionStart);
        map.on('zoomstart', handleInteractionStart);
        map.on('dragend', handleInteractionEnd);
        map.on('zoomend', handleInteractionEnd);
        
        return () => {
            map.off('dragstart', handleInteractionStart);
            map.off('zoomstart', handleInteractionStart);
            map.off('dragend', handleInteractionEnd);
            map.off('zoomend', handleInteractionEnd);
            if (interactionTimeoutRef.current) {
                clearTimeout(interactionTimeoutRef.current);
            }
        };
    }, [map, onUserInteraction]);

    useEffect(() => {
        if (!isNavigating || !currentLocation) return;
        
        // If user is manually panning, don't auto-follow
        if (userInteractingRef.current) return;

        // Dynamic zoom based on speed
        let targetZoom = 18;
        if (speed > 45) {
            targetZoom = 16;
        } else if (speed > 25) {
            targetZoom = 17;
        }

        // Smooth zoom transition
        const currentZoom = map.getZoom();
        if (Math.abs(targetZoom - currentZoom) > 0.5) {
            map.setZoom(targetZoom, { animate: true });
        }

        // Always center on car location during navigation
        map.setView(currentLocation, map.getZoom(), {
            animate: true,
            duration: 0.3
        });

    }, [map, isNavigating, currentLocation, speed]);

    return null;
}