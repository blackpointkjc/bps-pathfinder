import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, ArrowUp,
    ArrowUpRight, ArrowUpLeft, RotateCw, MapPin, X
} from 'lucide-react';

const getDirectionIcon = (instruction) => {
    if (!instruction) return ArrowUp;
    const t = instruction.toLowerCase();
    if (t.includes('sharp left') || t.includes('turn left')) return ArrowLeft;
    if (t.includes('sharp right') || t.includes('turn right')) return ArrowRight;
    if (t.includes('slight left')) return ArrowUpLeft;
    if (t.includes('slight right')) return ArrowUpRight;
    if (t.includes('left')) return ArrowLeft;
    if (t.includes('right')) return ArrowRight;
    if (t.includes('arrive')) return MapPin;
    return ArrowUp;
};

const getETA = (remainingTime) => {
    if (!remainingTime) return null;
    const match = remainingTime.match(/ETA (\d+:\d+\s*[AP]M)/i);
    return match ? match[1] : null;
};

const getRemainingMins = (remainingTime) => {
    if (!remainingTime) return null;
    const hMatch = remainingTime.match(/(\d+)h\s*(\d+)m/);
    if (hMatch) return `${hMatch[1]}h ${hMatch[2]}m`;
    const mMatch = remainingTime.match(/^(\d+)\s*min/);
    return mMatch ? `${mMatch[1]} min` : null;
};

export default function LiveNavigation({ currentStep, nextStep, remainingDistance, remainingTime, onExit, isRerouting, speed = 0 }) {
    const DirectionIcon = getDirectionIcon(currentStep?.instruction);
    const NextIcon = getDirectionIcon(nextStep?.instruction);
    const eta = getETA(remainingTime);
    const mins = getRemainingMins(remainingTime);

    return (
        <div className="absolute inset-0 z-[1003] pointer-events-none flex flex-col justify-between">
            {/* TOP BANNER — direction card */}
            <motion.div
                initial={{ y: -80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -80, opacity: 0 }}
                className="pointer-events-auto"
            >
                {/* Main turn instruction */}
                <div className="bg-[#1565C0] shadow-2xl">
                    <div className="flex items-center gap-0">
                        {/* Icon block */}
                        <motion.div
                            key={currentStep?.instruction}
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex-shrink-0 w-28 h-24 flex items-center justify-center bg-[#0D47A1]"
                        >
                            <DirectionIcon className="w-14 h-14 text-white" strokeWidth={2.5} />
                        </motion.div>

                        {/* Distance + instruction */}
                        <div className="flex-1 px-4 py-3">
                            <motion.div
                                key={currentStep?.distance}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-4xl font-extrabold text-white tracking-tight leading-none"
                            >
                                {currentStep?.distance || '—'}
                            </motion.div>
                            <motion.p
                                key={currentStep?.instruction}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.08 }}
                                className="text-white/90 text-base font-medium mt-1 leading-snug line-clamp-2"
                            >
                                {currentStep?.instruction || 'Continue on route'}
                            </motion.p>
                        </div>

                        {/* Exit button */}
                        <button
                            onClick={onExit}
                            className="self-start mt-2 mr-2 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>

                    {/* Next step strip */}
                    <AnimatePresence>
                        {nextStep && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="flex items-center gap-3 px-4 py-2 bg-[#1976D2] border-t border-white/10">
                                    <NextIcon className="w-5 h-5 text-white/70 flex-shrink-0" strokeWidth={2} />
                                    <span className="text-white/80 text-sm font-medium">
                                        Then in {nextStep.distance} · {nextStep.instruction}
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Rerouting banner */}
                <AnimatePresence>
                    {isRerouting && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-3 bg-amber-500 px-5 py-2"
                        >
                            <RotateCw className="w-4 h-4 text-white animate-spin" />
                            <span className="text-white font-semibold text-sm">Recalculating...</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* BOTTOM BAR — ETA / distance / speed */}
            <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                className="pointer-events-auto"
            >
                <div className="bg-[#1A237E] flex items-center justify-around px-4 py-3 shadow-2xl" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                    {/* Speed */}
                    <div className="flex flex-col items-center">
                        <span className="text-3xl font-extrabold text-white leading-none">{Math.round(speed)}</span>
                        <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">mph</span>
                    </div>

                    <div className="w-px h-10 bg-white/20" />

                    {/* Remaining distance */}
                    <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-white leading-none">{remainingDistance || '—'}</span>
                        <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">remaining</span>
                    </div>

                    <div className="w-px h-10 bg-white/20" />

                    {/* ETA */}
                    <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-white leading-none">{eta || mins || '—'}</span>
                        <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">arrival</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}