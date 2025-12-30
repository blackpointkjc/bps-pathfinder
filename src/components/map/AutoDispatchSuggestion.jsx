import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navigation, MapPin, X, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function AutoDispatchSuggestion({ suggestion, onAccept, onDismiss }) {
    const [timeRemaining, setTimeRemaining] = useState(15);

    useEffect(() => {
        if (suggestion) {
            const timer = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        onDismiss();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [suggestion, onDismiss]);

    if (!suggestion) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -100, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -100, scale: 0.9 }}
                className="fixed top-20 right-4 z-[10000] w-full max-w-sm pointer-events-auto"
            >
                <Card className="bg-gradient-to-br from-blue-600 to-indigo-600 border-blue-700 shadow-2xl overflow-hidden">
                    <div className="bg-blue-700 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="font-bold text-white text-sm">AUTO-DISPATCH SUGGESTION</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onDismiss}
                            className="text-white hover:bg-blue-600 h-6 w-6"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="p-4 bg-white">
                        <div className="mb-3">
                            <Badge className="bg-red-600 text-white mb-2">
                                {suggestion.call.priority?.label || 'Priority Call'}
                            </Badge>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">
                                {suggestion.call.incident}
                            </h3>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <MapPin className="w-4 h-4" />
                                <span>{suggestion.call.location}</span>
                            </div>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-gray-700">Suggested Unit</span>
                                <Badge variant="outline" className="bg-green-50 text-green-700">
                                    {suggestion.unit.status}
                                </Badge>
                            </div>
                            <p className="font-bold text-blue-900">{suggestion.unit.unit_number || suggestion.unit.full_name}</p>
                            <p className="text-xs text-gray-600 mt-1">
                                Distance: {suggestion.distance} • ETA: {suggestion.eta}
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={onAccept}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                            >
                                <Navigation className="w-4 h-4 mr-2" />
                                Dispatch
                            </Button>
                            <Button
                                onClick={onDismiss}
                                variant="outline"
                                className="px-4"
                            >
                                <Clock className="w-4 h-4 mr-1" />
                                {timeRemaining}s
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}