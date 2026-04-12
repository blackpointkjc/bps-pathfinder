import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { base44 } from '@/api/base44Client';

// Draws a radial gradient "heat blob" on a canvas for each call point
function drawHeatmap(canvas, map, points) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const RADIUS = 40;
    const BLUR = 25;

    points.forEach(([lat, lng, weight = 1]) => {
        const p = map.latLngToContainerPoint([lat, lng]);
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, RADIUS + BLUR);
        const alpha = Math.min(0.6, 0.15 * weight);
        gradient.addColorStop(0, `rgba(255, 30, 30, ${alpha})`);
        gradient.addColorStop(0.4, `rgba(255, 120, 0, ${alpha * 0.6})`);
        gradient.addColorStop(0.7, `rgba(255, 220, 0, ${alpha * 0.3})`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, RADIUS + BLUR, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    });
}

export default function CallHeatmapLayer({ enabled }) {
    const map = useMap();
    const canvasRef = useRef(null);
    const pointsRef = useRef([]);
    const overlayRef = useRef(null);

    // Load historical call data once
    useEffect(() => {
        if (!enabled) return;
        base44.entities.DispatchCall.list('-created_date', 500)
            .then(calls => {
                pointsRef.current = calls
                    .filter(c => c.latitude && c.longitude)
                    .map(c => [c.latitude, c.longitude, 1]);
                redraw();
            })
            .catch(() => {});
    }, [enabled]);

    const redraw = () => {
        if (!canvasRef.current || !map) return;
        const size = map.getSize();
        canvasRef.current.width = size.x;
        canvasRef.current.height = size.y;
        drawHeatmap(canvasRef.current, map, pointsRef.current);
    };

    useEffect(() => {
        if (!enabled) {
            if (overlayRef.current) {
                overlayRef.current.remove();
                overlayRef.current = null;
            }
            return;
        }

        // Create a canvas overlay using Leaflet's overlay pane
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '400';
        canvasRef.current = canvas;

        map.getPanes().overlayPane.appendChild(canvas);
        overlayRef.current = canvas;

        const onRedraw = () => redraw();
        map.on('moveend zoomend resize', onRedraw);

        // Initial draw if we already have data
        if (pointsRef.current.length > 0) redraw();

        return () => {
            map.off('moveend zoomend resize', onRedraw);
            canvas.remove();
            overlayRef.current = null;
        };
    }, [enabled, map]);

    return null;
}