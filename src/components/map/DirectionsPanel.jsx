import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Navigation2, Clock, MapPin, CornerUpRight, CornerUpLeft, ArrowUp, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const getDirectionIcon = (instruction) => {
    const lower = instruction.toLowerCase();
    if (lower.includes('left')) return CornerUpLeft;
    if (lower.includes('right')) return CornerUpRight;
    if (lower.includes('u-turn') || lower.includes('uturn')) return RotateCcw;
    return ArrowUp;
};

export default function DirectionsPanel({ directions, destination, onClose, distance, duration }) {
    return (
        <AnimatePresence>
            {directions && directions.length > 0 && (
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="absolute bottom-0 left-0 right-0 z-[1000] bg-white/95 backdrop-blur-xl rounded-t-3xl shadow-2xl shadow-black/20 max-h-[50vh] md:max-h-[60vh]"
                >
                    {/* Handle bar */}
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 bg-gray-300 rounded-full" />
                    </div>

                    {/* Header */}
                    <div className="px-5 pb-4 border-b border-gray-100">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <MapPin className="w-4 h-4 text-[#007AFF]" />
                                    <h3 className="font-semibold text-[#1D1D1F] text-lg truncate max-w-[250px]">
                                        {destination}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                    <div className="flex items-center gap-1">
                                        <Navigation2 className="w-4 h-4" />
                                        <span>{distance}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        <span>{duration}</span>
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200"
                            >
                                <X className="w-4 h-4 text-gray-500" />
                            </Button>
                        </div>
                    </div>

                    {/* Directions List */}
                    <ScrollArea className="h-[calc(50vh-120px)] md:h-[calc(60vh-120px)]">
                        <div className="p-4 space-y-1">
                            {directions.map((step, index) => {
                                const Icon = getDirectionIcon(step.instruction);
                                return (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#007AFF]/10 flex items-center justify-center">
                                            <Icon className="w-4 h-4 text-[#007AFF]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[#1D1D1F] text-sm leading-relaxed">
                                                {step.instruction}
                                            </p>
                                            {step.distance && (
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {step.distance}
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-400 font-medium">
                                            {index + 1}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </motion.div>
            )}
        </AnimatePresence>
    );
}