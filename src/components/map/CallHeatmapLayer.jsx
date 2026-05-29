import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function CallHeatmapLayer({ calls, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !calls.length) return;

    const gridSize = 0.01; // ~1km grid cells
    const grid = {};

    // Aggregate calls into grid cells
    calls.forEach(c => {
      if (c.latitude && c.longitude) {
        const gridX = Math.floor(c.latitude / gridSize);
        const gridY = Math.floor(c.longitude / gridSize);
        const key = `${gridX},${gridY}`;
        grid[key] = (grid[key] || 0) + 1;
      }
    });

    // Find max density for color scaling
    const densities = Object.values(grid);
    const maxDensity = Math.max(...densities);
    const layers = [];

    // Create circle markers for each grid cell
    Object.entries(grid).forEach(([key, count]) => {
      const [gridX, gridY] = key.split(',').map(Number);
      const lat = gridX * gridSize + gridSize / 2;
      const lng = gridY * gridSize + gridSize / 2;
      const intensity = count / maxDensity;

      let color = '#0000ff';
      if (intensity > 0.7) color = '#ff0000';
      else if (intensity > 0.4) color = '#ffff00';
      else if (intensity > 0.2) color = '#00ff00';

      const circle = L.circleMarker([lat, lng], {
        radius: 8 + intensity * 12,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.3,
        fillOpacity: 0.3 + intensity * 0.4
      })
        .bindPopup(`Calls: ${count}`)
        .addTo(map);

      layers.push(circle);
    });

    return () => {
      layers.forEach(layer => map.removeLayer(layer));
    };
  }, [calls, enabled, map]);

  return null;
}