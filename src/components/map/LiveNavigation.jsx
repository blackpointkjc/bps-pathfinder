import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    Navigation, 
    ArrowRight, 
    ArrowLeft, 
    ArrowUp,
    ArrowUpRight,
    ArrowUpLeft,
    ArrowBigRight,
    ArrowBigLeft,
    RotateCw,
    Merge,
    X,
    Clock,
    MapPin
} from 'lucide-react';

const getDirectionIcon = (instruction) => {
    const text = instruction.toLowerCase();
    if (text.includes('sharp left') || text.includes('turn left')) return ArrowBigLeft;
    if (text.includes('sharp right') || text.includes('turn right')) return ArrowBigRight;
    if (text.includes('slight left')) return ArrowUpLeft;
    if (text.includes('slight right')) return ArrowUpRight;
    if (text.includes('left')) return ArrowLeft;
    if (text.includes('right')) return ArrowRight;
    if (text.includes('merge') || text.includes('ramp')) return Merge;
    if (text.includes('straight') || text.includes('continue')) return ArrowUp;
    if (text.includes('arrive')) return MapPin;
    return Navigation;
};

export default function LiveNavigation({ currentStep, nextStep, remainingDistance, remainingTime, onExit, isRerouting, speed = 0, eta }) {
    const DirectionIcon = currentStep ? getDirectionIcon(currentStep.instruction) : Navigation;
    const NextIcon = nextStep ? getDirectionIcon(nextStep.instruction) : ArrowRight;
    
    // Parse ETA from remainingTime if available
    const getETA = () => {
        if (eta) return eta;
        if (remainingTime) {
            const match = remainingTime.match(/ETA (\d+:\d+\s*[AP]M)/i);
            return match ? match[1] : null;
        }
        return null;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[1003] w-[calc(100%-32px)] max-w-[560px] pointer-events-auto"
        >
            {/* Main Navigation Card */}
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
                {/* Top Status Bar */}
                <div className="bg-white px-6 py-3 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-semibold text-gray-900">
                                {getETA() || 'Calculating...'}
                            </span>
                        </div>
                        <div className="h-4 w-px bg-gray-300" />
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-semibold text-gray-900">{remainingDistance}</span>
                        </div>
                        {speed > 0 && (
                            <>
                                <div className="h-4 w-px bg-gray-300" />
                                <span className="text-sm font-semibold text-gray-900">{Math.round(speed)} mph</span>
                            </>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onExit}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl h-10 w-10"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Main Instruction */}
                <div className="p-6 bg-white">
                    <div className="flex items-center gap-5">
                        <motion.div 
                            key={currentStep?.instruction}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg"
                        >
                            <DirectionIcon className="w-10 h-10 text-white" strokeWidth={2.5} />
                        </motion.div>
                        <div className="flex-1">
                            <motion.div 
                                key={currentStep?.distance}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                className="text-4xl font-bold text-gray-900 mb-2"
                            >
                                {currentStep?.distance || '---'}
                            </motion.div>
                            <motion.p 
                                key={currentStep?.instruction}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.1 }}
                                className="text-lg text-gray-800 leading-snug"
                            >
                                {currentStep?.instruction || 'Continue on route'}
                            </motion.p>
                        </div>
                    </div>
                </div>

                {/* Next Turn Preview */}
                <AnimatePresence mode="wait">
                    {nextStep && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t border-gray-200 bg-gray-50"
                        >
                            <div className="px-6 py-4 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center">
                                    <NextIcon className="w-6 h-6 text-gray-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 font-semibold">Then in {nextStep.distance}</p>
                                    <p className="text-sm text-gray-900 font-medium">{nextStep.instruction}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Rerouting Banner */}
            <AnimatePresence>
                {isRerouting && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl py-3 px-5 flex items-center gap-3 shadow-lg"
                    >
                        <RotateCw className="w-5 h-5 animate-spin" />
                        <span className="font-semibold text-base">Recalculating fastest route...</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}