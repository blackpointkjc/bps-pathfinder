import React from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, MapPinOff, AlertCircle } from 'lucide-react';

export default function NavigationStatusBar({ isOnline, accuracy, isLiveTracking, currentStreet, isOffRoute, isNavigating, speed }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-2 md:top-4 left-20 md:left-24 z-[999] flex flex-wrap gap-1.5 md:gap-2"
        >
            <div className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full flex items-center gap-1.5 md:gap-2 ${isOnline ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {isOnline ? (
                    <><Wifi className="w-3 h-3" /><span className="text-[10px] md:text-xs font-medium">Online</span></>
                ) : (
                    <><WifiOff className="w-3 h-3" /><span className="text-[10px] md:text-xs font-medium">Offline</span></>
                )}
            </div>
            {accuracy && accuracy > 50 && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-amber-100 text-amber-700 px-2 md:px-3 py-1 md:py-1.5 rounded-full flex items-center gap-1.5 md:gap-2">
                    <MapPinOff className="w-3 h-3" />
                    <span className="text-[10px] md:text-xs font-medium">Low GPS</span>
                </motion.div>
            )}
            {isLiveTracking && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-xs font-medium">Live Tracking</span>
                </motion.div>
            )}
            {currentStreet && currentStreet !== 'Locating...' && currentStreet !== 'Location unavailable' && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/95 backdrop-blur-xl shadow-md px-3 py-1.5 rounded-full">
                    <span className="text-xs font-semibold text-gray-700">📍 {currentStreet}</span>
                </motion.div>
            )}
            {isOffRoute && isNavigating && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 animate-pulse" />
                    <span className="text-xs font-medium">Off Route</span>
                </motion.div>
            )}
            {speed > 0 && isLiveTracking && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/95 backdrop-blur-xl shadow-md px-3 py-1.5 rounded-full">
                    <span className="text-xs font-semibold text-gray-700">{Math.round(speed)} mph</span>
                </motion.div>
            )}
        </motion.div>
    );
}