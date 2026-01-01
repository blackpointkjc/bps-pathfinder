import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MapPin, TrendingUp, X, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow } from 'date-fns';

export default function RepeatAddressAlert({ onNavigateToAddress }) {
    const [repeatAddresses, setRepeatAddresses] = useState([]);
    const [dismissedAddresses, setDismissedAddresses] = useState(new Set());

    useEffect(() => {
        analyzeRepeatAddresses();
        const interval = setInterval(analyzeRepeatAddresses, 60000); // Check every minute
        return () => clearInterval(interval);
    }, []);

    const analyzeRepeatAddresses = async () => {
        try {
            // Get recent calls from history and active calls
            const historicalCalls = await base44.entities.CallHistory.list('-archived_date', 200);
            const activeCalls = await base44.entities.DispatchCall.list('-created_date', 100);
            
            const allCalls = [...historicalCalls, ...activeCalls];
            
            // Group by normalized address
            const addressMap = {};
            allCalls.forEach(call => {
                if (!call.location) return;
                
                const normalizedAddress = normalizeAddress(call.location);
                if (!addressMap[normalizedAddress]) {
                    addressMap[normalizedAddress] = {
                        address: call.location,
                        normalized: normalizedAddress,
                        calls: [],
                        latitude: call.latitude,
                        longitude: call.longitude
                    };
                }
                addressMap[normalizedAddress].calls.push(call);
            });

            // Filter for addresses with 3+ calls in recent history
            const repeats = Object.values(addressMap)
                .filter(addr => addr.calls.length >= 3)
                .map(addr => ({
                    ...addr,
                    callCount: addr.calls.length,
                    lastCall: addr.calls[0],
                    incidentTypes: [...new Set(addr.calls.map(c => c.incident))],
                    recentCallTime: addr.calls[0]?.archived_date || addr.calls[0]?.created_date
                }))
                .sort((a, b) => b.callCount - a.callCount)
                .slice(0, 5); // Top 5 repeat addresses

            setRepeatAddresses(repeats);
        } catch (error) {
            console.error('Error analyzing repeat addresses:', error);
        }
    };

    const normalizeAddress = (address) => {
        return address
            .toLowerCase()
            .replace(/\s+block\s+/gi, ' ')
            .replace(/\s+blvd\s*$/gi, ' boulevard')
            .replace(/\s+rd\s*$/gi, ' road')
            .replace(/\s+st\s*$/gi, ' street')
            .replace(/\s+ave\s*$/gi, ' avenue')
            .replace(/\s+ln\s*$/gi, ' lane')
            .replace(/\s+dr\s*$/gi, ' drive')
            .replace(/\s+ct\s*$/gi, ' court')
            .trim();
    };

    const handleDismiss = (normalized) => {
        setDismissedAddresses(prev => new Set([...prev, normalized]));
    };

    const visibleRepeats = repeatAddresses.filter(
        addr => !dismissedAddresses.has(addr.normalized)
    );

    if (visibleRepeats.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-gray-900">Repeat Address Alerts</h3>
                <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                    {visibleRepeats.length}
                </Badge>
            </div>

            <AnimatePresence>
                {visibleRepeats.map((addr) => (
                    <motion.div
                        key={addr.normalized}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                    >
                        <Card className="border-2 border-orange-300 bg-orange-50">
                            <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp className="w-4 h-4 text-orange-600" />
                                            <span className="font-bold text-orange-900">
                                                {addr.callCount} Calls at This Location
                                            </span>
                                        </div>
                                        <div className="flex items-start gap-2 mb-2">
                                            <MapPin className="w-4 h-4 text-gray-600 mt-0.5" />
                                            <p className="text-sm font-semibold text-gray-700">
                                                {addr.address}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDismiss(addr.normalized)}
                                        className="text-gray-500 hover:text-gray-700"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="space-y-2 mb-3">
                                    <div className="flex flex-wrap gap-1">
                                        {addr.incidentTypes.slice(0, 3).map((incident, idx) => (
                                            <Badge
                                                key={idx}
                                                variant="outline"
                                                className="bg-white text-xs"
                                            >
                                                {incident}
                                            </Badge>
                                        ))}
                                        {addr.incidentTypes.length > 3 && (
                                            <Badge variant="outline" className="bg-white text-xs">
                                                +{addr.incidentTypes.length - 3} more
                                            </Badge>
                                        )}
                                    </div>

                                    {addr.recentCallTime && (
                                        <div className="flex items-center gap-1 text-xs text-gray-600">
                                            <Clock className="w-3 h-3" />
                                            <span>
                                                Last call: {formatDistanceToNow(new Date(addr.recentCallTime), { addSuffix: true })}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {addr.latitude && addr.longitude && onNavigateToAddress && (
                                    <Button
                                        onClick={() => onNavigateToAddress(addr)}
                                        size="sm"
                                        className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                                    >
                                        <MapPin className="w-3 h-3 mr-1" />
                                        View on Map
                                    </Button>
                                )}
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}