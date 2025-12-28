import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

export default function JurisdictionBoundaries() {
    const [richmondBeats, setRichmondBeats] = useState(null);

    useEffect(() => {
        fetchRichmondBeats();
    }, []);

    const fetchRichmondBeats = async () => {
        try {
            const response = await fetch(
                'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/Police_Beats/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            setRichmondBeats(data);
        } catch (error) {
            console.error('Error fetching Richmond police beats:', error);
        }
    };

    const beatStyle = (feature) => {
        return {
            fillColor: '#3B82F6',
            fillOpacity: 0.1,
            color: '#1E40AF',
            weight: 2,
            opacity: 0.6
        };
    };

    const onEachFeature = (feature, layer) => {
        if (feature.properties && feature.properties.Name) {
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-blue-600">Richmond PD</p>
                    <p class="text-sm">Beat ${feature.properties.Name}</p>
                </div>
            `);
        }
    };

    return (
        <>
            {richmondBeats && (
                <GeoJSON
                    data={richmondBeats}
                    style={beatStyle}
                    onEachFeature={onEachFeature}
                />
            )}
        </>
    );
}