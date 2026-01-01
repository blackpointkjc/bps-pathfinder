import React, { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { base44 } from '@/api/base44Client';

export default function UnitHeatmap({ timeRange = 24, intensity = 0.5 }) {
    const map = useMap();
    const [heatLayer, setHeatLayer] = useState(null);

    useEffect(() => {
        const loadHeatmapData = async () => {
            try {
                // Get location history for the specified time range
                const hoursAgo = new Date(Date.now() - timeRange * 60 * 60 * 1000).toISOString();
                const locations = await base44.entities.UnitLocationHistory.filter({
                    timestamp: { $gte: hoursAgo }
                });

                if (locations && locations.length > 0) {
                    // Convert to heatmap format [lat, lng, intensity]
                    const heatData = locations.map(loc => [
                        loc.latitude,
                        loc.longitude,
                        intensity
                    ]);

                    // Remove old heat layer if exists
                    if (heatLayer) {
                        map.removeLayer(heatLayer);
                    }

                    // Create new heat layer
                    const newHeatLayer = L.heatLayer(heatData, {
                        radius: 25,
                        blur: 35,
                        maxZoom: 17,
                        max: 1.0,
                        gradient: {
                            0.0: 'blue',
                            0.5: 'lime',
                            0.7: 'yellow',
                            1.0: 'red'
                        }
                    }).addTo(map);

                    setHeatLayer(newHeatLayer);
                }
            } catch (error) {
                console.error('Error loading heatmap data:', error);
            }
        };

        loadHeatmapData();

        // Refresh every 60 seconds
        const interval = setInterval(loadHeatmapData, 60000);

        return () => {
            clearInterval(interval);
            if (heatLayer) {
                map.removeLayer(heatLayer);
            }
        };
    }, [map, timeRange, intensity]);

    return null;
}