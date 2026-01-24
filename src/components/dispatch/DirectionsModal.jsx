import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Navigation, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function DirectionsModal({ 
    isOpen,
    onClose, 
    directions, 
    destination, 
    distance, 
    duration,
    routes,
    onSelectRoute,
    selectedRouteIndex 
}) {
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    if (!isOpen) return null;

    const handleMouseDown = (e) => {
        if (e.target.closest('.modal-content')) return;
        setIsDragging(true);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    React.useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[2000]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed right-4 top-20 bottom-20 w-96 z-[2001] pointer-events-auto"
                        onMouseDown={handleMouseDown}
                    >
                        <Card className="h-full flex flex-col bg-white shadow-2xl rounded-2xl overflow-hidden modal-content">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <Navigation className="w-5 h-5 text-white" />
                                    <h3 className="text-white font-bold">Directions</h3>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                    className="text-white hover:bg-white/20 h-8 w-8"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Route Info */}
                            <div className="p-4 border-b bg-gray-50 flex-shrink-0">
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {destination}
                                        </p>
                                        <div className="flex items-center gap-3 mt-2">
                                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                                                {distance}
                                            </Badge>
                                            <Badge className="bg-green-100 text-green-700 text-xs">
                                                <Clock className="w-3 h-3 mr-1" />
                                                {duration}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Route Options */}
                            {routes && routes.length > 1 && (
                                <div className="p-3 border-b bg-white flex-shrink-0">
                                    <p className="text-xs font-semibold text-gray-600 mb-2">Route Options</p>
                                    <div className="space-y-2">
                                        {routes.map((route, index) => {
                                            const routeDistance = (route.distance / 1609.34).toFixed(1);
                                            const routeDuration = Math.round(route.duration / 60);
                                            const isSelected = index === selectedRouteIndex;

                                            return (
                                                <button
                                                    key={index}
                                                    onClick={() => onSelectRoute(index)}
                                                    className={`w-full p-2 rounded-lg border-2 text-left transition-all ${
                                                        isSelected
                                                            ? 'border-blue-500 bg-blue-50'
                                                            : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-gray-700">
                                                            Route {index + 1}
                                                        </span>
                                                        <div className="flex gap-2">
                                                            <Badge variant="outline" className="text-xs">
                                                                {routeDistance} mi
                                                            </Badge>
                                                            <Badge variant="outline" className="text-xs">
                                                                {routeDuration} min
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    {route.hasTraffic && (
                                                        <p className="text-xs text-amber-600 mt-1">⚠️ Traffic detected</p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Turn-by-Turn Directions */}
                            <ScrollArea className="flex-1">
                                <div className="p-4 space-y-3">
                                    {directions && directions.length > 0 ? (
                                        directions.map((step, index) => (
                                            <div
                                                key={index}
                                                className="flex gap-3 items-start p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-gray-900 leading-relaxed">
                                                        {step.instruction}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {step.distance}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500 text-center py-8">
                                            No directions available
                                        </p>
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Footer */}
                            <div className="p-4 border-t bg-gray-50 flex-shrink-0">
                                <Button
                                    onClick={onClose}
                                    variant="outline"
                                    className="w-full"
                                >
                                    Close
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}