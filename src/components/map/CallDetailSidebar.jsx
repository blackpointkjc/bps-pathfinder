import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, MapPin, Clock, Radio, Navigation as NavigationIcon, AlertCircle, Crosshair } from 'lucide-react';

const getAgencyColor = (agency) => {
    if (agency?.includes('RPD')) return 'bg-blue-600 text-white';
    if (agency?.includes('CCPD')) return 'bg-blue-700 text-white';
    if (agency?.includes('HPD') || agency?.includes('HCPD')) return 'bg-purple-600 text-white';
    if (agency?.includes('CCFD') || agency?.includes('RFD')) return 'bg-red-600 text-white';
    if (agency?.includes('EMS')) return 'bg-yellow-500 text-black';
    return 'bg-gray-600 text-white';
};

const getStatusColor = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('arrived') || s.includes('arv') || s.includes('on scene')) return 'bg-green-500';
    if (s.includes('enroute') || s.includes('dispatched')) return 'bg-red-500';
    return 'bg-yellow-500';
};

export default function CallDetailSidebar({ call, onClose, onEnroute, onCenter }) {
    if (!call) return null;
    
    return (
        <AnimatePresence>
            <motion.div
                initial={{ x: 400 }}
                animate={{ x: 0 }}
                exit={{ x: 400 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 bottom-0 w-full md:w-[400px] bg-white shadow-2xl z-[2000] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-white">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Active Call</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className={`w-2 h-2 rounded-full ${getStatusColor(call.status)} animate-pulse`} />
                                    <span className="text-sm opacity-90">{call.status}</span>
                                </div>
                            </div>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={onClose}
                            className="text-white hover:bg-white/20"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Incident Type */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                            Incident Type
                        </label>
                        <p className="text-2xl font-bold text-gray-900">{call.incident}</p>
                    </div>

                    {/* AI Summary */}
                    {call.ai_summary && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-blue-900 font-medium leading-relaxed">
                                {call.ai_summary}
                            </p>
                        </div>
                    )}

                    {/* Location */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Location
                        </label>
                        <p className="text-base text-gray-900 font-medium">{call.location}</p>
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
                                Time
                            </label>
                            <p className="text-sm text-gray-900 font-medium">{call.timeReceived}</p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Radio className="w-4 h-4" />
                                Agency
                            </label>
                            <Badge className={getAgencyColor(call.agency)}>
                                {call.agency}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 border-t border-gray-200 space-y-3 bg-gray-50">
                    {call.latitude && call.longitude && (
                        <>
                            <Button
                                onClick={onCenter}
                                variant="outline"
                                className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-6"
                            >
                                <Crosshair className="w-5 h-5 mr-2" />
                                Center on Map
                            </Button>
                            <Button
                                onClick={onEnroute}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-6 text-base"
                            >
                                <NavigationIcon className="w-5 h-5 mr-2" />
                                Navigate to Call
                            </Button>
                        </>
                    )}
                    {(!call.latitude || !call.longitude) && (
                        <div className="text-center text-sm text-gray-500 py-4">
                            <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                            Location not available for navigation
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}