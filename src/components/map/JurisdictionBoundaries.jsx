import React from 'react';
import { Polyline } from 'react-leaflet';

// Richmond City Limits - following actual roads around the perimeter
const richmondBoundary = [
    [37.5720, -77.4900], // West on Monument
    [37.5680, -77.4850],
    [37.5600, -77.4800],
    [37.5500, -77.4750], // South on Boulevard
    [37.5400, -77.4700],
    [37.5300, -77.4650],
    [37.5200, -77.4600], // Near Belvidere
    [37.5150, -77.4550],
    [37.5100, -77.4450], // East along river
    [37.5080, -77.4350],
    [37.5060, -77.4250],
    [37.5050, -77.4150],
    [37.5040, -77.4050], // Southeast
    [37.5020, -77.3950],
    [37.5000, -77.3850],
    [37.4980, -77.3750], // South Richmond
    [37.4960, -77.3700],
    [37.4950, -77.3650],
    [37.4940, -77.3600], // Turn north
    [37.4960, -77.3550],
    [37.5000, -77.3500], // Northeast
    [37.5050, -77.3470],
    [37.5120, -77.3450],
    [37.5200, -77.3440], // Northside
    [37.5300, -77.3450],
    [37.5400, -77.3460],
    [37.5500, -77.3480], // North
    [37.5600, -77.3500],
    [37.5680, -77.3520],
    [37.5720, -77.3600], // Northwest corner
    [37.5740, -77.3700],
    [37.5750, -77.3800],
    [37.5740, -77.3900], // West
    [37.5730, -77.4000],
    [37.5720, -77.4100],
    [37.5720, -77.4200],
    [37.5720, -77.4300],
    [37.5720, -77.4400],
    [37.5720, -77.4500],
    [37.5720, -77.4600],
    [37.5720, -77.4700],
    [37.5720, -77.4800],
    [37.5720, -77.4900] // Close loop
];

// Henrico County boundary (around Richmond)
const henricoBoundary = [
    [37.6500, -77.6200], // Far west
    [37.6400, -77.5800],
    [37.6300, -77.5400],
    [37.6200, -77.5000],
    [37.6100, -77.4600], // Northwest
    [37.6000, -77.4200],
    [37.5900, -77.3800],
    [37.5850, -77.3400],
    [37.5800, -77.3000], // Northeast
    [37.5750, -77.2600],
    [37.5700, -77.2400],
    [37.5650, -77.2300], // East side
    [37.5600, -77.2250],
    [37.5500, -77.2220],
    [37.5400, -77.2200],
    [37.5300, -77.2200], // Southeast
    [37.5200, -77.2220],
    [37.5100, -77.2250],
    [37.5000, -77.2300],
    [37.4900, -77.2350], // South
    [37.4800, -77.2400],
    [37.4700, -77.2450],
    [37.4650, -77.2500]
];

// Chesterfield County boundary (south of Richmond)
const chesterfieldBoundary = [
    [37.4800, -77.6800], // West
    [37.4700, -77.6400],
    [37.4600, -77.6000],
    [37.4500, -77.5600], // Southwest
    [37.4400, -77.5200],
    [37.4350, -77.4800],
    [37.4300, -77.4400],
    [37.4280, -77.4000], // South central
    [37.4260, -77.3600],
    [37.4250, -77.3200],
    [37.4240, -77.2900], // Southeast
    [37.4230, -77.2700],
    [37.4220, -77.2500]
];

export default function JurisdictionBoundaries() {
    return (
        <>
            {/* City of Richmond - Blue */}
            <Polyline
                positions={richmondBoundary}
                pathOptions={{
                    color: '#0000FF',
                    weight: 4,
                    opacity: 0.7,
                    dashArray: '10, 10',
                    lineCap: 'round',
                    lineJoin: 'round'
                }}
            />
            
            {/* Henrico County - Purple */}
            <Polyline
                positions={henricoBoundary}
                pathOptions={{
                    color: '#9333EA',
                    weight: 4,
                    opacity: 0.7,
                    dashArray: '10, 10',
                    lineCap: 'round',
                    lineJoin: 'round'
                }}
            />
            
            {/* Chesterfield County - Red */}
            <Polyline
                positions={chesterfieldBoundary}
                pathOptions={{
                    color: '#DC2626',
                    weight: 4,
                    opacity: 0.7,
                    dashArray: '10, 10',
                    lineCap: 'round',
                    lineJoin: 'round'
                }}
            />
        </>
    );
}