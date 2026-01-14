import React from 'react';
import { GeoJSON } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';

// Validate GeoJSON data
const isValidGeoJSON = (data) => {
    if (!data) return false;
    if (typeof data !== 'object') return false;
    if (!data.type) return false;
    if (data.type === 'FeatureCollection' && !Array.isArray(data.features)) return false;
    if (data.type === 'Feature' && !data.geometry) return false;
    return true;
};

export default function JurisdictionBoundaries({ filters = {} }) {
    const { richmondBeat = 'all', henricoDistrict = 'all', chesterfieldDistrict = 'all', hanoverDistrict = 'all', staffordDistrict = 'all', spotsylvaniaDistrict = 'all', colonialHeightsDistrict = 'all', petersburgDistrict = 'all', carolineDistrict = 'all', princeWilliamDistrict = 'all', arlingtonBeat = 'all', fairfaxDistrict = 'all', loudounDistrict = 'all', fallsChurchDistrict = 'all', alexandriaDistrict = 'all', manassasDistrict = 'all', dcPSA = 'all', fredericksburgDistrict = 'all', manassasParkDistrict = 'all', newKentDistrict = 'all' } = filters;
    // Fetch Richmond beats
    const { data: richmondBeats } = useQuery({
        queryKey: ['richmondBeats'],
        queryFn: async () => {
            const response = await fetch(
                'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/Police_Beats/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
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
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Stafford County election districts
    const { data: staffordDistricts } = useQuery({
        queryKey: ['staffordDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://services1.arcgis.com/qKiA6JuCrE2l72iL/arcgis/rest/services/ElectionDistricts2022/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Spotsylvania County magisterial districts
    const { data: spotsylvaniaDistricts } = useQuery({
        queryKey: ['spotsylvaniaDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://gis.spotsylvania.va.us/arcgis/rest/services/GeoHub/GeoHub/FeatureServer/20/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Colonial Heights city boundary
    const { data: colonialHeightsBoundary } = useQuery({
        queryKey: ['colonialHeightsBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=STATEFP%3D%2751%27%20AND%20BASENAME%3D%27Colonial%20Heights%27&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Petersburg city boundary
    const { data: petersburgBoundary } = useQuery({
        queryKey: ['petersburgBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=STATEFP%3D%2751%27%20AND%20BASENAME%3D%27Petersburg%27&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Caroline County boundary
    const { data: carolineDistricts } = useQuery({
        queryKey: ['carolineDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=STATEFP%3D%2751%27%20AND%20BASENAME%3D%27Caroline%27&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Prince William County magisterial districts
    const { data: princeWilliamDistricts } = useQuery({
        queryKey: ['princeWilliamDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://gisweb.pwcva.gov/arcgis/rest/services/OpenData/OpenData/MapServer/72/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Fairfax County districts
    const { data: fairfaxDistricts } = useQuery({
        queryKey: ['fairfaxDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/OpenData_S1/FeatureServer/17/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Arlington County police beats
    const { data: arlingtonBeats } = useQuery({
        queryKey: ['arlingtonBeats'],
        queryFn: async () => {
            const response = await fetch(
                'https://arlgis.arlingtonva.us/arcgis/rest/services/Open_Data/od_Police_Beat_Polygons/FeatureServer/1/query?outFields=*&where=1%3D1&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Loudoun County boundary
    const { data: loudounDistricts } = useQuery({
        queryKey: ['loudounDistricts'],
        queryFn: async () => {
            const response = await fetch(
                'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=STATEFP%3D%2751%27%20AND%20NAME%3D%27Loudoun%27&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Falls Church city boundary
    const { data: fallsChurchBoundary } = useQuery({
        queryKey: ['fallsChurchBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://services1.arcgis.com/2hmXRAz4ofcdQP6p/arcgis/rest/services/Jurisdictional_Boundary/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Alexandria city boundary
    const { data: alexandriaBoundary } = useQuery({
        queryKey: ['alexandriaBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://geoportal.alexandriava.gov/server/rest/services/City_Boundary/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Manassas city boundary
    const { data: manassasBoundary } = useQuery({
        queryKey: ['manassasBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://manassasgis.manassasva.gov/arcgis21/rest/services/Components/City_Boundary/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch DC Police Service Areas (PSAs)
    const { data: dcPSAs } = useQuery({
        queryKey: ['dcPSAs'],
        queryFn: async () => {
            const response = await fetch(
                'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Public_Safety_WebMercator/MapServer/10/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Fredericksburg city boundary
    const { data: fredericksburgBoundary } = useQuery({
        queryKey: ['fredericksburgBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://maps.fredericksburgva.gov/arcgis/rest/services/IasWorld_Base/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch Manassas Park city boundary
    const { data: manassasParkBoundary } = useQuery({
        queryKey: ['manassasParkBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://gisweb.pwcva.gov/arcgis/rest/services/OpenData/OpenData/MapServer/19/query?where=NAME%3D%27Manassas%20Park%27&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
        },
        staleTime: Infinity,
    });

    // Fetch New Kent County boundary
    const { data: newKentBoundary } = useQuery({
        queryKey: ['newKentBoundary'],
        queryFn: async () => {
            const response = await fetch(
                'https://parcelviewer.geodecisions.com/arcgis/rest/services/NewKent/Public/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson'
            );
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
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
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
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
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
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
            const data = await response.json();
            return isValidGeoJSON(data) ? data : null;
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

    const staffordDistrictStyle = (feature) => {
        return {
            fillColor: '#10B981',
            fillOpacity: 0.15,
            color: '#059669',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const spotsylvaniaDistrictStyle = (feature) => {
        return {
            fillColor: '#F97316',
            fillOpacity: 0.15,
            color: '#EA580C',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const colonialHeightsStyle = (feature) => {
        return {
            fillColor: '#8B5CF6',
            fillOpacity: 0.2,
            color: '#7C3AED',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
        };
    };

    const petersburgStyle = (feature) => {
        return {
            fillColor: '#EC4899',
            fillOpacity: 0.2,
            color: '#DB2777',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
        };
    };

    const carolineStyle = (feature) => {
        return {
            fillColor: '#14B8A6',
            fillOpacity: 0.15,
            color: '#0D9488',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const princeWilliamStyle = (feature) => {
        return {
            fillColor: '#6366F1',
            fillOpacity: 0.15,
            color: '#4F46E5',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const fairfaxStyle = (feature) => {
        return {
            fillColor: '#84CC16',
            fillOpacity: 0.15,
            color: '#65A30D',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const arlingtonStyle = (feature) => {
        return {
            fillColor: '#F59E0B',
            fillOpacity: 0.15,
            color: '#D97706',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const loudounStyle = (feature) => {
        return {
            fillColor: '#06B6D4',
            fillOpacity: 0.15,
            color: '#0891B2',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const fallsChurchStyle = (feature) => {
        return {
            fillColor: '#EC4899',
            fillOpacity: 0.2,
            color: '#DB2777',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
        };
    };

    const alexandriaStyle = (feature) => {
        return {
            fillColor: '#8B5CF6',
            fillOpacity: 0.2,
            color: '#7C3AED',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
        };
    };

    const manassasStyle = (feature) => {
        return {
            fillColor: '#F59E0B',
            fillOpacity: 0.2,
            color: '#D97706',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
        };
    };

    const dcPSAStyle = (feature) => {
        return {
            fillColor: '#3B82F6',
            fillOpacity: 0.15,
            color: '#1E40AF',
            weight: 2,
            opacity: 0.7,
            className: 'clickable-boundary'
        };
    };

    const fredericksburgStyle = (feature) => {
        return {
            fillColor: '#3B82F6',
            fillOpacity: 0.25,
            color: '#1D4ED8',
            weight: 2.5,
            opacity: 0.9,
            className: 'clickable-boundary'
        };
    };

    const manassasParkStyle = (feature) => {
        return {
            fillColor: '#F472B6',
            fillOpacity: 0.2,
            color: '#EC4899',
            weight: 2,
            opacity: 0.8,
            className: 'clickable-boundary'
        };
    };

    const newKentStyle = (feature) => {
        return {
            fillColor: '#34D399',
            fillOpacity: 0.15,
            color: '#10B981',
            weight: 2,
            opacity: 0.7,
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

    const onEachStaffordFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.DistrictNa || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
            
            // Filter by district name if specified
            if (staffordDistrict !== 'all' && districtName !== staffordDistrict) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-red-600">Stafford County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachSpotsylvaniaFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.MAGDISTNAME || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
            
            if (spotsylvaniaDistrict !== 'all' && districtName !== spotsylvaniaDistrict) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-orange-600">Spotsylvania County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachColonialHeightsFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-purple-600">Colonial Heights</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachFredericksburgFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-blue-600">Fredericksburg</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachManassasParkFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-pink-600">Manassas Park</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachNewKentFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-emerald-600">New Kent County</p>
                <p class="text-sm">County Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachPetersburgFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-pink-600">Petersburg</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachCarolineFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-teal-600">Caroline County</p>
                <p class="text-sm">County Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachFallsChurchFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-pink-600">Falls Church</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachAlexandriaFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-purple-600">Alexandria</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachManassasFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-amber-600">Manassas</p>
                <p class="text-sm">City Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
    };

    const onEachDCPSAFeature = (feature, layer) => {
        if (feature.properties) {
            const psaName = feature.properties.PSA || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
            const districtName = feature.properties.DISTRICT || '';
            
            if (dcPSA !== 'all' && psaName !== dcPSA) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-blue-600">Washington DC</p>
                    <p class="text-sm">PSA ${psaName}</p>
                    ${districtName ? `<p class="text-xs text-gray-600">${districtName} District</p>` : ''}
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachPrinceWilliamFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.ELECTDIST || feature.properties.MAGIST || feature.properties.NAME || 'Unknown';
            
            if (princeWilliamDistrict !== 'all' && districtName !== princeWilliamDistrict) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-indigo-600">Prince William County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachFairfaxFeature = (feature, layer) => {
        if (feature.properties) {
            const districtName = feature.properties.NAME || feature.properties.DISTRICT || feature.properties.MAG_DIST || 'Unknown';
            
            if (fairfaxDistrict !== 'all' && districtName !== fairfaxDistrict) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-lime-600">Fairfax County</p>
                    <p class="text-sm">${districtName} District</p>
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachArlingtonFeature = (feature, layer) => {
        if (feature.properties) {
            const beatName = feature.properties.BEAT || feature.properties.NAME || feature.properties.DISTRICT || 'Unknown';
            
            if (arlingtonBeat !== 'all' && beatName !== arlingtonBeat) {
                return;
            }
            
            layer.bindPopup(`
                <div class="p-2">
                    <p class="font-bold text-amber-600">Arlington County</p>
                    <p class="text-sm">Beat ${beatName}</p>
                </div>
            `);
            layer.on('click', () => {
                layer.openPopup();
            });
        }
    };

    const onEachLoudounFeature = (feature, layer) => {
        layer.bindPopup(`
            <div class="p-2">
                <p class="font-bold text-cyan-600">Loudoun County</p>
                <p class="text-sm">County Boundary</p>
            </div>
        `);
        layer.on('click', () => {
            layer.openPopup();
        });
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

    const filteredStaffordDistricts = staffordDistricts && staffordDistrict !== 'all'
        ? {
            ...staffordDistricts,
            features: staffordDistricts.features.filter(f => {
                const name = f.properties?.DistrictNa || f.properties?.NAME || f.properties?.DISTRICT;
                return name === staffordDistrict;
            })
        }
        : staffordDistricts;

    const filteredSpotsylvaniaDistricts = spotsylvaniaDistricts && spotsylvaniaDistrict !== 'all'
        ? {
            ...spotsylvaniaDistricts,
            features: spotsylvaniaDistricts.features.filter(f => {
                const name = f.properties?.MAGDISTNAME || f.properties?.NAME || f.properties?.DISTRICT;
                return name === spotsylvaniaDistrict;
            })
        }
        : spotsylvaniaDistricts;

    const filteredPrinceWilliamDistricts = princeWilliamDistricts && princeWilliamDistrict !== 'all'
        ? {
            ...princeWilliamDistricts,
            features: princeWilliamDistricts.features.filter(f => {
                const name = f.properties?.ELECTDIST || f.properties?.MAGIST || f.properties?.NAME;
                return name === princeWilliamDistrict;
            })
        }
        : princeWilliamDistricts;

    const filteredFairfaxDistricts = fairfaxDistricts && fairfaxDistrict !== 'all'
        ? {
            ...fairfaxDistricts,
            features: fairfaxDistricts.features.filter(f => {
                const name = f.properties?.NAME || f.properties?.DISTRICT || f.properties?.MAG_DIST;
                return name === fairfaxDistrict;
            })
        }
        : fairfaxDistricts;

    const filteredArlingtonBeats = arlingtonBeats && arlingtonBeat !== 'all'
        ? {
            ...arlingtonBeats,
            features: arlingtonBeats.features.filter(f => {
                const name = f.properties?.BEAT || f.properties?.NAME || f.properties?.DISTRICT;
                return name === arlingtonBeat;
            })
        }
        : arlingtonBeats;





    const filteredDCPSAs = dcPSAs && dcPSA !== 'all'
        ? {
            ...dcPSAs,
            features: dcPSAs.features.filter(f => {
                const name = f.properties?.PSA || f.properties?.NAME || f.properties?.DISTRICT;
                return name === dcPSA;
            })
        }
        : dcPSAs;



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

            {/* Stafford County Districts */}
            {filteredStaffordDistricts && (
                <GeoJSON
                    key={`stafford-${staffordDistrict}`}
                    data={filteredStaffordDistricts}
                    style={staffordDistrictStyle}
                    onEachFeature={onEachStaffordFeature}
                />
            )}

            {/* Spotsylvania County Districts */}
            {filteredSpotsylvaniaDistricts && (
                <GeoJSON
                    key={`spotsylvania-${spotsylvaniaDistrict}`}
                    data={filteredSpotsylvaniaDistricts}
                    style={spotsylvaniaDistrictStyle}
                    onEachFeature={onEachSpotsylvaniaFeature}
                />
            )}

            {/* Colonial Heights City */}
            {colonialHeightsBoundary && (
                <GeoJSON
                    key="colonial-heights"
                    data={colonialHeightsBoundary}
                    style={colonialHeightsStyle}
                    onEachFeature={onEachColonialHeightsFeature}
                />
            )}

            {/* Petersburg City */}
            {petersburgBoundary && (
                <GeoJSON
                    key="petersburg"
                    data={petersburgBoundary}
                    style={petersburgStyle}
                    onEachFeature={onEachPetersburgFeature}
                />
            )}

            {/* Caroline County */}
            {carolineDistricts && (
                <GeoJSON
                    key="caroline"
                    data={carolineDistricts}
                    style={carolineStyle}
                    onEachFeature={onEachCarolineFeature}
                />
            )}

            {/* Prince William County */}
            {filteredPrinceWilliamDistricts && (
                <GeoJSON
                    key={`prince-william-${princeWilliamDistrict}`}
                    data={filteredPrinceWilliamDistricts}
                    style={princeWilliamStyle}
                    onEachFeature={onEachPrinceWilliamFeature}
                />
            )}

            {/* Fairfax County */}
            {filteredFairfaxDistricts && (
                <GeoJSON
                    key={`fairfax-${fairfaxDistrict}`}
                    data={filteredFairfaxDistricts}
                    style={fairfaxStyle}
                    onEachFeature={onEachFairfaxFeature}
                />
            )}

            {/* Arlington County */}
            {filteredArlingtonBeats && (
                <GeoJSON
                    key={`arlington-${arlingtonBeat}`}
                    data={filteredArlingtonBeats}
                    style={arlingtonStyle}
                    onEachFeature={onEachArlingtonFeature}
                />
            )}

            {/* Loudoun County */}
            {loudounDistricts && (
                <GeoJSON
                    key="loudoun"
                    data={loudounDistricts}
                    style={loudounStyle}
                    onEachFeature={onEachLoudounFeature}
                />
            )}

            {/* Falls Church City */}
            {fallsChurchBoundary && (
                <GeoJSON
                    key="falls-church"
                    data={fallsChurchBoundary}
                    style={fallsChurchStyle}
                    onEachFeature={onEachFallsChurchFeature}
                />
            )}

            {/* Alexandria City */}
            {alexandriaBoundary && (
                <GeoJSON
                    key="alexandria"
                    data={alexandriaBoundary}
                    style={alexandriaStyle}
                    onEachFeature={onEachAlexandriaFeature}
                />
            )}

            {/* Manassas City */}
            {manassasBoundary && (
                <GeoJSON
                    key="manassas"
                    data={manassasBoundary}
                    style={manassasStyle}
                    onEachFeature={onEachManassasFeature}
                />
            )}

            {/* Washington DC PSAs */}
            {filteredDCPSAs && (
                <GeoJSON
                    key={`dc-psa-${dcPSA}`}
                    data={filteredDCPSAs}
                    style={dcPSAStyle}
                    onEachFeature={onEachDCPSAFeature}
                />
            )}

            {/* Fredericksburg City */}
            {fredericksburgBoundary && (
                <GeoJSON
                    key="fredericksburg"
                    data={fredericksburgBoundary}
                    style={fredericksburgStyle}
                    onEachFeature={onEachFredericksburgFeature}
                />
            )}

            {/* Manassas Park City */}
            {manassasParkBoundary && (
                <GeoJSON
                    key="manassas-park"
                    data={manassasParkBoundary}
                    style={manassasParkStyle}
                    onEachFeature={onEachManassasParkFeature}
                />
            )}

            {/* New Kent County */}
            {newKentBoundary && (
                <GeoJSON
                    key="new-kent"
                    data={newKentBoundary}
                    style={newKentStyle}
                    onEachFeature={onEachNewKentFeature}
                />
            )}
        </>
    );
}