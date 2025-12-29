import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, MapPin, Navigation, X } from 'lucide-react';

export default function CallNotification({ call, onAccept, onDismiss }) {
    const [sound] = useState(() => {
        // Create alert sound
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDWH0fPTgjMGHm7A7+OZUQ4PVKbh8LFVGA5On+DvwGMbBzaE0fPReiYEI3DC7+GTUAwQWK3l7q5XFAxAnN/zv2kdBDWH0PPTgyEEI3DD7+CTUQ0RWKzl7q5ZEwtCnN/zvmgdBDWH0fPRfiYEI3DE7+CTTw0PVqfj8K9VFg1Mnt/zv2kbBDOGz/PSfyYEJHPD7t+NTA0PWK3l761ZEgxBm9/zu2MbBDKGzvLPfSUEJXfE7t6OTQ0RW7Hl7ahVFQ5NneDvvWMbBjOGzvLP'; // shortened base64 for beep
        audio.volume = 1.0;
        return audio;
    });

    useEffect(() => {
        // Play sound when notification appears
        sound.play().catch(err => console.log('Audio play failed:', err));

        // Auto-dismiss after 30 seconds
        const timer = setTimeout(() => {
            onDismiss();
        }, 30000);

        return () => clearTimeout(timer);
    }, [sound, onDismiss]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -100, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -100, scale: 0.9 }}
                className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-md px-4 pointer-events-auto"
            >
                <Card className="bg-red-600 border-red-700 shadow-2xl overflow-hidden">
                    {/* Pulsing header */}
                    <div className="bg-red-700 px-4 py-3 flex items-center gap-2 animate-pulse">
                        <AlertCircle className="w-5 h-5 text-white" />
                        <span className="font-bold text-white">DISPATCH ALERT</span>
                    </div>

                    <div className="p-4 bg-white">
                        {/* Call Details */}
                        <div className="mb-4">
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                {call.incident}
                            </h3>
                            <div className="flex items-start gap-2 text-gray-700 mb-2">
                                <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <span className="text-lg">{call.location}</span>
                            </div>
                            {call.description && (
                                <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-3 rounded-lg">
                                    {call.description}
                                </p>
                            )}
                        </div>

                        {/* Priority Badge */}
                        <div className="flex items-center gap-2 mb-4">
                            <Badge className={
                                call.priority === 'critical' ? 'bg-red-600 text-white text-sm px-3 py-1' :
                                call.priority === 'high' ? 'bg-orange-500 text-white text-sm px-3 py-1' :
                                call.priority === 'medium' ? 'bg-yellow-500 text-white text-sm px-3 py-1' :
                                'bg-blue-500 text-white text-sm px-3 py-1'
                            }>
                                {call.priority?.toUpperCase()} PRIORITY
                            </Badge>
                            <Badge variant="outline" className="text-sm px-3 py-1">
                                {call.agency}
                            </Badge>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <Button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAccept(call);
                                }}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-6 text-lg pointer-events-auto"
                            >
                                <Navigation className="w-5 h-5 mr-2" />
                                Accept & Navigate
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}