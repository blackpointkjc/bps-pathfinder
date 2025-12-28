import React from 'react';
import { GeoJSON } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';

export default function JurisdictionBoundaries() {
    // Fetch Richmond beats
    const { data: richmondBeats } = useQuery({
        queryKey: ['richmondBeats'],
        queryFn: async () => {
            const response = await fetch(
                'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/Police_Beats/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson'
            );
            return response.json();
        },
        staleTime: Infinity,
    });

    // Fetch Chesterfield County boundary from official source
    const { data: chesterfieldBoundary } = useQuery({
        queryKey: ['chesterfieldBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://services3.arcgis.com/TsynfzBSE6sXfoLq/ArcGIS/rest/services/Administrative_ProdA/FeatureServer/13/query?outFields=*&where=1%3D1&f=geojson'
            );
            return response.json();
        },
        staleTime: Infinity,
    });

    const richmondBeatStyle = (feature) => {
        return {
            fillColor: '#3B82F6',
            fillOpacity: 0.15,
            color: '#1E40AF',
            weight: 2,
            opacity: 0.7
        };
    };

    const chesterfieldStyle = (feature) => {
        return {
            fillColor: '#22C55E',
            fillOpacity: 0.15,
            color: '#16A34A',
            weight: 2,
            opacity: 0.7
        };
    };

    const onEachRichmondFeature = (feature, layer) => {
        if (feature.properties && feature.properties.Name) {
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-blue-600">Richmond PD</p>
                    <p class="text-sm">Beat ${feature.properties.Name}</p>
                </div>
            `);
        }
    };

    const onEachChesterfieldFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-green-600">Chesterfield County PD</p>
                <p class="text-sm">County Boundary</p>
            </div>
        `);
    };

    return (
        <>
            {/* Chesterfield County Boundary */}
            {chesterfieldBoundary && (
                <GeoJSON
                    data={chesterfieldBoundary}
                    style={chesterfieldStyle}
                    onEachFeature={onEachChesterfieldFeature}
                />
            )}

            {/* Richmond Beats */}
            {richmondBeats && (
                <GeoJSON
                    data={richmondBeats}
                    style={richmondBeatStyle}
                    onEachFeature={onEachRichmondFeature}
                />
            )}
        </>
    );
}