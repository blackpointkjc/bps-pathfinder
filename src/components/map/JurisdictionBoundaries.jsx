import React from 'react';
import { GeoJSON, Polygon, Popup } from 'react-leaflet';
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

    // Chesterfield County police districts - approximate boundaries based on map
    const chesterfieldDistricts = [
        {
            name: 'Midlothian District',
            beats: ['10', '11', '12', '13', '15', '16', '17'],
            color: '#34D399',
            coordinates: [
                [37.520, -77.650],
                [37.520, -77.480],
                [37.480, -77.470],
                [37.450, -77.500],
                [37.430, -77.590],
                [37.470, -77.650],
                [37.520, -77.650]
            ]
        },
        {
            name: 'Clover Hill District',
            beats: ['30', '31', '32', '33', '59', '60', '61', '62'],
            color: '#34D399',
            coordinates: [
                [37.450, -77.500],
                [37.480, -77.470],
                [37.480, -77.390],
                [37.420, -77.360],
                [37.380, -77.420],
                [37.410, -77.520],
                [37.450, -77.500]
            ]
        },
        {
            name: 'Dale District',
            beats: ['50', '51', '52', '53', '54', '55', '56', '57', '73', '76', '77'],
            color: '#34D399',
            coordinates: [
                [37.480, -77.390],
                [37.520, -77.300],
                [37.450, -77.250],
                [37.390, -77.270],
                [37.370, -77.340],
                [37.420, -77.360],
                [37.480, -77.390]
            ]
        },
        {
            name: 'Matoaca District',
            beats: ['34', '37', '38', '81', '82'],
            color: '#34D399',
            coordinates: [
                [37.380, -77.420],
                [37.420, -77.360],
                [37.370, -77.340],
                [37.310, -77.350],
                [37.270, -77.440],
                [37.300, -77.550],
                [37.380, -77.500],
                [37.380, -77.420]
            ]
        },
        {
            name: 'Bermuda District',
            beats: ['70', '71', '72', '73', '74', '75', '78', '79', '80'],
            color: '#34D399',
            coordinates: [
                [37.370, -77.340],
                [37.390, -77.270],
                [37.350, -77.200],
                [37.280, -77.180],
                [37.220, -77.250],
                [37.240, -77.340],
                [37.310, -77.350],
                [37.370, -77.340]
            ]
        }
    ];

    const richmondBeatStyle = (feature) => {
        return {
            fillColor: '#3B82F6',
            fillOpacity: 0.15,
            color: '#1E40AF',
            weight: 2,
            opacity: 0.7
        };
    };

    const chesterfieldDistrictStyle = {
        fillColor: '#22C55E',
        fillOpacity: 0.15,
        color: '#16A34A',
        weight: 2,
        opacity: 0.7
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

    return (
        <>
            {/* Chesterfield County Districts */}
            {chesterfieldDistricts.map((district, idx) => (
                <Polygon
                    key={idx}
                    positions={district.coordinates}
                    pathOptions={chesterfieldDistrictStyle}
                >
                    <Popup>
                        <div className="p-2">
                            <p className="font-bold text-green-600">Chesterfield County PD</p>
                            <p className="text-sm">{district.name}</p>
                            <p className="text-xs text-gray-500">Beats: {district.beats.join(', ')}</p>
                        </div>
                    </Popup>
                </Polygon>
            ))}

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