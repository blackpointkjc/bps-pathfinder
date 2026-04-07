import { AlertTriangle, MapPin, X, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function NewCallAlert({ call, onAcknowledge }) {
    if (!call) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
            >
                <div className="bg-red-950 border-2 border-red-500 rounded-xl p-4 shadow-2xl flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="text-red-300 font-mono font-bold text-sm uppercase tracking-wide">
                                NEW INCOMING CALL
                            </div>
                            <div className="text-white font-mono font-bold text-base mt-0.5 truncate">
                                {call.incident}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-red-300 font-mono text-xs">
                                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate">{call.location}</span>
                            </div>
                            {call.agency && (
                                <div className="text-red-400 font-mono text-xs mt-0.5">
                                    Agency: {call.agency}
                                </div>
                            )}
                            {call.description && (
                                <div className="text-slate-300 font-mono text-xs mt-1 line-clamp-2">
                                    {call.description}
                                </div>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={onAcknowledge}
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-sm"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        ACKNOWLEDGE — STOP ALERT
                    </Button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}