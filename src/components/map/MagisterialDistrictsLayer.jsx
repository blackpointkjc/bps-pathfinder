import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

export default function MagisterialDistrictsLayer() {
    const [districtData, setDistrictData] = useState(null);

    useEffect(() => {
        fetchDistricts();
    }, []);

    const fetchDistricts = async () => {
        try {
            const response = await fetch(
                'https://services2.arcgis.com/sKZWgJlU6SekCzQV/arcgis/rest/services/Magisterial_Districts/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            setDistrictData(data);
        } catch (error) {
            console.error('Error fetching magisterial districts:', error);
        }
    };

    if (!districtData) return null;

    return (
        <GeoJSON
            data={districtData}
            style={{
                fillColor: '#FFEB3B',
                fillOpacity: 0.2,
                color: '#FDD835',
                weight: 2,
                opacity: 0.8
            }}
            onEachFeature={(feature, layer) => {
                if (feature.properties && feature.properties.MagDistName) {
                    layer.bindPopup(`
                        <div style="padding: 8px;">
                            <strong style="font-size: 14px;">${feature.properties.MagDistName} District</strong>
                            <br/>
                            <span style="font-size: 12px; color: #666;">District #${feature.properties.MagDistNum || 'N/A'}</span>
                        </div>
                    `);
                }
            }}
        />
    );
}