import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, MapPin, Clock, AlertCircle, Navigation as NavigationIcon, AlertTriangle, Flame, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const getAgencyBadgeColor = (agency) => {
    if (agency?.includes('RPD')) return 'bg-red-100 text-red-700 border-red-300';
    if (agency?.includes('CCPD')) return 'bg-blue-100 text-blue-700 border-blue-300';
    if (agency?.includes('HPD')) return 'bg-purple-100 text-purple-700 border-purple-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
};

const getStatusColor = (status) => {
    if (status?.toLowerCase().includes('enroute')) return 'bg-red-500';
    if (status?.toLowerCase().includes('arrived') || status?.toLowerCase().includes('arv')) return 'bg-green-500';
    return 'bg-yellow-500';
};

// Priority assessment logic
const assessCallPriority = (call) => {
    const incident = call.incident?.toLowerCase() || '';
    const description = call.description?.toLowerCase() || '';
    const combined = `${incident} ${description}`;

    // Critical - life-threatening emergencies
    if (
        combined.includes('shooting') ||
        combined.includes('stabbing') ||
        combined.includes('officer down') ||
        combined.includes('shots fired') ||
        combined.includes('active shooter') ||
        combined.includes('code 3') ||
        combined.includes('10-00') ||
        incident.includes('cardiac arrest') ||
        incident.includes('person with gun')
    ) {
        return { level: 'critical', score: 4, label: 'CRITICAL', color: 'bg-red-600', icon: Flame };
    }

    // High - urgent situations
    if (
        combined.includes('assault') ||
        combined.includes('robbery') ||
        combined.includes('burglary in progress') ||
        combined.includes('domestic') ||
        combined.includes('pursuit') ||
        combined.includes('accident with injury') ||
        combined.includes('fire') ||
        incident.includes('weapons')
    ) {
        return { level: 'high', score: 3, label: 'HIGH', color: 'bg-orange-500', icon: AlertTriangle };
    }

    // Medium - standard response
    if (
        combined.includes('suspicious') ||
        combined.includes('disturbance') ||
        combined.includes('trespass') ||
        combined.includes('alarm') ||
        incident.includes('theft')
    ) {
        return { level: 'medium', score: 2, label: 'MEDIUM', color: 'bg-yellow-500', icon: AlertCircle };
    }

    // Low - routine calls
    return { level: 'low', score: 1, label: 'LOW', color: 'bg-blue-500', icon: Info };
};

export default function ActiveCallsList({ isOpen, onClose, calls, onNavigateToCall }) {
    // Sort calls by priority
    const sortedCalls = useMemo(() => {
        return [...calls]
            .map(call => ({
                ...call,
                priority: assessCallPriority(call)
            }))
            .sort((a, b) => b.priority.score - a.priority.score);
    }, [calls]);

    // Count by priority
    const priorityCounts = useMemo(() => {
        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        sortedCalls.forEach(call => {
            counts[call.priority.level]++;
        });
        return counts;
    }, [sortedCalls]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl z-[2101]"
                >
                    <Card className="bg-white">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-red-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Active Calls</h2>
                                        <p className="text-sm text-gray-500">{calls.length} calls for service</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                }}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Priority Summary */}
                            <div className="grid grid-cols-4 gap-2 mb-4">
                                <div className="bg-red-50 rounded-lg p-2 text-center">
                                    <div className="text-2xl font-bold text-red-600">{priorityCounts.critical}</div>
                                    <div className="text-xs text-red-700">Critical</div>
                                </div>
                                <div className="bg-orange-50 rounded-lg p-2 text-center">
                                    <div className="text-2xl font-bold text-orange-600">{priorityCounts.high}</div>
                                    <div className="text-xs text-orange-700">High</div>
                                </div>
                                <div className="bg-yellow-50 rounded-lg p-2 text-center">
                                    <div className="text-2xl font-bold text-yellow-600">{priorityCounts.medium}</div>
                                    <div className="text-xs text-yellow-700">Medium</div>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-2 text-center">
                                    <div className="text-2xl font-bold text-blue-600">{priorityCounts.low}</div>
                                    <div className="text-xs text-blue-700">Low</div>
                                </div>
                            </div>

                            <ScrollArea className="h-[500px]">
                                {sortedCalls.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                        <p>No active calls</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sortedCalls.map((call, index) => {
                                            const PriorityIcon = call.priority.icon;
                                            return (
                                                <motion.div
                                                    key={`${call.incident}-${index}`}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.05 }}
                                                >
                                                    <Card className={`p-4 hover:shadow-lg transition-shadow border-l-4 ${
                                                        call.priority.level === 'critical' ? 'border-l-red-600' :
                                                        call.priority.level === 'high' ? 'border-l-orange-500' :
                                                        call.priority.level === 'medium' ? 'border-l-yellow-500' :
                                                        'border-l-blue-500'
                                                    }`}>
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div className={`w-2 h-2 rounded-full ${getStatusColor(call.status)} animate-pulse`} />
                                                                    <h3 className="font-bold text-gray-900">{call.incident}</h3>
                                                                    <Badge className={`${call.priority.color} text-white border-0 ml-auto`}>
                                                                        <PriorityIcon className="w-3 h-3 mr-1" />
                                                                        {call.priority.label}
                                                                    </Badge>
                                                                </div>
                                                                
                                                                <div className="space-y-1 text-sm">
                                                                    <div className="flex items-center gap-2 text-gray-600">
                                                                        <MapPin className="w-4 h-4" />
                                                                        <span>{call.location}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-gray-500">
                                                                        <Clock className="w-4 h-4" />
                                                                        <span>{call.timeReceived}</span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2 mt-3">
                                                                    <Badge variant="outline" className={getAgencyBadgeColor(call.agency)}>
                                                                        {call.agency}
                                                                    </Badge>
                                                                    <Badge variant="outline" className="border-gray-300">
                                                                        {call.status}
                                                                    </Badge>
                                                                </div>
                                                            </div>

                                                            <Button
                                                                size="icon"
                                                                className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onNavigateToCall(call);
                                                                }}
                                                            >
                                                                <NavigationIcon className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </Card>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}