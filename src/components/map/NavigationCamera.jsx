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
        if (!isNavigating || !currentLocation || userInteractingRef.current) return;

        let targetZoom;
        
        if (upcomingManeuverDistance && upcomingManeuverDistance < 400) {
            targetZoom = 19;
        } else if (upcomingManeuverDistance && upcomingManeuverDistance < 1200) {
            targetZoom = 18;
        } else if (speed < 25) {
            targetZoom = 17;
        } else if (speed < 55) {
            targetZoom = 16;
        } else {
            targetZoom = 15;
        }

        const currentZoom = map.getZoom();
        const zoomDiff = Math.abs(targetZoom - currentZoom);
        
        if (zoomDiff > 0.3) {
            map.setZoom(targetZoom, { animate: true, duration: 0.8 });
        }

        map.panTo(currentLocation, {
            animate: true,
            duration: 0.3,
            easeLinearity: 0.25,
            noMoveStart: true
        });

    }, [map, isNavigating, currentLocation, speed, upcomingManeuverDistance, heading]);

    return null;
}