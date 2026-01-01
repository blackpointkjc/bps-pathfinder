import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Target, MapPin, Clock, TrendingUp, Shield, Award } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function OptimalDispatchPanel({ isOpen, onClose, call, onUnitAssigned }) {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(null);

    useEffect(() => {
        if (isOpen && call) {
            fetchSuggestions();
        }
    }, [isOpen, call]);

    const fetchSuggestions = async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('suggestOptimalUnits', {
                call_id: call.id
            });

            if (response.data?.success) {
                setSuggestions(response.data.suggestions || []);
            } else {
                toast.error(response.data?.message || 'No suggestions available');
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
            toast.error('Failed to get unit suggestions');
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

            toast.success(`${unit.unit_number} assigned - ETA ${unit.eta_minutes} min`);
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
                                    <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                                        <Target className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">Optimal Unit Selection</h2>
                                        <p className="text-sm text-slate-400">{call?.incident} - {call?.location}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5 text-white" />
                                </Button>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                                    <p className="text-slate-400">Analyzing best units...</p>
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="text-center py-12">
                                    <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                                    <p className="text-slate-400">No available units found</p>
                                </div>
                            ) : (
                                <ScrollArea className="max-h-[500px]">
                                    <div className="space-y-3">
                                        {suggestions.map((unit, index) => (
                                            <motion.div
                                                key={unit.unit_id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.1 }}
                                            >
                                                <Card className={`p-4 ${
                                                    index === 0 
                                                        ? 'bg-gradient-to-r from-blue-900/50 to-blue-800/50 border-blue-600' 
                                                        : 'bg-slate-800 border-slate-700'
                                                } hover:scale-[1.02] transition-all`}>
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                {index === 0 && (
                                                                    <Award className="w-5 h-5 text-yellow-500" />
                                                                )}
                                                                <h3 className="font-bold text-white text-lg">
                                                                    {unit.unit_number}
                                                                </h3>
                                                                {unit.is_supervisor && (
                                                                    <Shield className="w-4 h-4 text-yellow-500" />
                                                                )}
                                                                <Badge className={
                                                                    index === 0 
                                                                        ? 'bg-blue-600 text-white' 
                                                                        : 'bg-slate-700 text-slate-300'
                                                                }>
                                                                    {unit.recommendation}
                                                                </Badge>
                                                            </div>
                                                            
                                                            <p className="text-sm text-slate-400 mb-3">
                                                                {unit.rank && unit.last_name 
                                                                    ? `${unit.rank} ${unit.last_name}` 
                                                                    : unit.full_name}
                                                            </p>

                                                            <div className="grid grid-cols-3 gap-4 text-sm">
                                                                <div>
                                                                    <div className="flex items-center gap-1 text-slate-500 mb-1">
                                                                        <MapPin className="w-3 h-3" />
                                                                        <span>Distance</span>
                                                                    </div>
                                                                    <p className="text-white font-semibold">
                                                                        {unit.distance_miles} mi
                                                                    </p>
                                                                </div>

                                                                <div>
                                                                    <div className="flex items-center gap-1 text-slate-500 mb-1">
                                                                        <Clock className="w-3 h-3" />
                                                                        <span>ETA</span>
                                                                    </div>
                                                                    <p className="text-white font-semibold">
                                                                        {unit.eta_minutes} min
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
                                                        </div>

                                                        <Button
                                                            onClick={() => assignUnit(unit)}
                                                            disabled={assigning !== null}
                                                            className={`ml-4 ${
                                                                index === 0 
                                                                    ? 'bg-blue-600 hover:bg-blue-700' 
                                                                    : 'bg-slate-700 hover:bg-slate-600'
                                                            }`}
                                                        >
                                                            {assigning === unit.unit_id ? 'Assigning...' : 'Dispatch'}
                                                        </Button>
                                                    </div>
                                                </Card>
                                            </motion.div>
                                        ))}
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