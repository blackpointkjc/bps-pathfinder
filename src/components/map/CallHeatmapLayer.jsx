import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { base44 } from '@/api/base44Client';

const RADIUS = 40;
const BLUR = 20;

// Color stops: density 0→1 mapped to blue→cyan→green→yellow→red
function densityToColor(d) {
    const stops = [
        [0.00, [0,   0,   255, 0   ]],
        [0.20, [0,   180, 255, 0.15]],
        [0.40, [0,   255, 100, 0.35]],
        [0.60, [255, 255, 0,   0.55]],
        [0.80, [255, 140, 0,   0.75]],
        [1.00, [255, 0,   0,   0.90]],
    ];
    for (let i = 1; i < stops.length; i++) {
        const [t0, c0] = stops[i - 1];
        const [t1, c1] = stops[i];
        if (d <= t1) {
            const f = (d - t0) / (t1 - t0);
            return [
                Math.round(c0[0] + f * (c1[0] - c0[0])),
                Math.round(c0[1] + f * (c1[1] - c0[1])),
                Math.round(c0[2] + f * (c1[2] - c0[2])),
                c0[3]  + f * (c1[3]  - c0[3]),
            ];
        }
    }
    return [255, 0, 0, 0.90];
}

function drawHeatmap(canvas, map, points) {
    const size = map.getSize();
    canvas.width  = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!points.length) return;

    // --- Pass 1: draw density onto an offscreen canvas using additive blending ---
    const off = document.createElement('canvas');
    off.width  = size.x;
    off.height = size.y;
    const octx = off.getContext('2d');
    octx.globalCompositeOperation = 'lighter';

    points.forEach(([lat, lng]) => {
        const p = map.latLngToContainerPoint([lat, lng]);
        if (p.x < -RADIUS * 2 || p.x > size.x + RADIUS * 2 ||
            p.y < -RADIUS * 2 || p.y > size.y + RADIUS * 2) return;

        const g = octx.createRadialGradient(p.x, p.y, 0, p.x, p.y, RADIUS);
        g.addColorStop(0,   'rgba(255,255,255,0.18)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.06)');
        g.addColorStop(1,   'rgba(0,0,0,0)');
        octx.beginPath();
        octx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2);
        octx.fillStyle = g;
        octx.fill();
    });

    // --- Pass 2: colorize the density map pixel-by-pixel ---
    const imageData = octx.getImageData(0, 0, size.x, size.y);
    const data = imageData.data;
    const out  = ctx.createImageData(size.x, size.y);
    const outD = out.data;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i] / 255; // white channel used as density proxy
        if (alpha < 0.01) continue;
        const density = Math.min(alpha * 2.5, 1); // scale so sparse areas show up
        const [r, g, b, a] = densityToColor(density);
        outD[i]     = r;
        outD[i + 1] = g;
        outD[i + 2] = b;
        outD[i + 3] = Math.round(a * 255);
    }

    ctx.putImageData(out, 0, 0);

    // Soft blur pass using shadow trick
    ctx.filter = `blur(${BLUR}px)`;
    const tmp = document.createElement('canvas');
    tmp.width = size.x; tmp.height = size.y;
    tmp.getContext('2d').putImageData(out, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none';
}

export default function CallHeatmapLayer({ enabled }) {
    const map = useMap();
    const canvasRef  = useRef(null);
    const pointsRef  = useRef([]);
    const frameRef   = useRef(null);

    const redraw = () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            if (canvasRef.current && map) {
                drawHeatmap(canvasRef.current, map, pointsRef.current);
            }
        });
    };

    useEffect(() => {
        if (!enabled) return;
        Promise.all([
            base44.entities.CallHistory.list('-created_date', 2000),
            base44.entities.DispatchCall.list('-created_date', 500),
        ]).then(([history, active]) => {
            pointsRef.current = [...history, ...active]
                .filter(c => c.latitude && c.longitude)
                .map(c => [c.latitude, c.longitude]);
            redraw();
        }).catch(() => {});
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null; }
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450;';
        map.getContainer().appendChild(canvas);
        canvasRef.current = canvas;

        const events = ['moveend', 'zoomend', 'viewreset', 'resize'];
        events.forEach(e => map.on(e, redraw));

        if (pointsRef.current.length) redraw();

        return () => {
            events.forEach(e => map.off(e, redraw));
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            canvas.remove();
            canvasRef.current = null;
        };
    }, [enabled, map]);

    return null;
}