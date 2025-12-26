import React, { useEffect, useState } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';

const CITY_DATA = [
    {
        name: 'Richmond, VA',
        color: '#FF3B30',
        fillColor: '#FF3B30',
        fillOpacity: 0.1,
        osmId: '3677820' // Richmond city relation ID
    },
    {
        name: 'Henrico County, VA',
        color: '#007AFF',
        fillColor: '#007AFF',
        fillOpacity: 0.1,
        osmId: '162105' // Henrico County relation ID
    },
    {
        name: 'Chesterfield County, VA',
        color: '#34C759',
        fillColor: '#34C759',
        fillOpacity: 0.1,
        osmId: '162106' // Chesterfield County relation ID
    }
];

export default function CityBoundaries({ disabled = false }) {
    const [boundaries, setBoundaries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (disabled) {
            setLoading(false);
            return;
        }

        const fetchBoundaries = async () => {
            try {
                const boundariesData = await Promise.all(
                    CITY_DATA.map(async (city) => {
                        try {
                            const response = await fetch(
                                `https://overpass-api.de/api/interpreter?data=[out:json];relation(${city.osmId});out geom;`
                            );
                            const data = await response.json();
                            
                            if (data.elements && data.elements.length > 0) {
                                const element = data.elements[0];
                                const coordinates = [];
                                
                                // Extract outer boundary coordinates
                                if (element.members) {
                                    element.members.forEach(member => {
                                        if (member.role === 'outer' && member.geometry) {
                                            const coords = member.geometry.map(point => [point.lat, point.lon]);
                                            coordinates.push(coords);
                                        }
                                    });
                                }
                                
                                return {
                                    ...city,
                                    coordinates: coordinates
                                };
                            }
                            return null;
                        } catch (error) {
                            console.error(`Error fetching boundary for ${city.name}:`, error);
                            return null;
                        }
                    })
                );
                
                setBoundaries(boundariesData.filter(b => b !== null && b.coordinates.length > 0));
            } catch (error) {
                console.error('Error loading city boundaries:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchBoundaries();
    }, [disabled]);

    if (disabled || loading || boundaries.length === 0) {
        return null;
    }

    return (
        <>
            {boundaries.map((boundary, idx) => (
                boundary.coordinates.map((coords, coordIdx) => (
                    <Polygon
                        key={`${idx}-${coordIdx}`}
                        positions={coords}
                        pathOptions={{
                            color: boundary.color,
                            weight: 3,
                            opacity: 0.8,
                            fillColor: boundary.fillColor,
                            fillOpacity: boundary.fillOpacity
                        }}
                    >
                        <Tooltip permanent={false} direction="center">
                            <span className="font-semibold text-sm">{boundary.name}</span>
                        </Tooltip>
                    </Polygon>
                ))
            ))}
        </>
    );
}