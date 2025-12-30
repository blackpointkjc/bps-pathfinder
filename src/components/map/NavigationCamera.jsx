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

        // Dynamic zoom based on speed - closer zoom for navigation
        let targetZoom = 18;
        if (speed > 45) {
            targetZoom = 17;
        } else if (speed > 25) {
            targetZoom = 18;
        } else {
            targetZoom = 19;
        }

        // Always center on car location with proper zoom during navigation
        map.setView(currentLocation, targetZoom, {
            animate: true,
            duration: 0.5
        });

    }, [map, isNavigating, currentLocation, speed]);

    return null;
}