import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Sparkles, MapPin, Clock, Car, Radio, Loader2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function DispatchPanel({ isOpen, onClose, call, onAssignUnit }) {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [callPriority, setCallPriority] = useState('MEDIUM');

    useEffect(() => {
        if (isOpen && call) {
            fetchSuggestions();
        }
    }, [isOpen, call]);

    const fetchSuggestions = async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('aiDispatch', {
                callLatitude: call.latitude,
                callLongitude: call.longitude,
                callIncident: call.incident,
                callAgency: call.agency
            });

            if (response.data.success) {
                setSuggestions(response.data.suggestions || []);
                setCallPriority(response.data.callPriority || 'MEDIUM');
                toast.success(`${response.data.suggestions?.length || 0} units analyzed`);
            }
        } catch (error) {
            console.error('Error fetching dispatch suggestions:', error);
            toast.error('Failed to load dispatch suggestions');
        } finally {
            setLoading(false);
        }
    };

    const handleAssign = (unit) => {
        onAssignUnit(call, unit);
        onClose();
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'HIGH': return 'bg-red-100 text-red-700 border-red-300';
            case 'MEDIUM': return 'bg-orange-100 text-orange-700 border-orange-300';
            case 'LOW': return 'bg-blue-100 text-blue-700 border-blue-300';
            default: return 'bg-gray-100 text-gray-700 border-gray-300';
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[2000]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed top-0 right-0 h-full w-full md:w-[480px] z-[2001] bg-white shadow-2xl"
                    >
                        <div className="flex flex-col h-full">
                            <div className="p-6 border-b border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-6 h-6 text-purple-600" />
                                        <h2 className="text-2xl font-bold text-gray-900">AI Dispatch</h2>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={onClose}>
                                        <X className="w-5 h-5" />
                                    </Button>
                                </div>

                                {call && (
                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2">
                                            <Radio className="w-4 h-4 text-red-600 mt-1 flex-shrink-0" />
                                            <div>
                                                <p className="font-semibold text-gray-900">{call.incident}</p>
                                                <p className="text-sm text-gray-600">{call.location}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={getPriorityColor(callPriority)}>
                                                {callPriority} PRIORITY
                                            </Badge>
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                                {call.agency}
                                            </Badge>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <ScrollArea className="flex-1">
                                <div className="p-6">
                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
                                            <p className="text-gray-600">Analyzing available units...</p>
                                        </div>
                                    ) : suggestions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
                                            <p className="text-gray-600">No available units found</p>
                                            <p className="text-sm text-gray-500 mt-1">All units may be busy</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                                                <Sparkles className="w-4 h-4 text-purple-600" />
                                                <span>Recommended units based on proximity and availability</span>
                                            </div>

                                            {suggestions.map((unit, index) => (
                                                <Card 
                                                    key={unit.unit_id} 
                                                    className={`p-4 border-2 transition-all hover:shadow-md ${
                                                        index === 0 ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                                                    }`}
                                                >
                                                    <div className="space-y-3">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Car className={`w-5 h-5 ${index === 0 ? 'text-purple-600' : 'text-gray-600'}`} />
                                                                <div>
                                                                    <p className="font-bold text-gray-900">{unit.unit_name}</p>
                                                                    {index === 0 && (
                                                                        <Badge className="bg-purple-600 text-white text-xs mt-1">
                                                                            <Sparkles className="w-3 h-3 mr-1" />
                                                                            BEST MATCH
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <Badge variant="outline">
                                                                Rank #{unit.rank}
                                                            </Badge>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                                            <div className="flex items-center gap-2">
                                                                <MapPin className="w-4 h-4 text-gray-500" />
                                                                <div>
                                                                    <p className="text-xs text-gray-500">Distance</p>
                                                                    <p className="font-semibold">{unit.distance} mi</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="w-4 h-4 text-gray-500" />
                                                                <div>
                                                                    <p className="text-xs text-gray-500">ETA</p>
                                                                    <p className="font-semibold">{unit.eta}</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <Badge className={
                                                                unit.status === 'Available' 
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-orange-100 text-orange-700'
                                                            }>
                                                                {unit.status}
                                                            </Badge>
                                                        </div>

                                                        <p className="text-xs text-gray-600 italic">
                                                            {unit.recommendation}
                                                        </p>

                                                        <Button
                                                            onClick={() => handleAssign(unit)}
                                                            className={`w-full ${
                                                                index === 0 
                                                                    ? 'bg-purple-600 hover:bg-purple-700'
                                                                    : 'bg-blue-600 hover:bg-blue-700'
                                                            }`}
                                                        >
                                                            Assign {unit.unit_name}
                                                        </Button>
                                                    </div>
                                                </Card>
                                            ))}

                                            <Button
                                                variant="outline"
                                                className="w-full mt-4"
                                                onClick={fetchSuggestions}
                                            >
                                                Refresh Suggestions
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}