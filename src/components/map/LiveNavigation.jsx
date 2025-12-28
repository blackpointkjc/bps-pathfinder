import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Navigation2, 
    ArrowUp, 
    CornerUpRight, 
    CornerUpLeft, 
    RotateCcw,
    X,
    AlertTriangle
} from 'lucide-react';

const getDirectionIcon = (instruction) => {
    const lower = instruction.toLowerCase();
    if (lower.includes('left')) return CornerUpLeft;
    if (lower.includes('right')) return CornerUpRight;
    if (lower.includes('u-turn') || lower.includes('uturn')) return RotateCcw;
    return ArrowUp;
};

export default function LiveNavigation({ 
    currentStep, 
    nextStep, 
    remainingDistance, 
    remainingTime,
    onExit,
    isRerouting 
}) {
    if (!currentStep) return null;

    const Icon = getDirectionIcon(currentStep.instruction);
    const NextIcon = nextStep ? getDirectionIcon(nextStep.instruction) : null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                exit={{ y: -100 }}
                className="absolute top-4 left-4 right-4 z-[2000] md:left-1/2 md:-translate-x-1/2 md:w-[480px] md:right-auto pointer-events-auto"
            >
                <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-white/20 overflow-hidden">
                    {/* Rerouting Banner */}
                    <AnimatePresence>
                        {isRerouting && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="bg-[#007AFF] text-white px-4 py-2 flex items-center gap-2 text-sm"
                            >
                                <AlertTriangle className="w-4 h-4 animate-pulse" />
                                <span>Finding better route...</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="p-4">
                        {/* Current Instruction */}
                        <div className="flex items-start gap-4 mb-4">
                            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-[#007AFF] flex items-center justify-center">
                                <Icon className="w-8 h-8 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-2xl font-bold text-[#1D1D1F] leading-tight mb-1">
                                    {currentStep.distance}
                                </p>
                                <p className="text-base text-gray-600">
                                    {currentStep.instruction}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onExit}
                                className="flex-shrink-0 h-8 w-8 rounded-full"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Next Turn Preview */}
                        {nextStep && (
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                                    {NextIcon && <NextIcon className="w-4 h-4 text-gray-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-500">Then</p>
                                    <p className="text-sm text-gray-700 truncate">
                                        {nextStep.instruction}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Trip Info */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                            <div>
                                <p className="text-xs text-gray-500">Distance</p>
                                <p className="text-sm font-semibold text-[#1D1D1F]">{remainingDistance}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">ETA</p>
                                <p className="text-sm font-semibold text-[#1D1D1F]">{remainingTime}</p>
                            </div>
                            <div className="flex items-center gap-1 text-green-600">
                                <Navigation2 className="w-4 h-4" />
                                <span className="text-xs font-medium">On route</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}