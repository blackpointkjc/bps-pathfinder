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
            }, 60000);
        };
        
        // Only genuine manual interaction pauses follow mode. Leaflet zoomstart
        // also fires when Pathfinder changes zoom programmatically, which made the
        // navigation camera pause itself after its own GPS update.
        map.on('dragstart', handleInteractionStart);
        map.on('dragend', handleInteractionEnd);
        const container = map.getContainer();
        container?.addEventListener('wheel', handleInteractionStart, { passive: true });
        container?.addEventListener('pointerdown', handleInteractionStart, { passive: true });
        container?.addEventListener('pointerup', handleInteractionEnd, { passive: true });
        
        return () => {
            map.off('dragstart', handleInteractionStart);
            map.off('dragend', handleInteractionEnd);
            const container = map.getContainer();
            container?.removeEventListener('wheel', handleInteractionStart);
            container?.removeEventListener('pointerdown', handleInteractionStart);
            container?.removeEventListener('pointerup', handleInteractionEnd);
            if (interactionTimeoutRef.current) {
                clearTimeout(interactionTimeoutRef.current);
            }
        };
    }, [map, onUserInteraction]);

    useEffect(() => {
        if (!isNavigating || !currentLocation) return;
        
        // If user is manually panning/zooming, don't auto-follow. Keep this long
        // enough that an officer can zoom out for situational awareness without
        // Pathfinder immediately snapping back in on the next GPS fix.
        if (userInteractingRef.current) return;

        // Google-style follow camera: look slightly ahead of the moving unit so
        // more of the upcoming road is visible while preserving nearby officers.
        let targetZoom = 18;
        if (speed > 55) targetZoom = 16.8;
        else if (speed > 35) targetZoom = 17.2;
        else if (speed > 15) targetZoom = 17.8;
        else targetZoom = 18.4;

        const maneuverFeet = Number(upcomingManeuverDistance);
        if (Number.isFinite(maneuverFeet)) {
            if (maneuverFeet <= 140) targetZoom = Math.max(targetZoom, 19);
            else if (maneuverFeet <= 450) targetZoom = Math.max(targetZoom, 18.6);
            else if (maneuverFeet <= 1200) targetZoom = Math.max(targetZoom, 18.1);
        }

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

        // GPS position is authoritative while navigating. Preserve the current
        // tile pyramid whenever the requested zoom is effectively unchanged;
        // panTo moves the camera with the unit without making Leaflet rebuild the
        // whole viewport/tile set on every GPS fix.
        const currentZoom = map.getZoom();
        const roundedTargetZoom = Math.round(targetZoom * 2) / 2;
        if (Math.abs(currentZoom - roundedTargetZoom) >= 0.45) {
            map.setView(cameraCenter, roundedTargetZoom, { animate: false });
        } else {
            map.panTo(cameraCenter, { animate: false, noMoveStart: true });
        }

    }, [map, isNavigating, currentLocation, heading, speed, upcomingManeuverDistance]);

    return null;
}