import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

export default function VACountiesBoundaries() {
    const [countyData, setCountyData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Counties to exclude from rendering (already in JurisdictionBoundaries)
    const excludedCounties = [
        'henrico', 'richmond', 'chesterfield', 'hanover', 'spotsylvania', 
        'stafford', 'fredericksburg', 'prince william', 'manassas', 
        'manassas park', 'fairfax', 'alexandria', 'arlington', 'falls church',
        'petersburg', 'colonial heights', 'caroline', 'loudoun'
    ];

    // Generate vibrant, distinct colors for each county
    const countyColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C06C84',
        '#6C5B7B', '#355C7D', '#F67280', '#C8D6AF', '#6A2C70',
        '#08B2E3', '#EE6352', '#57A773', '#FE4A49', '#2AB7CA',
        '#FED766', '#009FB7', '#696773', '#FF6F59', '#254E58',
        '#A8E6CF', '#FFD3B6', '#FFAAA5', '#FF8B94', '#A8D8EA',
        '#AA96DA', '#FCBAD3', '#FFFFD2', '#D4A5A5', '#9896A4',
        '#5B8C5A', '#B8D4E3', '#F49FBC', '#7FB685', '#FFB997',
        '#F4845F', '#95B8D1', '#CFBAE1', '#B3E5BE', '#F9C5D5',
        '#F7E7CE', '#8DD7BF', '#FF96AD', '#C9B1BD', '#A2D5F2',
        '#07BEB8', '#3DCCC7', '#68D8D6', '#9CEAEF', '#C4FFF7',
        '#C9F0FF', '#BEE7E8', '#BFDBF7', '#8FC1E3', '#7FB5FF',
        '#5DA2D5', '#72DDF7', '#A8E6CF', '#C7CEEA', '#FFD8BE',
        '#FFB6B9', '#FAE3D9', '#BBDED6', '#8AC6D1', '#61A4BC',
        '#FFE66D', '#F6AE2D', '#F26419', '#33658A', '#86BBD8',
        '#2F4858', '#5C80BC', '#ACDBDF', '#F9F9F9', '#CED7D8',
        '#8D99AE', '#D4B2D8', '#B8B8D1', '#9FADC5', '#8892B0',
        '#6F8AB7', '#ACDBDF', '#FFE5B4', '#FCD0A1', '#D1B490',
        '#A89F91', '#9C9490', '#7D8CA3', '#536B78', '#3A435E'
    ];

    useEffect(() => {
        const fetchCountyData = async () => {
            try {
                const response = await fetch(
                    'https://services2.arcgis.com/8k2PygHqghVevhzy/arcgis/rest/services/VA_Counties/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson&outSR=4326'
                );
                const data = await response.json();
                
                // Filter out excluded counties
                const filteredFeatures = data.features.filter(feature => {
                    const countyName = feature.properties.NAME?.toLowerCase() || '';
                    return !excludedCounties.includes(countyName);
                });

                setCountyData({
                    ...data,
                    features: filteredFeatures
                });
                setLoading(false);
            } catch (error) {
                console.error('Error fetching VA counties:', error);
                setLoading(false);
            }
        };

        fetchCountyData();
    }, []);

    const getCountyColor = (index) => {
        return countyColors[index % countyColors.length];
    };

    const onEachCounty = (feature, layer) => {
        const countyName = feature.properties.NAME;
        const population = feature.properties.POP2012;
        
        layer.bindPopup(`
            <div style="padding: 8px;">
                <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 16px;">${countyName} County</h3>
                <p style="margin: 4px 0; font-size: 14px;">Population: ${population?.toLocaleString() || 'N/A'}</p>
            </div>
        `);

        layer.on({
            mouseover: (e) => {
                const layer = e.target;
                layer.setStyle({
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.5
                });
            },
            mouseout: (e) => {
                const layer = e.target;
                layer.setStyle({
                    weight: 2,
                    opacity: 0.8,
                    fillOpacity: 0.2
                });
            }
        });
    };

    const countyStyle = (feature) => {
        const index = countyData?.features.indexOf(feature) || 0;
        return {
            fillColor: getCountyColor(index),
            weight: 2,
            opacity: 0.8,
            color: '#333',
            fillOpacity: 0.2
        };
    };

    if (loading || !countyData) {
        return null;
    }

    return (
        <GeoJSON
            data={countyData}
            style={countyStyle}
            onEachFeature={onEachCounty}
        />
    );
}