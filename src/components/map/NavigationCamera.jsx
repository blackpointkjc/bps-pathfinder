import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { shortestHeadingDelta } from '@/lib/navigationGeometry';

export default function NavigationCamera({ isNavigating, currentLocation, heading, speed = 0, recenterLocation, recenterRevision = 0, gpsFollowEnabled = false }) {
    const map = useMap();
    const manuallyDetachedRef = useRef(false);
    const lastRecenterRevisionRef = useRef(recenterRevision);
    const lastCameraUpdateRef = useRef(0);
    const lastPosition = useRef(null);
    const lastHeading = useRef(null);
    const rotationFrame = useRef(null);
    const [resumeRevision, setResumeRevision] = useState(0);
    const lat = currentLocation?.[0], lng = currentLocation?.[1];
    const recenterLat = recenterLocation?.[0], recenterLng = recenterLocation?.[1];

    useEffect(() => {
        const container = map.getContainer();
        const pause = () => {
            manuallyDetachedRef.current = true;
            cancelAnimationFrame(rotationFrame.current);
        };
        const pointerDown = event => {
            if (!event.target?.closest?.('.leaflet-control, .leaflet-marker-icon, .leaflet-popup, button')) pause();
        };
        map.on('dragstart', pause);
        container.addEventListener('wheel', pause, { passive: true });
        container.addEventListener('pointerdown', pointerDown, { passive: true });
        return () => {
            map.off('dragstart', pause);
            container.removeEventListener('wheel', pause);
            container.removeEventListener('pointerdown', pointerDown);
        };
    }, [map]);

    useEffect(() => {
        if (!isNavigating) return;
        // Set driving scale once. Speed/turn-distance noise never resets zoom.
        map.setZoom(16, { animate: false });
        return () => {
            cancelAnimationFrame(rotationFrame.current);
            // Navigation can unmount while Leaflet panes are already removed.
            // Never stop an unmounted map: Leaflet may access _leaflet_pos.
            if (map.getContainer()?.isConnected && map._loaded) {
                try { map.stop(); map.setBearing(0); } catch (error) { console.warn('Map navigation cleanup skipped', error?.message); }
            }
        };
    }, [map, isNavigating]);

    useEffect(() => {
        if (recenterLat == null || recenterLng == null) return;
        manuallyDetachedRef.current = false;
        lastPosition.current = null;
        setResumeRevision(value => value + 1);
    }, [recenterLat, recenterLng]);

    useEffect(() => {
        if (recenterRevision === lastRecenterRevisionRef.current) return;
        lastRecenterRevisionRef.current = recenterRevision;
        manuallyDetachedRef.current = false;
        lastPosition.current = null;
        setResumeRevision(value => value + 1);
    }, [recenterRevision]);

    useEffect(() => {
        if (!isNavigating || !gpsFollowEnabled || manuallyDetachedRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (Date.now() - lastCameraUpdateRef.current < 1100) return;
        lastCameraUpdateRef.current = Date.now();
        let course = lastHeading.current;
        if (heading != null && Number.isFinite(Number(heading)) && (Number(speed) >= 5 || course == null)) {
            course = ((Number(heading) % 360) + 360) % 360;
        } else if (lastPosition.current && Number(speed) >= 5) {
            const dy = lat - lastPosition.current[0];
            const dx = (lng - lastPosition.current[1]) * Math.cos(lat * Math.PI / 180);
            if (Math.hypot(dx, dy) * 111195 > 8) course = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        }
        if (course == null) course = 0;
        // Hold small bearing variations; GNSS course can oscillate around 0/360.
        if (lastHeading.current !== null && Number(speed) < 8) course = lastHeading.current;
        else if (lastHeading.current !== null && Math.abs(shortestHeadingDelta(lastHeading.current, course)) < 11) course = lastHeading.current;
        lastHeading.current = course;
        lastPosition.current = [lat, lng];

        const startBearing = map.getBearing() || 0;
        const targetBearing = (360 - course) % 360;
        const delta = shortestHeadingDelta(startBearing, targetBearing);
        cancelAnimationFrame(rotationFrame.current);
        if (Math.abs(delta) >= 10) {
            const started = performance.now();
            const rotate = now => {
                if (!map.getContainer()?.isConnected || manuallyDetachedRef.current || !gpsFollowEnabled) return;
                const t = Math.min(1, (now - started) / 450);
                map.setBearing(startBearing + delta * (1 - (1 - t) ** 3));
                if (t < 1) rotationFrame.current = requestAnimationFrame(rotate);
            };
            rotationFrame.current = requestAnimationFrame(rotate);
        }

        // Look ahead along travel direction, leaving the vehicle below center.
        const zoom = map.getZoom();
        const aheadMeters = Math.min(220, Math.max(25, map.getSize().y * 0.18 * 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** zoom));
        const radians = course * Math.PI / 180;
        const center = [lat + Math.cos(radians) * aheadMeters / 111195, lng + Math.sin(radians) * aheadMeters / (111195 * Math.cos(lat * Math.PI / 180))];
        if (map.distance(map.getCenter(), center) > 18) {
            map.panTo(center, { animate: true, duration: 0.65, easeLinearity: 0.3, noMoveStart: true });
        }
    }, [map, isNavigating, lat, lng, heading, speed, gpsFollowEnabled, resumeRevision]);

    return null;
}
