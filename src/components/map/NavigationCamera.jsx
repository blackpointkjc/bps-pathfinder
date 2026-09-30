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
    const lastCameraRef = useRef({ center: null, zoom: null, at: 0 });

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

        // Stable follow camera. The marker itself carries heading; the viewport
        // stays centered on the smoothed/route-snapped vehicle position so small
        // heading changes do not swing the whole map.
        let targetZoom = 17;
        if (speed > 55) targetZoom = 16;
        else if (speed > 35) targetZoom = 16.5;
        else if (speed > 15) targetZoom = 17;
        else targetZoom = 17.5;

        const maneuverFeet = Number(upcomingManeuverDistance);
        if (Number.isFinite(maneuverFeet)) {
            if (maneuverFeet <= 140) targetZoom = Math.max(targetZoom, 18);
            else if (maneuverFeet <= 450) targetZoom = Math.max(targetZoom, 17.5);
            else if (maneuverFeet <= 1200) targetZoom = Math.max(targetZoom, 17);
        }

        const cameraCenter = currentLocation;

        // GPS position is authoritative while navigating. Preserve the current
        // tile pyramid whenever the requested zoom is effectively unchanged;
        // panTo moves the camera with the unit without making Leaflet rebuild the
        // whole viewport/tile set on every GPS fix.
        const currentZoom = map.getZoom();
        const roundedTargetZoom = Math.max(10, Math.min(18, Math.round(targetZoom * 2) / 2));
        const toRad = value => value * Math.PI / 180;
        const centerDistance = (() => {
            const previous = lastCameraRef.current.center;
            if (!previous) return Infinity;
            const dLat = toRad(cameraCenter[0] - previous[0]);
            const dLng = toRad(cameraCenter[1] - previous[1]);
            const a = Math.sin(dLat / 2) ** 2
                + Math.cos(toRad(previous[0])) * Math.cos(toRad(cameraCenter[0])) * Math.sin(dLng / 2) ** 2;
            return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        })();
        const zoomChange = Math.abs(currentZoom - roundedTargetZoom);
        if (centerDistance < 7 && zoomChange < 0.75) return;

        lastCameraRef.current = { center: cameraCenter, zoom: roundedTargetZoom, at: Date.now() };
        if (zoomChange >= 0.75) {
            map.setView(cameraCenter, roundedTargetZoom, { animate: false, noMoveStart: true });
        } else {
            map.panTo(cameraCenter, { animate: true, duration: 0.3, easeLinearity: 0.35, noMoveStart: true });
        }

    }, [map, isNavigating, currentLocation, heading, speed, upcomingManeuverDistance]);

    return null;
}