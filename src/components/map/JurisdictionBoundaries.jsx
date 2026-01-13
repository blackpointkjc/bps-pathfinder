import React from 'react';
import { GeoJSON } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';

export default function JurisdictionBoundaries({ filters = {} }) {
    const { richmondBeat = 'all', henricoDistrict = 'all', chesterfieldDistrict = 'all', hanoverDistrict = 'all' } = filters;
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

    // Fetch Hanover County magisterial districts
    const { data: hanoverDistricts } = useQuery({
        queryKey: ['hanoverDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://services2.arcgis.com/sKZWgJlU6SekCzQV/arcgis/rest/services/Magisterial_Districts/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson'
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
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const chesterfieldStyle = (feature) => {
        return {
            fillColor: '#22C55E',
            fillOpacity: 0.15,
            color: '#16A34A',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const henricoDistrictStyle = (feature) => {
        return {
            fillColor: '#A855F7',
            fillOpacity: 0.15,
            color: '#7C3AED',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const hanoverDistrictStyle = (feature) => {
        return {
            fillColor: '#FFEB3B',
            fillOpacity: 0.2,
            color: '#FDD835',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
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
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachChesterfieldDistrictFeature = (feature, layer) => {
        if (feature.properties) {
            // Log all properties to find the correct key
            console.log('Chesterfield District Properties:', feature.properties);
            
            // Check all possible property names for district name
            const districtName = feature.properties.MAG_DIST || 
                                feature.properties.NAME || 
                                feature.properties.DISTRICT || 
                                feature.properties.Magisterial_District ||
                                feature.properties.MagDist ||
                                feature.properties.MAG_DIST_NAME ||
                                feature.properties.DISTRICTNAME ||
                                feature.properties.District_Name ||
                                feature.properties.Mag_Dist ||
                                feature.properties.District ||
                                (Object.values(feature.properties).find(v => typeof v === 'string' && v.length > 0 && v.length < 30) || 'Unknown');
            
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
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachChesterfieldBoundaryFeature = (feature, layer) => {
        // No popup for county boundary to avoid overlap with districts
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
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachHanoverFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.MagDistName || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
            
            // Filter by district name if specified
            if (hanoverDistrict !== 'all' && districtName !== hanoverDistrict) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-yellow-600">Hanover County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    // Filter GeoJSON data based on filters
    const filteredRichmondBeats = richmondBeats && richmondBeat !== 'all'
        ? {
            ...richmondBeats,
            features: richmondBeats.features.filter(f => {
                const beatName = f.properties?.Name;
                if (!beatName) return false;
                // Match beat prefix (e.g., 111 matches 111A, 111B, 111C)
                return beatName.startsWith(richmondBeat);
            })
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
                const name = f.properties?.MAG_DIST || 
                           f.properties?.NAME || 
                           f.properties?.DISTRICT || 
                           f.properties?.Magisterial_District ||
                           f.properties?.MagDist ||
                           f.properties?.MAG_DIST_NAME ||
                           f.properties?.DISTRICTNAME ||
                           f.properties?.District_Name ||
                           f.properties?.Mag_Dist ||
                           f.properties?.District ||
                           (Object.values(f.properties || {}).find(v => typeof v === 'string' && v.length > 0 && v.length < 30));
                return name === chesterfieldDistrict;
            })
        }
        : chesterfieldDistricts;

    const filteredHanoverDistricts = hanoverDistricts && hanoverDistrict !== 'all'
        ? {
            ...hanoverDistricts,
            features: hanoverDistricts.features.filter(f => {
                const name = f.properties?.MagDistName || f.properties?.NAME || f.properties?.DISTRICT;
                return name === hanoverDistrict;
            })
        }
        : hanoverDistricts;

    return (
        <>
            {/* Chesterfield County Districts - render first so they're on top */}
            {filteredChesterfieldDistricts && (
                <GeoJSON
                    key={`chesterfield-districts-${chesterfieldDistrict}`}
                    data={filteredChesterfieldDistricts}
                    style={chesterfieldStyle}
                    onEachFeature={onEachChesterfieldDistrictFeature}
                    interactive={true}
                />
            )}

            {/* Chesterfield County Boundary */}
            {chesterfieldBoundary && (
                <GeoJSON
                    key="chesterfield-boundary"
                    data={chesterfieldBoundary}
                    style={chesterfieldStyle}
                    onEachFeature={onEachChesterfieldBoundaryFeature}
                    interactive={false}
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

            {/* Hanover County Districts */}
            {filteredHanoverDistricts && (
                <GeoJSON
                    key={`hanover-${hanoverDistrict}`}
                    data={filteredHanoverDistricts}
                    style={hanoverDistrictStyle}
                    onEachFeature={onEachHanoverFeature}
                />
            )}
        </>
    );
}