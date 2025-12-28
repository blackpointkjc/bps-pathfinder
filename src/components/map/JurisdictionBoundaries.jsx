import React from 'react';
import { GeoJSON } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';

export default function JurisdictionBoundaries({ filters = {} }) {
    const { richmondBeat = 'all', henricoDistrict = 'all', chesterfieldDistrict = 'all' } = filters;
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

    // Fetch Chesterfield County boundary
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

    // Fetch Chesterfield County magisterial districts
    const { data: chesterfieldDistricts } = useQuery({
        queryKey: ['chesterfieldDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://services3.arcgis.com/TsynfzBSE6sXfoLq/ArcGIS/rest/services/Administrative_ProdA/FeatureServer/9/query?outFields=*&where=1%3D1&f=geojson'
            );
            return response.json();
        },
        staleTime: Infinity,
    });

    // Fetch Henrico County magisterial districts
    const { data: henricoDistricts } = useQuery({
        queryKey: ['henricoDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://portal.henrico.gov/mapping/rest/services/Layers/Magisterial_Districts_2021/MapServer/0/query?outFields=*&where=1%3D1&f=geojson'
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

    const henricoDistrictStyle = (feature) => {
        return {
            fillColor: '#A855F7',
            fillOpacity: 0.15,
            color: '#7C3AED',
            weight: 2,
            opacity: 0.7
        };
    };

    const onEachRichmondFeature = (feature, layer) => {
        if (feature.properties && feature.properties.Name) {
            // Filter by beat number if specified
            if (richmondBeat !== 'all' && feature.properties.Name !== richmondBeat) {
                return; // Skip this feature
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-blue-600">Richmond PD</p>
                    <p class="text-sm">Beat ${feature.properties.Name}</p>
                </div>
            `);
        }
    };

    const onEachChesterfieldDistrictFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.MAG_DIST || feature.properties.NAME || feature.properties.DISTRICT || feature.properties.Magisterial_District || 'Unknown';
            
            // Filter by district name if specified
            if (chesterfieldDistrict !== 'all' && districtName !== chesterfieldDistrict) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-green-600">Chesterfield County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
        }
    };

    const onEachChesterfieldBoundaryFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-green-600">Chesterfield County</p>
                <p class="text-sm">County Boundary</p>
            </div>
        `);
    };

    const onEachHenricoFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.MAG_DIST_NAME || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
            
            // Filter by district name if specified
            if (henricoDistrict !== 'all' && districtName !== henricoDistrict) {
                return; // Skip this feature
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-purple-600">Henrico County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
        }
    };

    // Filter GeoJSON data based on filters
    const filteredRichmondBeats = richmondBeats && richmondBeat !== 'all'
        ? {
            ...richmondBeats,
            features: richmondBeats.features.filter(f => f.properties?.Name === richmondBeat)
        }
        : richmondBeats;

    const filteredHenricoDistricts = henricoDistricts && henricoDistrict !== 'all'
        ? {
            ...henricoDistricts,
            features: henricoDistricts.features.filter(f => {
                const name = f.properties?.MAG_DIST_NAME || f.properties?.NAME || f.properties?.DISTRICT;
                return name === henricoDistrict;
            })
        }
        : henricoDistricts;

    const filteredChesterfieldDistricts = chesterfieldDistricts && chesterfieldDistrict !== 'all'
        ? {
            ...chesterfieldDistricts,
            features: chesterfieldDistricts.features.filter(f => {
                const name = f.properties?.MAG_DIST || f.properties?.NAME || f.properties?.DISTRICT || f.properties?.Magisterial_District;
                return name === chesterfieldDistrict;
            })
        }
        : chesterfieldDistricts;

    return (
        <>
            {/* Chesterfield County Boundary */}
            {chesterfieldBoundary && (
                <GeoJSON
                    key="chesterfield-boundary"
                    data={chesterfieldBoundary}
                    style={chesterfieldStyle}
                    onEachFeature={onEachChesterfieldBoundaryFeature}
                />
            )}

            {/* Chesterfield County Districts */}
            {filteredChesterfieldDistricts && (
                <GeoJSON
                    key={`chesterfield-districts-${chesterfieldDistrict}`}
                    data={filteredChesterfieldDistricts}
                    style={chesterfieldStyle}
                    onEachFeature={onEachChesterfieldDistrictFeature}
                />
            )}

            {/* Henrico County Districts */}
            {filteredHenricoDistricts && (
                <GeoJSON
                    key={`henrico-${henricoDistrict}`}
                    data={filteredHenricoDistricts}
                    style={henricoDistrictStyle}
                    onEachFeature={onEachHenricoFeature}
                />
            )}

            {/* Richmond Beats */}
            {filteredRichmondBeats && (
                <GeoJSON
                    key={`richmond-${richmondBeat}`}
                    data={filteredRichmondBeats}
                    style={richmondBeatStyle}
                    onEachFeature={onEachRichmondFeature}
                />
            )}
        </>
    );
}