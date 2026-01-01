import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Sparkles, MapPin, Clock, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function AIDispatchPanel({ isOpen, onClose, call, onAssignUnit }) {
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState(null);

    React.useEffect(() => {
        if (isOpen && call) {
            analyzeCall();
        }
    }, [isOpen, call]);

    const analyzeCall = async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('aiDispatchAssistant', { call });
            
            if (response.data?.success) {
                setAnalysis(response.data);
            } else {
                toast.error('AI analysis failed');
            }
        } catch (error) {
            toast.error('Error analyzing call');
        } finally {
            setLoading(false);
        }
    };

    const handleAssign = async (unit) => {
        try {
            // Update call with assigned unit
            const currentAssigned = call.assigned_units || [];
            await base44.entities.DispatchCall.update(call.id, {
                assigned_units: [...currentAssigned, unit.unit_id],
                status: 'Dispatched',
                time_dispatched: new Date().toISOString()
            });

            // Update unit status
            await base44.asServiceRole.entities.User.update(unit.unit_id, {
                status: 'Dispatched',
                current_call_id: call.id,
                current_call_info: `${call.incident} - ${call.location}`
            });

            // Send message to unit
            const currentUser = await base44.auth.me();
            await base44.entities.Message.create({
                sender_id: currentUser.id,
                sender_name: currentUser.full_name,
                recipient_id: unit.unit_id,
                recipient_name: unit.unit_name,
                message: `DISPATCH: ${call.incident} at ${call.location}. ETA: ${unit.eta} min`,
                call_id: call.id
            });

            toast.success(`${unit.unit_name} dispatched - ETA ${unit.eta} min`);
            onClose();
            if (onAssignUnit) onAssignUnit();
        } catch (error) {
            toast.error('Failed to assign unit');
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 pointer-events-auto"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl z-[10000]"
                >
                    <Card className="bg-slate-900 border-slate-700 text-white">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                        <Sparkles className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">AI Dispatch Assistant</h2>
                                        <p className="text-sm text-slate-400">{call?.incident}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <Sparkles className="w-12 h-12 mx-auto mb-3 text-purple-500 animate-pulse" />
                                    <p className="text-slate-400">Analyzing optimal dispatch...</p>
                                </div>
                            ) : analysis ? (
                                <ScrollArea className="max-h-[600px]">
                                    <div className="space-y-4">
                                        {/* AI Analysis */}
                                        <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-lg p-4">
                                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                                <Sparkles className="w-4 h-4 text-purple-400" />
                                                AI Analysis
                                            </h3>
                                            <p className="text-sm text-slate-300 whitespace-pre-line">
                                                {analysis.aiAnalysis}
                                            </p>
                                        </div>

                                        {/* Resource Stats */}
                                        <div className="grid grid-cols-4 gap-2">
                                            <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                <div className="text-2xl font-bold text-green-400">{analysis.stats.availableUnits}</div>
                                                <div className="text-xs text-slate-400">Available</div>
                                            </div>
                                            <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                <div className="text-2xl font-bold text-blue-400">{analysis.stats.onPatrol}</div>
                                                <div className="text-xs text-slate-400">On Patrol</div>
                                            </div>
                                            <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                <div className="text-2xl font-bold text-red-400">{analysis.stats.onCalls}</div>
                                                <div className="text-xs text-slate-400">On Calls</div>
                                            </div>
                                            <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                <div className="text-2xl font-bold text-gray-400">{analysis.stats.outOfService}</div>
                                                <div className="text-xs text-slate-400">OOS</div>
                                            </div>
                                        </div>

                                        {/* Recommended Units */}
                                        <div>
                                            <h3 className="font-semibold mb-3">Recommended Units</h3>
                                            <div className="space-y-2">
                                                {analysis.recommendations.map((unit, idx) => (
                                                    <div
                                                        key={unit.unit_id}
                                                        className={`bg-slate-800 p-4 rounded-lg border-2 ${
                                                            idx === 0 ? 'border-purple-500' : 'border-transparent'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                {idx === 0 && (
                                                                    <Badge className="bg-purple-600">
                                                                        BEST MATCH
                                                                    </Badge>
                                                                )}
                                                                <span className="font-bold">{unit.unit_name}</span>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleAssign(unit)}
                                                                className="bg-blue-600 hover:bg-blue-700"
                                                            >
                                                                <Target className="w-4 h-4 mr-1" />
                                                                Assign
                                                            </Button>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-3 text-sm">
                                                            <div className="flex items-center gap-1 text-slate-400">
                                                                <MapPin className="w-3 h-3" />
                                                                {unit.distance} km
                                                            </div>
                                                            <div className="flex items-center gap-1 text-slate-400">
                                                                <Clock className="w-3 h-3" />
                                                                ETA {unit.eta} min
                                                            </div>
                                                            <Badge variant="outline" className="border-slate-600 text-slate-300">
                                                                {unit.status}
                                                            </Badge>
                                                        </div>

                                                        {unit.skills.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {unit.skills.map(skill => (
                                                                    <Badge
                                                                        key={skill}
                                                                        className={unit.skillMatch ? 'bg-green-600' : 'bg-slate-700'}
                                                                    >
                                                                        {skill}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Warnings */}
                                        {analysis.stats.availableUnits < 3 && (
                                            <div className="bg-red-900/40 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold text-red-400">Resource Shortage Warning</div>
                                                    <div className="text-sm text-red-300 mt-1">
                                                        Only {analysis.stats.availableUnits} units available. Consider requesting backup.
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            ) : null}
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}