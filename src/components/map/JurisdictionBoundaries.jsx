import React from 'react';
import { Polygon } from 'react-leaflet';

// Approximate boundaries for Richmond, Henrico, and Chesterfield
// Richmond City boundaries
const richmondBoundary = [
    [37.5870, -77.5036],
    [37.5870, -77.3800],
    [37.4850, -77.3800],
    [37.4850, -77.4300],
    [37.5100, -77.5036],
    [37.5870, -77.5036]
];

// Henrico County boundaries (surrounding Richmond on north and east)
const henricoBoundary = [
    [37.6800, -77.6500],
    [37.6800, -77.2500],
    [37.4500, -77.2500],
    [37.4500, -77.3800],
    [37.5870, -77.3800],
    [37.5870, -77.5036],
    [37.5100, -77.5036],
    [37.4500, -77.5500],
    [37.4500, -77.6500],
    [37.6800, -77.6500]
];

// Chesterfield County boundaries (south of Richmond)
const chesterfieldBoundary = [
    [37.4850, -77.7000],
    [37.4850, -77.3500],
    [37.3000, -77.3500],
    [37.3000, -77.7000],
    [37.4850, -77.7000]
];

export default function JurisdictionBoundaries() {
    return (
        <>
            {/* City of Richmond */}
            <Polygon
                positions={richmondBoundary}
                pathOptions={{
                    color: '#0000FF',
                    weight: 3,
                    opacity: 0.8,
                    fillOpacity: 0.05,
                    fillColor: '#0000FF',
                    dashArray: '10, 10'
                }}
            />
            
            {/* Henrico County */}
            <Polygon
                positions={henricoBoundary}
                pathOptions={{
                    color: '#9333EA',
                    weight: 3,
                    opacity: 0.8,
                    fillOpacity: 0.05,
                    fillColor: '#9333EA',
                    dashArray: '10, 10'
                }}
            />
            
            {/* Chesterfield County */}
            <Polygon
                positions={chesterfieldBoundary}
                pathOptions={{
                    color: '#DC2626',
                    weight: 3,
                    opacity: 0.8,
                    fillOpacity: 0.05,
                    fillColor: '#DC2626',
                    dashArray: '10, 10'
                }}
            />
        </>
    );
}