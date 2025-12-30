import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Users, MapPin, Clock, CheckCircle2, Navigation as NavigationIcon, XCircle, Car, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { base44 } from '@/api/base44Client';

const getStatusIcon = (status) => {
    if (status === 'Available') return CheckCircle2;
    if (status === 'Enroute') return NavigationIcon;
    if (status === 'On Scene') return MapPin;
    if (status === 'On Patrol') return Car;
    if (status === 'Out of Service') return XCircle;
    return Clock;
};

const getStatusColor = (status) => {
    if (status === 'Available') return 'bg-green-100 text-green-700 border-green-300';
    if (status === 'Enroute') return 'bg-red-100 text-red-700 border-red-300';
    if (status === 'On Scene') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (status === 'On Patrol') return 'bg-indigo-100 text-indigo-700 border-indigo-300';
    if (status === 'Out of Service') return 'bg-gray-100 text-gray-700 border-gray-300';
    return 'bg-yellow-100 text-yellow-700 border-yellow-300';
};

export default function AllUnitsPanel({ isOpen, onClose }) {
    const [units, setUnits] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchUnits();
            const interval = setInterval(fetchUnits, 10000); // Refresh every 10 seconds
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    const fetchUnits = async () => {
        try {
            setLoading(true);
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const users = response.data?.users || [];
            setUnits(users);
        } catch (error) {
            console.error('Error fetching units:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredUnits = units.filter(unit => {
        const query = searchQuery.toLowerCase();
        return (
            unit.unit_number?.toLowerCase().includes(query) ||
            unit.full_name?.toLowerCase().includes(query) ||
            unit.status?.toLowerCase().includes(query)
        );
    });

    // Group by status
    const unitsByStatus = filteredUnits.reduce((acc, unit) => {
        const status = unit.status || 'Unknown';
        if (!acc[status]) acc[status] = [];
        acc[status].push(unit);
        return acc;
    }, {});

    const statusOrder = ['Available', 'On Patrol', 'Enroute', 'On Scene', 'Busy', 'At Station', 'In Quarters', 'Training', 'Out of Service'];

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-3xl"
                >
                    <Card className="bg-white">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">All Units</h2>
                                        <p className="text-sm text-gray-500">{filteredUnits.length} units online</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                }}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Search units..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>

                            <ScrollArea className="h-[600px]">
                                {loading ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300 animate-spin" />
                                        <p>Loading units...</p>
                                    </div>
                                ) : filteredUnits.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                        <p>No units found</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {statusOrder.map(status => {
                                            const statusUnits = unitsByStatus[status];
                                            if (!statusUnits || statusUnits.length === 0) return null;

                                            const StatusIcon = getStatusIcon(status);

                                            return (
                                                <div key={status}>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <StatusIcon className="w-4 h-4 text-gray-600" />
                                                        <h3 className="font-semibold text-gray-900">{status}</h3>
                                                        <Badge variant="outline" className="ml-auto">
                                                            {statusUnits.length}
                                                        </Badge>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {statusUnits.map((unit) => (
                                                            <Card key={unit.id} className="p-4 hover:shadow-md transition-shadow">
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <Car className="w-4 h-4 text-gray-600" />
                                                                            <h4 className="font-bold text-gray-900">
                                                                                {unit.unit_number || unit.full_name}
                                                                            </h4>
                                                                            <Badge 
                                                                                variant="outline" 
                                                                                className={getStatusColor(unit.status)}
                                                                            >
                                                                                {unit.status}
                                                                            </Badge>
                                                                        </div>

                                                                        {unit.current_call_info && (
                                                                            <div className="text-sm text-gray-600 mb-2 bg-red-50 p-2 rounded">
                                                                                <span className="font-semibold">Active: </span>
                                                                                {unit.current_call_info}
                                                                            </div>
                                                                        )}

                                                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                                                            {unit.latitude && unit.longitude && (
                                                                                <div className="flex items-center gap-1">
                                                                                    <MapPin className="w-3 h-3" />
                                                                                    <span>
                                                                                        {unit.latitude.toFixed(4)}, {unit.longitude.toFixed(4)}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                            {unit.last_updated && (
                                                                                <div className="flex items-center gap-1">
                                                                                    <Clock className="w-3 h-3" />
                                                                                    <span>
                                                                                        {formatDistanceToNow(new Date(unit.last_updated), { addSuffix: true })}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                            {unit.speed > 0 && (
                                                                                <span>{Math.round(unit.speed)} mph</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        ))}
                                                    </div>
                                                </div>
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