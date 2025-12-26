import React, { useEffect, useState } from 'react';
import { Polygon, useMap } from 'react-leaflet';

const JURISDICTIONS = [
    {
        name: 'Richmond City',
        color: '#FF3B30',
        osmId: 'relation/170945'
    },
    {
        name: 'Henrico County',
        color: '#007AFF',
        osmId: 'relation/170943'
    },
    {
        name: 'Chesterfield County',
        color: '#34C759',
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
                        weight: 3,
                        opacity: 0.7,
                        fillColor: boundary.color,
                        fillOpacity: 0.05
                    }}
                />
            ))}
        </>
    );
}