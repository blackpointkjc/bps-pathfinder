import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { base44 } from '@/api/base44Client';

function drawHeatmap(canvas, map, points) {
    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const RADIUS = 35;

    points.forEach(([lat, lng]) => {
        const p = map.latLngToContainerPoint([lat, lng]);
        // Skip points far outside viewport
        if (p.x < -RADIUS || p.x > size.x + RADIUS || p.y < -RADIUS || p.y > size.y + RADIUS) return;

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, RADIUS);
        gradient.addColorStop(0,   'rgba(255, 30,  30,  0.55)');
        gradient.addColorStop(0.4, 'rgba(255, 120, 0,   0.30)');
        gradient.addColorStop(0.7, 'rgba(255, 220, 0,   0.15)');
        gradient.addColorStop(1,   'rgba(0,   0,   0,   0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    });
}

export default function CallHeatmapLayer({ enabled }) {
    const map = useMap();
    const canvasRef = useRef(null);
    const pointsRef = useRef([]);

    const redraw = () => {
        if (!canvasRef.current || !map || pointsRef.current.length === 0) return;
        drawHeatmap(canvasRef.current, map, pointsRef.current);
    };

    // Load data when enabled — pulls from both historical archive and current active calls
    useEffect(() => {
        if (!enabled) return;
        Promise.all([
            base44.entities.CallHistory.list('-created_date', 2000),
            base44.entities.DispatchCall.list('-created_date', 500)
        ]).then(([history, active]) => {
            const all = [...history, ...active];
            pointsRef.current = all
                .filter(c => c.latitude && c.longitude)
                .map(c => [c.latitude, c.longitude]);
            redraw();
        }).catch(() => {});
    }, [enabled]);

    // Mount/unmount canvas, attach map events
    useEffect(() => {
        if (!enabled) {
            if (canvasRef.current) {
                canvasRef.current.remove();
                canvasRef.current = null;
            }
            return;
        }

        // Attach canvas directly to map container (not overlay pane) so no pane transform affects it
        const mapContainer = map.getContainer();
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450;';
        mapContainer.appendChild(canvas);
        canvasRef.current = canvas;

        // Redraw on every map movement/zoom event
        const events = ['move', 'zoom', 'viewreset', 'resize', 'zoomend', 'moveend'];
        events.forEach(e => map.on(e, redraw));

        if (pointsRef.current.length > 0) redraw();

        return () => {
            events.forEach(e => map.off(e, redraw));
            canvas.remove();
            canvasRef.current = null;
        };
    }, [enabled, map]);

    return null;
}