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

        // Google-style follow camera: look slightly ahead of the moving unit so
        // more of the upcoming road is visible while preserving nearby officers.
        let targetZoom = 18;
        if (speed > 55) targetZoom = 16.8;
        else if (speed > 35) targetZoom = 17.2;
        else if (speed > 15) targetZoom = 17.8;
        else targetZoom = 18.5;

        const validHeading = Number.isFinite(Number(heading));
        const lookAheadMeters = Math.min(140, Math.max(35, Number(speed || 0) * 2.2));
        let cameraCenter = currentLocation;
        if (validHeading) {
            const radians = Number(heading) * Math.PI / 180;
            const latOffset = (lookAheadMeters * Math.cos(radians)) / 111320;
            const lngScale = Math.max(0.2, Math.cos(currentLocation[0] * Math.PI / 180));
            const lngOffset = (lookAheadMeters * Math.sin(radians)) / (111320 * lngScale);
            cameraCenter = [currentLocation[0] + latOffset, currentLocation[1] + lngOffset];
        }

        map.flyTo(cameraCenter, targetZoom, {
            animate: true,
            duration: 0.35,
            easeLinearity: 0.35
        });

    }, [map, isNavigating, currentLocation, heading, speed]);

    return null;
}