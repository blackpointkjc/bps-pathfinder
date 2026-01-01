import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Target, MapPin, Clock, TrendingUp, Shield, Award, Sparkles, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function OptimalDispatchPanel({ isOpen, onClose, call, onUnitAssigned }) {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(null);
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        if (isOpen && call) {
            fetchAIAnalysis();
        }
    }, [isOpen, call]);

    const fetchAIAnalysis = async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('aiDispatchAssistant', { call });

            if (response.data?.success) {
                setSuggestions(response.data.recommendations || []);
                setAiAnalysis(response.data.aiAnalysis);
                setStats(response.data.stats);
            } else {
                toast.error('AI analysis failed');
            }
        } catch (error) {
            console.error('Error fetching AI analysis:', error);
            toast.error('Failed to get AI suggestions');
        } finally {
            setLoading(false);
        }
    };

    const assignUnit = async (unit) => {
        setAssigning(unit.unit_id);
        try {
            const currentAssignments = call.assigned_units || [];
            const updatedAssignments = [...currentAssignments, unit.unit_id];
            
            await base44.entities.DispatchCall.update(call.id, {
                assigned_units: updatedAssignments,
                status: 'Dispatched',
                time_dispatched: new Date().toISOString()
            });

            await base44.entities.CallAssignment.create({
                call_id: call.id,
                unit_id: unit.unit_id,
                role: currentAssignments.length === 0 ? 'primary' : 'backup',
                assigned_at: new Date().toISOString(),
                status: 'pending'
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

            toast.success(`${unit.unit_name} assigned - ETA ${unit.eta} min`);
            onUnitAssigned();
            onClose();
        } catch (error) {
            console.error('Error assigning unit:', error);
            toast.error('Failed to assign unit');
        } finally {
            setAssigning(null);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl"
                >
                    <Card className="bg-slate-900 border-slate-700">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                                        <Sparkles className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">AI Dispatch Assistant</h2>
                                        <p className="text-sm text-slate-400">{call?.incident} - {call?.location}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5 text-white" />
                                </Button>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <Sparkles className="w-12 h-12 mx-auto mb-3 text-purple-500 animate-pulse" />
                                    <p className="text-slate-400">AI analyzing optimal dispatch...</p>
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="text-center py-12">
                                    <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                    <p className="text-slate-400">No available units found</p>
                                </div>
                            ) : (
                                <ScrollArea className="max-h-[500px]">
                                    <div className="space-y-4">
                                        {/* AI Analysis */}
                                        {aiAnalysis && (
                                            <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-lg p-4">
                                                <h3 className="font-semibold mb-2 flex items-center gap-2 text-white">
                                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                                    AI Analysis
                                                </h3>
                                                <p className="text-sm text-slate-300 whitespace-pre-line">
                                                    {aiAnalysis}
                                                </p>
                                            </div>
                                        )}

                                        {/* Resource Stats */}
                                        {stats && (
                                            <div className="grid grid-cols-4 gap-2">
                                                <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                    <div className="text-2xl font-bold text-green-400">{stats.availableUnits}</div>
                                                    <div className="text-xs text-slate-400">Available</div>
                                                </div>
                                                <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                    <div className="text-2xl font-bold text-blue-400">{stats.onPatrol}</div>
                                                    <div className="text-xs text-slate-400">On Patrol</div>
                                                </div>
                                                <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                    <div className="text-2xl font-bold text-red-400">{stats.onCalls}</div>
                                                    <div className="text-xs text-slate-400">On Calls</div>
                                                </div>
                                                <div className="bg-slate-800 p-3 rounded-lg text-center">
                                                    <div className="text-2xl font-bold text-gray-400">{stats.outOfService}</div>
                                                    <div className="text-xs text-slate-400">OOS</div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Resource Shortage Warning */}
                                        {stats && stats.availableUnits < 3 && (
                                            <div className="bg-red-900/40 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold text-red-400">Resource Shortage Warning</div>
                                                    <div className="text-sm text-red-300 mt-1">
                                                        Only {stats.availableUnits} units available. Consider requesting backup.
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Recommended Units */}
                                        <div>
                                            <h3 className="font-semibold mb-3 text-white">Recommended Units</h3>
                                            <div className="space-y-2">
                                                {suggestions.map((unit, index) => (
                                                    <motion.div
                                                        key={unit.unit_id}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: index * 0.1 }}
                                                    >
                                                        <Card className={`p-4 border-2 ${
                                                            index === 0 
                                                                ? 'bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-purple-500' 
                                                                : 'bg-slate-800 border-slate-700'
                                                        } hover:scale-[1.02] transition-all`}>
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        {index === 0 && (
                                                                            <Badge className="bg-purple-600 text-white">
                                                                                BEST MATCH
                                                                            </Badge>
                                                                        )}
                                                                        <h3 className="font-bold text-white text-lg">
                                                                            {unit.unit_name}
                                                                        </h3>
                                                                        {unit.skillMatch && (
                                                                            <Badge className="bg-green-600">
                                                                                SKILL MATCH
                                                                            </Badge>
                                                                        )}
                                                                    </div>

                                                                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                                                        <div>
                                                                            <div className="flex items-center gap-1 text-slate-500 mb-1">
                                                                                <MapPin className="w-3 h-3" />
                                                                                <span>Distance</span>
                                                                            </div>
                                                                            <p className="text-white font-semibold">
                                                                                {unit.distance} km
                                                                            </p>
                                                                        </div>

                                                                        <div>
                                                                            <div className="flex items-center gap-1 text-slate-500 mb-1">
                                                                                <Clock className="w-3 h-3" />
                                                                                <span>ETA</span>
                                                                            </div>
                                                                            <p className="text-white font-semibold">
                                                                                {unit.eta} min
                                                                            </p>
                                                                        </div>

                                                                        <div>
                                                                            <div className="flex items-center gap-1 text-slate-500 mb-1">
                                                                                <TrendingUp className="w-3 h-3" />
                                                                                <span>Status</span>
                                                                            </div>
                                                                            <p className="text-green-400 font-semibold">
                                                                                {unit.status}
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    {unit.skills && unit.skills.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {unit.skills.map(skill => (
                                                                                <Badge
                                                                                    key={skill}
                                                                                    className="bg-slate-700 text-slate-300 text-xs"
                                                                                >
                                                                                    {skill}
                                                                                </Badge>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <Button
                                                                    onClick={() => assignUnit(unit)}
                                                                    disabled={assigning !== null}
                                                                    className={`ml-4 ${
                                                                        index === 0 
                                                                            ? 'bg-purple-600 hover:bg-purple-700' 
                                                                            : 'bg-slate-700 hover:bg-slate-600'
                                                                    }`}
                                                                >
                                                                    <Target className="w-4 h-4 mr-2" />
                                                                    {assigning === unit.unit_id ? 'Assigning...' : 'Dispatch'}
                                                                </Button>
                                                            </div>
                                                        </Card>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}