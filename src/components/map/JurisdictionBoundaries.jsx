import React, { useEffect, useState } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const JURISDICTIONS = [
    {
        name: 'Richmond City',
        color: '#DC2626',
        fillColor: '#FEE2E2',
        osmId: 'relation/170945'
    },
    {
        name: 'Henrico County',
        color: '#2563EB',
        fillColor: '#DBEAFE',
        osmId: 'relation/170943'
    },
    {
        name: 'Chesterfield County',
        color: '#16A34A',
        fillColor: '#DCFCE7',
        osmId: 'relation/170935'
    }
];

export default function JurisdictionBoundaries() {
    const [boundaries, setBoundaries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBoundaries();
    }, []);

    const fetchBoundaries = async () => {
        try {
            const boundaryData = await Promise.all(
                JURISDICTIONS.map(async (jurisdiction) => {
                    try {
                        // Fetch from Overpass API
                        const query = `[out:json];${jurisdiction.osmId};out geom;`;
                        const response = await fetch(
                            `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
                        );
                        const data = await response.json();
                        
                        if (data.elements && data.elements.length > 0) {
                            const element = data.elements[0];
                            const coords = [];
                            
                            if (element.members) {
                                // Handle relation with multiple ways
                                element.members.forEach(member => {
                                    if (member.geometry) {
                                        member.geometry.forEach(point => {
                                            coords.push([point.lat, point.lon]);
                                        });
                                    }
                                });
                            } else if (element.geometry) {
                                // Handle simple way
                                element.geometry.forEach(point => {
                                    coords.push([point.lat, point.lon]);
                                });
                            }
                            
                            return {
                                name: jurisdiction.name,
                                color: jurisdiction.color,
                                fillColor: jurisdiction.fillColor,
                                coordinates: coords
                            };
                        }
                        return null;
                    } catch (error) {
                        console.error(`Error fetching ${jurisdiction.name}:`, error);
                        return null;
                    }
                })
            );
            
            setBoundaries(boundaryData.filter(b => b !== null && b.coordinates.length > 0));
        } catch (error) {
            console.error('Error fetching boundaries:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading || boundaries.length === 0) {
        return null;
    }

    return (
        <>
            {boundaries.map((boundary, index) => (
                <Polygon
                    key={index}
                    positions={boundary.coordinates}
                    pathOptions={{
                        color: boundary.color,
                        weight: 5,
                        opacity: 1,
                        fillColor: boundary.fillColor,
                        fillOpacity: 0.2,
                        dashArray: '12, 6',
                        lineCap: 'round',
                        lineJoin: 'round'
                    }}
                >
                    <Tooltip permanent direction="center" className="jurisdiction-label" opacity={1}>
                        <div style={{
                            background: 'white',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            color: boundary.color,
                            fontSize: '14px',
                            border: `3px solid ${boundary.color}`,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            {boundary.name}
                        </div>
                    </Tooltip>
                </Polygon>
            ))}
        </>
    );
}