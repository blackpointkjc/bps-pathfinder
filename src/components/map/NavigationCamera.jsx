import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { shortestHeadingDelta } from '@/lib/navigationGeometry';

export default function NavigationCamera({ isNavigating, currentLocation, heading, speed = 0, recenterLocation }) {
    const map = useMap();
    const pausedUntil = useRef(0);
    const lastPosition = useRef(null);
    const lastHeading = useRef(null);
    const rotationFrame = useRef(null);
    const [resumeRevision, setResumeRevision] = useState(0);
    const lat = currentLocation?.[0], lng = currentLocation?.[1];
    const recenterLat = recenterLocation?.[0], recenterLng = recenterLocation?.[1];

    useEffect(() => {
        let timer;
        const pause = () => {
            pausedUntil.current = Date.now() + 12000;
            cancelAnimationFrame(rotationFrame.current);
            clearTimeout(timer);
            timer = setTimeout(() => {
                pausedUntil.current = 0;
                lastPosition.current = null;
                setResumeRevision(value => value + 1);
            }, 12000);
        };
        const container = map.getContainer();
        map.on('dragstart', pause);
        map.on('dragend', pause);
        container.addEventListener('wheel', pause, { passive: true });
        // A tap on a call or map control must not disable GPS follow.
        return () => {
            clearTimeout(timer);
            map.off('dragstart', pause);
            map.off('dragend', pause);
            container.removeEventListener('wheel', pause);
        };
    }, [map]);

    useEffect(() => {
        if (!isNavigating) return;
        // Set driving scale once. Speed/turn-distance noise never resets zoom.
        map.setZoom(16, { animate: false });
        return () => {
            cancelAnimationFrame(rotationFrame.current);
            map.stop();
            map.setBearing(0);
        };
    }, [map, isNavigating]);

    useEffect(() => {
        if (recenterLat == null || recenterLng == null) return;
        pausedUntil.current = 0;
        lastPosition.current = null;
        setResumeRevision(value => value + 1);
    }, [recenterLat, recenterLng]);

    useEffect(() => {
        if (!isNavigating || !Number.isFinite(lat) || !Number.isFinite(lng) || Date.now() < pausedUntil.current) return;
        let course = lastHeading.current;
        if (heading != null && Number.isFinite(Number(heading)) && (Number(speed) >= 5 || course == null)) {
            course = ((Number(heading) % 360) + 360) % 360;
        } else if (lastPosition.current && Number(speed) >= 5) {
            const dy = lat - lastPosition.current[0];
            const dx = (lng - lastPosition.current[1]) * Math.cos(lat * Math.PI / 180);
            if (Math.hypot(dx, dy) * 111195 > 8) course = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        }
        if (course == null) course = 0;
        lastHeading.current = course;
        lastPosition.current = [lat, lng];

        const startBearing = map.getBearing() || 0;
        const targetBearing = (360 - course) % 360;
        const delta = shortestHeadingDelta(startBearing, targetBearing);
        cancelAnimationFrame(rotationFrame.current);
        if (Math.abs(delta) >= 2) {
            const started = performance.now();
            const rotate = now => {
                if (!map.getContainer()?.isConnected || Date.now() < pausedUntil.current) return;
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
        if (map.distance(map.getCenter(), center) > 3) {
            map.panTo(center, { animate: true, duration: 0.45, easeLinearity: 0.3, noMoveStart: true });
        }
    }, [map, isNavigating, lat, lng, heading, speed, resumeRevision]);

    return null;
}
