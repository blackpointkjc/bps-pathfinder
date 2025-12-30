import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, History, Search, Clock, MapPin, User, FileText } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { base44 } from '@/api/base44Client';

export default function HistoricalLogsPanel({ isOpen, onClose }) {
    const [unitLogs, setUnitLogs] = useState([]);
    const [callLogs, setCallLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const [unitLogsData, callLogsData] = await Promise.all([
                base44.entities.UnitStatusLog.list('-created_date', 200),
                base44.entities.CallStatusLog.list('-created_date', 200)
            ]);
            setUnitLogs(unitLogsData || []);
            setCallLogs(callLogsData || []);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredUnitLogs = unitLogs.filter(log => {
        const query = searchQuery.toLowerCase();
        return (
            log.unit_name?.toLowerCase().includes(query) ||
            log.new_status?.toLowerCase().includes(query) ||
            log.notes?.toLowerCase().includes(query)
        );
    });

    const filteredCallLogs = callLogs.filter(log => {
        const query = searchQuery.toLowerCase();
        return (
            log.incident_type?.toLowerCase().includes(query) ||
            log.location?.toLowerCase().includes(query) ||
            log.unit_name?.toLowerCase().includes(query) ||
            log.new_status?.toLowerCase().includes(query)
        );
    });

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
                    className="w-full max-w-6xl max-h-[90vh] z-[2101] pointer-events-auto"
                >
                    <Card className="bg-white pointer-events-auto h-full flex flex-col">
                        <div className="p-6 flex flex-col h-full overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center">
                                        <History className="w-6 h-6 text-purple-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Historical Logs</h2>
                                        <p className="text-sm text-gray-500">Unit status & call activity history</p>
                                    </div>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                    className="pointer-events-auto"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                <Input
                                    placeholder="Search logs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pointer-events-auto"
                                />
                            </div>

                            <Tabs defaultValue="units" className="w-full pointer-events-auto flex-1 flex flex-col overflow-hidden">
                                <TabsList className="grid w-full grid-cols-2 pointer-events-auto flex-shrink-0">
                                    <TabsTrigger value="units" className="pointer-events-auto">Unit Status Changes</TabsTrigger>
                                    <TabsTrigger value="calls" className="pointer-events-auto">Call Activity</TabsTrigger>
                                </TabsList>

                                <TabsContent value="units" className="mt-4 pointer-events-auto flex-1 overflow-hidden">
                                    <ScrollArea className="h-full pointer-events-auto overflow-y-auto">
                                        {loading ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300 animate-spin" />
                                                <p>Loading logs...</p>
                                            </div>
                                        ) : filteredUnitLogs.length === 0 ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                                <p>No unit status logs found</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {filteredUnitLogs.map((log) => (
                                                    <Card key={log.id} className="p-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                                <User className="w-5 h-5 text-blue-600" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="font-bold text-gray-900">{log.unit_name}</span>
                                                                    <span className="text-gray-400">→</span>
                                                                    <Badge variant="outline" className="bg-green-50 text-green-700">
                                                                        {log.new_status}
                                                                    </Badge>
                                                                </div>
                                                                {log.old_status && (
                                                                    <p className="text-sm text-gray-600 mb-1">
                                                                        From: <span className="font-medium">{log.old_status}</span>
                                                                    </p>
                                                                )}
                                                                {log.notes && (
                                                                    <p className="text-sm text-gray-600 mb-2 bg-gray-50 p-2 rounded">
                                                                        {log.notes}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                                                    <div className="flex items-center gap-1">
                                                                        <Clock className="w-3 h-3" />
                                                                        <span>{format(new Date(log.created_date), 'MMM d, h:mm a')}</span>
                                                                    </div>
                                                                    {log.location_lat && log.location_lng && (
                                                                        <div className="flex items-center gap-1">
                                                                            <MapPin className="w-3 h-3" />
                                                                            <span>{log.location_lat.toFixed(4)}, {log.location_lng.toFixed(4)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </TabsContent>

                                <TabsContent value="calls" className="mt-4 pointer-events-auto flex-1 overflow-hidden">
                                    <ScrollArea className="h-full pointer-events-auto overflow-y-auto">
                                        {loading ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300 animate-spin" />
                                                <p>Loading logs...</p>
                                            </div>
                                        ) : filteredCallLogs.length === 0 ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                                <p>No call activity logs found</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {filteredCallLogs.map((log) => (
                                                    <Card key={log.id} className="p-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                                                <FileText className="w-5 h-5 text-red-600" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="font-bold text-gray-900">{log.incident_type}</span>
                                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                                                        {log.new_status}
                                                                    </Badge>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                                                    <MapPin className="w-4 h-4" />
                                                                    <span>{log.location}</span>
                                                                </div>
                                                                {log.unit_name && (
                                                                    <p className="text-sm text-gray-600 mb-1">
                                                                        Unit: <span className="font-medium">{log.unit_name}</span>
                                                                    </p>
                                                                )}
                                                                {log.notes && (
                                                                    <p className="text-sm text-gray-600 mb-2 bg-gray-50 p-2 rounded">
                                                                        {log.notes}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                                                    <Clock className="w-3 h-3" />
                                                                    <span>{format(new Date(log.created_date), 'MMM d, h:mm a')}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}