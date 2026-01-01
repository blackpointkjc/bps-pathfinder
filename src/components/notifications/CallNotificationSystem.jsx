import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Navigation, AlertCircle, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDWH0fPTgjMGHm7A7+OZUQ4PVKbh8LFVGA5On+DvwGMbBzaE0fPReiYEI3DC7+GTUAwQWK3l7q5XFAxAnN/zv2kdBDWH0PPTgyEEI3DD7+CTUQ0RWKzl7q5ZEwtCnN/zvmgdBDWH0fPRfiYEI3DE7+CTTw0PVqfj8K9VFg1Mnt/zv2kbBDOGz/PSfyYEJHPD7t+NTA0PWK3l761ZEgxBm9/zu2MbBDKGzvLPfSUEJXfE7t6OTQ0RW7Hl7ahVFQ5NneDvvWMbBjOGzvLP';

const getPriorityColor = (call) => {
    const incident = call.incident?.toLowerCase() || '';
    const description = call.description?.toLowerCase() || '';
    const combined = `${incident} ${description}`;

    if (combined.includes('shooting') || combined.includes('shots fired') || 
        combined.includes('officer down') || combined.includes('active shooter')) {
        return 'bg-red-600 border-red-700';
    }
    if (combined.includes('assault') || combined.includes('robbery') || 
        combined.includes('burglary in progress') || combined.includes('domestic')) {
        return 'bg-orange-600 border-orange-700';
    }
    if (combined.includes('suspicious') || combined.includes('disturbance') || 
        combined.includes('alarm')) {
        return 'bg-yellow-600 border-yellow-700';
    }
    return 'bg-blue-600 border-blue-700';
};

export default function CallNotificationSystem({ calls = [], onNavigateToCall, currentUserId }) {
    const [notifications, setNotifications] = useState([]);
    const [dismissedCallIds, setDismissedCallIds] = useState(new Set());
    const lastCallIdsRef = useRef(new Set());
    const audioRef = useRef(null);

    useEffect(() => {
        // Initialize audio
        if (!audioRef.current) {
            audioRef.current = new Audio(NOTIFICATION_SOUND);
            audioRef.current.volume = 0.7;
        }
    }, []);

    useEffect(() => {
        if (!calls || calls.length === 0) return;

        const currentCallIds = new Set(calls.map(c => c.id || `${c.timeReceived}-${c.incident}`));
        const newCalls = calls.filter(call => {
            const callId = call.id || `${call.timeReceived}-${call.incident}`;
            return !lastCallIdsRef.current.has(callId) && 
                   !dismissedCallIds.has(callId) &&
                   call.source === 'dispatch' &&
                   (call.status === 'New' || call.status === 'Dispatched' || call.status === 'Pending');
        });

        if (newCalls.length > 0) {
            // Play sound
            audioRef.current?.play().catch(err => console.log('Audio play failed:', err));

            // Add to notifications
            newCalls.forEach(call => {
                const notificationId = `${call.id}-${Date.now()}`;
                setNotifications(prev => [...prev, { ...call, notificationId }]);
                
                // Show toast
                const priority = call.incident?.toLowerCase().includes('shooting') || 
                               call.incident?.toLowerCase().includes('shots fired') ? 
                               'CRITICAL' : 'HIGH';
                
                toast.error(`🚨 New ${priority} Call: ${call.incident}`, {
                    description: call.location,
                    duration: 8000,
                });

                // Auto-dismiss after 30 seconds
                setTimeout(() => {
                    setNotifications(prev => prev.filter(n => n.notificationId !== notificationId));
                }, 30000);
            });
        }

        lastCallIdsRef.current = currentCallIds;
    }, [calls, dismissedCallIds]);

    const handleDismiss = (notificationId, callId) => {
        setNotifications(prev => prev.filter(n => n.notificationId !== notificationId));
        setDismissedCallIds(prev => new Set([...prev, callId]));
    };

    const handleAccept = (call) => {
        if (call.source !== 'dispatch') {
            toast.error('Can only accept dispatch calls');
            return;
        }
        setNotifications(prev => prev.filter(n => n.id !== call.id));
        setDismissedCallIds(prev => new Set([...prev, call.id]));
        onNavigateToCall(call);
    };

    return (
        <div className="fixed top-20 right-4 z-[9999] space-y-3 pointer-events-none">
            <AnimatePresence>
                {notifications.map((call) => (
                    <motion.div
                        key={call.notificationId}
                        initial={{ opacity: 0, x: 100, scale: 0.8 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 100, scale: 0.8 }}
                        className="pointer-events-auto w-96"
                    >
                        <Card className={`border-2 ${getPriorityColor(call)} shadow-2xl overflow-hidden`}>
                            <div className="bg-gradient-to-r from-black/20 to-transparent p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                            <Bell className="w-5 h-5 text-white animate-pulse" />
                                        </div>
                                        <div>
                                            <h3 className="text-white font-bold text-lg">NEW DISPATCH CALL</h3>
                                            <p className="text-white/80 text-xs">Immediate Response Required</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDismiss(call.notificationId, call.id)}
                                        className="text-white hover:bg-white/20 rounded-full h-8 w-8"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="space-y-2 mb-4">
                                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertCircle className="w-4 h-4 text-white" />
                                            <span className="text-white font-bold text-base">{call.incident}</span>
                                        </div>
                                        <div className="flex items-start gap-2 text-white/90 text-sm">
                                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                            <span>{call.location}</span>
                                        </div>
                                    </div>

                                    {call.description && (
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 border border-white/20">
                                            <p className="text-white/90 text-xs line-clamp-2">{call.description}</p>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 text-xs text-white/80">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>{call.timeReceived || 'Just now'}</span>
                                        </div>
                                        {call.agency && (
                                            <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                                                {call.agency}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleAccept(call)}
                                        className="flex-1 bg-white hover:bg-gray-100 text-gray-900 font-bold"
                                        size="lg"
                                    >
                                        <Navigation className="w-4 h-4 mr-2" />
                                        Accept & Navigate
                                    </Button>
                                    <Button
                                        onClick={() => handleDismiss(call.notificationId, call.id)}
                                        variant="outline"
                                        className="bg-white/10 hover:bg-white/20 text-white border-white/30"
                                        size="lg"
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}