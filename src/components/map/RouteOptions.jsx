import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Clock, Route, Car, TrendingUp, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function RouteOptions({ routes, onSelectRoute, selectedRouteIndex }) {
    if (!routes || routes.length === 0) return null;

    const getRouteLabel = (index) => {
        if (index === 0) return 'Fastest';
        if (index === 1) return 'Shortest';
        if (index === 2) return 'Alternative';
        return `Route ${index + 1}`;
    };

    const getRouteIcon = (index) => {
        if (index === 0) return TrendingUp;
        if (index === 1) return Route;
        return Car;
    };

    const formatDistance = (meters) => {
        const miles = (meters / 1609.34).toFixed(1);
        return `${miles} mi`;
    };

    const formatDuration = (seconds) => {
        const mins = Math.round(seconds / 60);
        if (mins >= 60) {
            const hours = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            return `${hours}h ${remainingMins}m`;
        }
        return `${mins} min`;
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:w-[400px] z-[2000] pointer-events-auto"
            >
                <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-white/20 overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <Route className="w-5 h-5 text-[#007AFF]" />
                            <h3 className="font-semibold text-[#1D1D1F]">Choose Route</h3>
                        </div>
                    </div>
                    <ScrollArea className="max-h-[300px]">
                        <div className="p-3 space-y-2">
                            {routes.map((route, index) => {
                                const Icon = getRouteIcon(index);
                                const isSelected = index === selectedRouteIndex;
                                
                                return (
                                    <motion.button
                                        key={index}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => onSelectRoute(index)}
                                        className={`w-full text-left p-4 rounded-xl transition-all ${
                                            isSelected 
                                                ? 'bg-[#007AFF] text-white shadow-lg' 
                                                : 'bg-gray-50 hover:bg-gray-100 text-[#1D1D1F]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-[#007AFF]'}`} />
                                                <span className="font-semibold">{getRouteLabel(index)}</span>
                                                {index === 0 && (
                                                    <Badge 
                                                        variant="secondary" 
                                                        className={`text-xs ${
                                                            isSelected 
                                                                ? 'bg-white/20 text-white' 
                                                                : 'bg-green-100 text-green-700'
                                                        }`}
                                                    >
                                                        Recommended
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm">
                                            <div className="flex items-center gap-1">
                                                <Clock className={`w-4 h-4 ${isSelected ? 'text-white/80' : 'text-gray-500'}`} />
                                                <span className={isSelected ? 'text-white/90' : 'text-gray-600'}>
                                                    {formatDuration(route.duration)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Route className={`w-4 h-4 ${isSelected ? 'text-white/80' : 'text-gray-500'}`} />
                                                <span className={isSelected ? 'text-white/90' : 'text-gray-600'}>
                                                    {formatDistance(route.distance)}
                                                </span>
                                            </div>
                                        </div>
                                        {route.hasTraffic && (
                                            <div className="mt-2 flex items-center gap-1 text-xs">
                                                <AlertCircle className={`w-3 h-3 ${isSelected ? 'text-amber-200' : 'text-amber-500'}`} />
                                                <span className={isSelected ? 'text-white/80' : 'text-amber-600'}>
                                                    Moderate traffic
                                                </span>
                                            </div>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}