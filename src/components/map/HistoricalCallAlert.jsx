import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, History, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function HistoricalCallAlert({ location, className = "" }) {
    const [historicalCalls, setHistoricalCalls] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkHistoricalCalls();
    }, [location]);

    const checkHistoricalCalls = async () => {
        if (!location) return;
        
        setLoading(true);
        try {
            // Clean and normalize the address for comparison
            const cleanAddress = location.toLowerCase()
                .replace(/\b(block|blk)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            // Search for historical calls at this address
            const allHistory = await base44.entities.CallHistory.list('-created_date', 100);
            
            const matchingCalls = allHistory.filter(call => {
                if (!call.location) return false;
                const callLocation = call.location.toLowerCase()
                    .replace(/\b(block|blk)\b/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                // Check if addresses are similar (contains or matches)
                return callLocation.includes(cleanAddress) || cleanAddress.includes(callLocation);
            });

            // Get last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentCalls = matchingCalls.filter(call => {
                if (!call.archived_date) return false;
                return new Date(call.archived_date) >= thirtyDaysAgo;
            });

            setHistoricalCalls(recentCalls);
        } catch (error) {
            console.error('Error checking historical calls:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;
    if (historicalCalls.length === 0) return null;

    const getSeverityColor = () => {
        if (historicalCalls.length >= 5) return 'bg-red-600 text-white border-red-700';
        if (historicalCalls.length >= 3) return 'bg-orange-600 text-white border-orange-700';
        return 'bg-yellow-600 text-white border-yellow-700';
    };

    const mostRecentCall = historicalCalls[0];
    const daysSinceLastCall = mostRecentCall?.archived_date 
        ? Math.floor((new Date() - new Date(mostRecentCall.archived_date)) / (1000 * 60 * 60 * 24))
        : null;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Badge 
                        className={`${getSeverityColor()} ${className} flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity`}
                    >
                        <AlertTriangle className="w-3 h-3" />
                        <span className="font-bold">{historicalCalls.length}</span>
                        <History className="w-3 h-3" />
                    </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                    <div className="space-y-2">
                        <p className="font-semibold text-sm">
                            🚨 {historicalCalls.length} Previous Call{historicalCalls.length !== 1 ? 's' : ''} at this Location
                        </p>
                        {daysSinceLastCall !== null && (
                            <p className="text-xs text-gray-600 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last call: {daysSinceLastCall === 0 ? 'Today' : `${daysSinceLastCall} day${daysSinceLastCall !== 1 ? 's' : ''} ago`}
                            </p>
                        )}
                        <div className="border-t pt-2 space-y-1 max-h-48 overflow-y-auto">
                            <p className="text-xs font-semibold text-gray-700">Recent History (Last 30 days):</p>
                            {historicalCalls.slice(0, 5).map((call, idx) => (
                                <div key={idx} className="text-xs text-gray-600 bg-gray-50 p-1.5 rounded">
                                    <span className="font-semibold">{call.incident}</span>
                                    {call.time_received && (
                                        <span className="text-gray-500"> • {call.time_received}</span>
                                    )}
                                </div>
                            ))}
                            {historicalCalls.length > 5 && (
                                <p className="text-xs text-gray-500 italic">+ {historicalCalls.length - 5} more</p>
                            )}
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}