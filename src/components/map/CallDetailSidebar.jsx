import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, MapPin, Clock, Radio, Navigation as NavigationIcon, AlertCircle, Crosshair, Users, History, Car, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const callMarkerIcon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

export default function CallDetailSidebar({ call, onClose, onEnroute, onCenter }) {
    const [historicalCalls, setHistoricalCalls] = useState([]);
    const [nearbyUnits, setNearbyUnits] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    useEffect(() => {
        if (call) {
            fetchHistoricalCalls();
            fetchNearbyUnits();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [call]);

    const fetchHistoricalCalls = async () => {
        if (!call.latitude || !call.longitude) return;
        
        setIsLoadingHistory(true);
        try {
            // Fetch calls from history within 0.5 mile radius (~0.01 lat/lng)
            const calls = await base44.entities.CallHistory.filter({}, '-archived_date', 50);
            
            // Filter by proximity and incident type
            const nearby = calls.filter(c => {
                if (!c.latitude || !c.longitude) return false;
                const distance = calculateDistance(
                    call.latitude, call.longitude,
                    c.latitude, c.longitude
                );
                return distance < 0.5; // Within 0.5 miles
            });
            
            // Filter by similar incident type
            const similar = nearby.filter(c => 
                c.incident?.toLowerCase().includes(call.incident?.toLowerCase().split(' ')[0]) ||
                call.incident?.toLowerCase().includes(c.incident?.toLowerCase().split(' ')[0])
            );
            
            setHistoricalCalls(similar.slice(0, 5));
        } catch (error) {
            console.error('Error fetching historical calls:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const fetchNearbyUnits = async () => {
        if (!call.latitude || !call.longitude) return;
        
        setIsLoadingUnits(true);
        try {
            const response = await base44.functions.invoke('fetchAllUsers', {});
            const users = response.data?.users || [];
            
            const nearby = users.filter(u => {
                if (!u.latitude || !u.longitude) return false;
                const distance = calculateDistance(
                    call.latitude, call.longitude,
                    u.latitude, u.longitude
                );
                return distance < 5; // Within 5 miles
            }).map(u => ({
                ...u,
                distance: calculateDistance(call.latitude, call.longitude, u.latitude, u.longitude)
            })).sort((a, b) => a.distance - b.distance).slice(0, 5);
            
            setNearbyUnits(nearby);
        } catch (error) {
            console.error('Error fetching nearby units:', error);
        } finally {
            setIsLoadingUnits(false);
        }
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    if (!call) return null;
    
    return (
        <AnimatePresence>
            {call && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[9998] pointer-events-auto"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: 400 }}
                        animate={{ x: 0 }}
                        exit={{ x: 400 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 bottom-0 w-full md:w-[400px] bg-white shadow-2xl z-[9999] overflow-hidden flex flex-col pointer-events-auto"
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
                            className="text-white hover:bg-white/20 pointer-events-auto"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-6">
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
                                <div className="flex items-start gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-blue-900 font-medium leading-relaxed">
                                        {call.ai_summary}
                                    </p>
                                </div>
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

                        {/* Map Preview */}
                        {call.latitude && call.longitude && (
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                    Area Map
                                </label>
                                <div className="h-48 rounded-xl overflow-hidden border border-gray-200">
                                    <MapContainer
                                        center={[call.latitude, call.longitude]}
                                        zoom={15}
                                        zoomControl={false}
                                        dragging={false}
                                        scrollWheelZoom={false}
                                        className="h-full w-full"
                                    >
                                        <TileLayer
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <Marker position={[call.latitude, call.longitude]} icon={callMarkerIcon} />
                                        <Circle
                                            center={[call.latitude, call.longitude]}
                                            radius={400}
                                            pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.1 }}
                                        />
                                    </MapContainer>
                                </div>
                            </div>
                        )}

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

                        <Separator />

                        {/* Nearby Units */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Nearby Units ({nearbyUnits.length})
                            </label>
                            {isLoadingUnits ? (
                                <p className="text-sm text-gray-500">Loading units...</p>
                            ) : nearbyUnits.length > 0 ? (
                                <div className="space-y-2">
                                    {nearbyUnits.map((unit, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <Car className="w-4 h-4 text-blue-600" />
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        {unit.unit_number || unit.full_name || 'Unknown Unit'}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{unit.status || 'Available'}</p>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="text-xs">
                                                {unit.distance.toFixed(1)} mi
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">No units nearby</p>
                            )}
                        </div>

                        <Separator />

                        {/* Historical Calls */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <History className="w-4 h-4" />
                                Similar Calls in Area ({historicalCalls.length})
                            </label>
                            {isLoadingHistory ? (
                                <p className="text-sm text-gray-500">Loading history...</p>
                            ) : historicalCalls.length > 0 ? (
                                <div className="space-y-2">
                                    {historicalCalls.map((histCall, idx) => (
                                        <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                            <p className="text-sm font-semibold text-gray-900">{histCall.incident}</p>
                                            <p className="text-xs text-gray-600 mt-1">{histCall.location}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <Badge variant="outline" className="text-xs">
                                                    {new Date(histCall.archived_date).toLocaleDateString()}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs">
                                                    {histCall.agency}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">No similar calls in area</p>
                            )}
                        </div>
                    </div>
                </ScrollArea>

                {/* Actions */}
                <div className="p-6 border-t border-gray-200 space-y-3 bg-gray-50">
                    {call.latitude && call.longitude && (
                        <>
                            <Button
                                onClick={onCenter}
                                variant="outline"
                                className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-6 pointer-events-auto"
                            >
                                <Crosshair className="w-5 h-5 mr-2" />
                                Center on Map
                            </Button>
                            <Button
                                onClick={onEnroute}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-6 text-base pointer-events-auto"
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
            </>
            )}
        </AnimatePresence>
    );
}