import React, { useEffect, useState } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow } from 'date-fns';

export default function HistoricalIncidentOverlay({ showHistorical, daysBack = 7 }) {
    const [historicalCalls, setHistoricalCalls] = useState([]);

    useEffect(() => {
        if (showHistorical) {
            fetchHistoricalCalls();
        }
    }, [showHistorical, daysBack]);

    const fetchHistoricalCalls = async () => {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);

            const calls = await base44.entities.CallHistory.list('-archived_date', 500);
            
            const filteredCalls = calls.filter(call => {
                if (!call.latitude || !call.longitude) return false;
                if (!call.archived_date) return true;
                
                const archivedDate = new Date(call.archived_date);
                return archivedDate >= cutoffDate;
            });

            setHistoricalCalls(filteredCalls);
        } catch (error) {
            console.error('Error fetching historical calls:', error);
        }
    };

    const getIncidentColor = (incident) => {
        const incidentLower = incident?.toLowerCase() || '';
        
        // Critical incidents - Red
        if (incidentLower.includes('shooting') || incidentLower.includes('stabbing') ||
            incidentLower.includes('assault with deadly') || incidentLower.includes('shots fired')) {
            return '#DC2626';
        }
        
        // High priority - Orange
        if (incidentLower.includes('assault') || incidentLower.includes('robbery') ||
            incidentLower.includes('burglary') || incidentLower.includes('domestic')) {
            return '#F59E0B';
        }
        
        // Medium priority - Yellow
        if (incidentLower.includes('suspicious') || incidentLower.includes('disturbance') ||
            incidentLower.includes('alarm')) {
            return '#EAB308';
        }
        
        // Fire/EMS - Blue
        if (incidentLower.includes('fire') || incidentLower.includes('ems') || 
            incidentLower.includes('medical')) {
            return '#3B82F6';
        }
        
        // Default - Gray
        return '#6B7280';
    };

    if (!showHistorical) return null;

    return (
        <>
            {historicalCalls.map((call, idx) => (
                <CircleMarker
                    key={`historical-${idx}`}
                    center={[call.latitude, call.longitude]}
                    radius={5}
                    pathOptions={{
                        color: getIncidentColor(call.incident),
                        fillColor: getIncidentColor(call.incident),
                        fillOpacity: 0.5,
                        weight: 1,
                        opacity: 0.7
                    }}
                >
                    <Popup>
                        <div className="text-xs max-w-[200px]">
                            <p className="font-bold mb-1">{call.incident}</p>
                            <p className="text-gray-600 mb-1">{call.location}</p>
                            <p className="text-gray-500 text-[10px]">
                                {call.agency} • {call.time_received}
                            </p>
                            {call.archived_date && (
                                <p className="text-gray-400 text-[10px] mt-1">
                                    {formatDistanceToNow(new Date(call.archived_date), { addSuffix: true })}
                                </p>
                            )}
                        </div>
                    </Popup>
                </CircleMarker>
            ))}
        </>
    );
}