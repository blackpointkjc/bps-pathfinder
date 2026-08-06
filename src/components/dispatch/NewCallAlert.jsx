import { AlertTriangle, MapPin, CheckCircle } from 'lucide-react';
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
                className="fixed left-1/2 top-2 z-50 w-full max-w-lg -translate-x-1/2 px-2 sm:top-4 sm:px-4"
            >
                <div className="flex max-h-[calc(100dvh-1rem)] flex-col gap-3 overflow-y-auto rounded-xl border-2 border-red-500 bg-red-950 p-3 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="text-red-300 font-mono font-bold text-sm uppercase tracking-wide">
                                NEW INCOMING CALL
                            </div>
                            <div className="mt-0.5 break-words font-mono text-base font-bold leading-snug text-white">
                                {call.incident}
                            </div>
                            <div className="mt-1 flex items-start gap-1.5 font-mono text-xs text-red-300">
                                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="min-w-0 break-words leading-relaxed">{call.location}</span>
                            </div>
                            {call.agency && (
                                <div className="text-red-400 font-mono text-xs mt-0.5">
                                    Agency: {call.agency}
                                </div>
                            )}
                            {call.description && (
                                <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-300">
                                    {call.description}
                                </div>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={onAcknowledge}
                        className="sticky bottom-0 w-full shrink-0 bg-red-600 font-mono text-sm font-bold text-white hover:bg-red-500"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        ACKNOWLEDGE — STOP ALERT
                    </Button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}