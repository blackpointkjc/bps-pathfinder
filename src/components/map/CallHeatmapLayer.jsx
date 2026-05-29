import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function CallHeatmapLayer({ calls, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !calls.length) return;

    // Filter calls with valid coordinates
    const points = calls.filter(c => c.latitude && c.longitude);
    if (!points.length) return;

    // Create a grid-based density map
    const cellSize = 0.01; // ~1km cells at equator
    const density = {};

    points.forEach(call => {
      const cellKey = `${Math.floor(call.latitude / cellSize)},${Math.floor(call.longitude / cellSize)}`;
      density[cellKey] = (density[cellKey] || 0) + 1;
    });

    // Calculate max density for color normalization
    const maxDensity = Math.max(...Object.values(density));

    // Create circle markers for each cell
    const layerGroup = L.layerGroup();
    Object.entries(density).forEach(([key, count]) => {
      const [latCell, lngCell] = key.split(',').map(Number);
      const lat = latCell * cellSize + cellSize / 2;
      const lng = lngCell * cellSize + cellSize / 2;

      // Color gradient: blue (low) → yellow (medium) → red (high)
      const intensity = count / maxDensity;
      let color;
      if (intensity < 0.33) {
        color = `rgb(0, 0, ${Math.round(255 * (1 - intensity / 0.33))})`;
      } else if (intensity < 0.66) {
        const t = (intensity - 0.33) / 0.33;
        color = `rgb(${Math.round(255 * t)}, 255, 0)`;
      } else {
        const t = (intensity - 0.66) / 0.34;
        color = `rgb(255, ${Math.round(255 * (1 - t))}, 0)`;
      }

      const opacity = 0.3 + intensity * 0.4;
      const radius = 20 + intensity * 30;

      L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        fillOpacity: opacity,
        weight: 1,
        opacity: opacity,
        color: color
      }).bindPopup(`${count} incident${count > 1 ? 's' : ''}`).addTo(layerGroup);
    });

    layerGroup.addTo(map);
    return () => {
      map.removeLayer(layerGroup);
    };
  }, [calls, enabled, map]);

  return null;
}