import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, Radio, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RealTimeAlert({ alert, onDismiss, onNavigate }) {
    const [showAlert, setShowAlert] = useState(true);
    const [countdown, setCountdown] = useState(10);

    useEffect(() => {
        setShowAlert(true);
        setCountdown(10);
        
        // Auto-dismiss after 10 seconds
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    handleDismiss();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [alert]);

    const handleDismiss = () => {
        setShowAlert(false);
        setTimeout(() => onDismiss(), 300);
    };

    if (!alert || !showAlert) return null;

    const isIncident = alert.type === 'new_incident';
    const isStatusChange = alert.type === 'unit_status_change';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -50, scale: 0.9 }}
                className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[400px] max-w-[calc(100vw-32px)] pointer-events-auto"
            >
                <div className={`rounded-2xl shadow-2xl p-4 border-2 ${
                    isIncident 
                        ? 'bg-red-600 border-red-400 animate-pulse' 
                        : 'bg-blue-600 border-blue-400'
                }`}>
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                            {isIncident ? (
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                                    <Radio className="w-6 h-6 text-white" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-white" />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1">
                            <h3 className="font-bold text-white text-lg mb-1">
                                {isIncident ? '🚨 NEW INCIDENT' : '📍 UNIT STATUS UPDATE'}
                            </h3>
                            <p className="text-white/90 text-sm mb-2">
                                {alert.message}
                            </p>
                            
                            {onNavigate && (
                                <Button
                                    onClick={() => {
                                        handleDismiss();
                                        onNavigate(alert.data);
                                    }}
                                    size="sm"
                                    className="bg-white text-gray-900 hover:bg-gray-100 font-semibold"
                                >
                                    View on Map
                                </Button>
                            )}
                        </div>
                        
                        <div className="flex flex-col items-end gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleDismiss}
                                className="text-white hover:bg-white/20 h-8 w-8"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                            <div className="text-white/70 text-xs font-medium">
                                {countdown}s
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}