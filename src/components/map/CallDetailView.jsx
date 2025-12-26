import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, MapPin, Clock, Radio, Navigation as NavigationIcon, AlertCircle } from 'lucide-react';

const getAgencyBadgeColor = (agency) => {
    if (agency?.includes('RPD')) return 'bg-red-100 text-red-700 border-red-300';
    if (agency?.includes('CCPD')) return 'bg-blue-100 text-blue-700 border-blue-300';
    if (agency?.includes('HPD') || agency?.includes('HCPD')) return 'bg-purple-100 text-purple-700 border-purple-300';
    if (agency?.includes('CCFD')) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
};

const getStatusColor = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('enroute') || s.includes('dispatched')) return 'bg-red-500';
    if (s.includes('arrived') || s.includes('arv') || s.includes('on scene')) return 'bg-green-500';
    if (s.includes('available')) return 'bg-blue-500';
    return 'bg-yellow-500';
};

export default function CallDetailView({ call, onClose, onEnroute }) {
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
                    className="w-full max-w-lg"
                >
                    <Card className="bg-white overflow-hidden">
                        <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-white">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">Call Details</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(call.status)} animate-pulse`} />
                                            <span className="text-sm opacity-90">{call.status}</span>
                                        </div>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Incident Type */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                    Incident Type
                                </label>
                                <p className="text-xl font-bold text-gray-900">{call.incident}</p>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <MapPin className="w-4 h-4" />
                                    Location
                                </label>
                                <p className="text-base text-gray-900">{call.location}</p>
                                {call.latitude && call.longitude && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        {call.latitude.toFixed(6)}, {call.longitude.toFixed(6)}
                                    </p>
                                )}
                            </div>

                            {/* Time & Agency */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Time Received
                                    </label>
                                    <p className="text-base text-gray-900">{call.timeReceived}</p>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Radio className="w-4 h-4" />
                                        Agency
                                    </label>
                                    <Badge variant="outline" className={getAgencyBadgeColor(call.agency)}>
                                        {call.agency}
                                    </Badge>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 border-t border-gray-200 flex gap-3">
                                <Button
                                    onClick={onEnroute}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-6 text-base"
                                >
                                    <NavigationIcon className="w-5 h-5 mr-2" />
                                    Navigate to Call
                                </Button>
                                <Button
                                    onClick={onClose}
                                    variant="outline"
                                    className="px-6"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}