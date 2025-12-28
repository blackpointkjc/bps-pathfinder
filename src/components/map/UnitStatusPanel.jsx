import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Navigation as NavigationIcon, MapPin, Clock, XCircle, X, Car, Home, Coffee, BookOpen, Heart, Crosshair } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
    { value: 'Available', icon: CheckCircle2, color: 'text-green-600 bg-green-100', description: 'Ready for calls' },
    { value: 'Enroute', icon: NavigationIcon, color: 'text-red-600 bg-red-100', description: 'En route to call' },
    { value: 'On Scene', icon: MapPin, color: 'text-blue-600 bg-blue-100', description: 'Arrived at scene' },
    { value: 'On Patrol', icon: Car, color: 'text-indigo-600 bg-indigo-100', description: 'Patrolling area' },
    { value: 'At Station', icon: Home, color: 'text-purple-600 bg-purple-100', description: 'At station/base' },
    { value: 'In Quarters', icon: Coffee, color: 'text-cyan-600 bg-cyan-100', description: 'Resting/break' },
    { value: 'Training', icon: BookOpen, color: 'text-orange-600 bg-orange-100', description: 'In training' },
    { value: 'Busy', icon: Clock, color: 'text-yellow-600 bg-yellow-100', description: 'Occupied/busy' },
    { value: 'Medical Leave', icon: Heart, color: 'text-pink-600 bg-pink-100', description: 'Medical leave' },
    { value: 'Out of Service', icon: XCircle, color: 'text-gray-600 bg-gray-100', description: 'Not available', needsETA: true }
];

export default function UnitStatusPanel({ isOpen, onClose, currentStatus, unitName, onStatusChange, activeCall, currentLocation }) {
    const [selectedStatus, setSelectedStatus] = useState(currentStatus);
    const [estimatedReturn, setEstimatedReturn] = useState('');
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');
    const [showManualLocation, setShowManualLocation] = useState(false);
    
    if (!isOpen) return null;
    
    const handleStatusClick = (status) => {
        setSelectedStatus(status);
        if (status !== 'Out of Service') {
            onStatusChange(status);
            onClose();
        }
    };
    
    const handleConfirmOutOfService = () => {
        onStatusChange(selectedStatus, estimatedReturn);
        onClose();
    };

    const handleSetManualLocation = async () => {
        const lat = parseFloat(manualLat);
        const lng = parseFloat(manualLng);
        
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            toast.error('Invalid coordinates');
            return;
        }
        
        try {
            const { base44 } = await import('@/api/base44Client');
            await base44.auth.updateMe({
                latitude: lat,
                longitude: lng,
                last_updated: new Date().toISOString()
            });
            toast.success('Location updated manually');
            setShowManualLocation(false);
            setManualLat('');
            setManualLng('');
        } catch (error) {
            toast.error('Failed to update location');
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
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="fixed inset-0 flex items-center justify-center z-[2001] p-4"
                        >
                        <Card className="p-6 bg-white shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '85vh' }}>
                            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                                <h3 className="text-xl font-bold text-gray-900">Unit Status</h3>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                                        <Car className="w-5 h-5 text-blue-600" />
                                        <div>
                                            <p className="text-sm text-gray-600">Unit</p>
                                            <p className="font-bold text-blue-600">{unitName}</p>
                                        </div>
                                    </div>

                                    {activeCall && (
                                        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                                            <Navigation className="w-5 h-5 text-red-600 mt-0.5" />
                                            <div>
                                                <p className="text-sm text-gray-600">Active Call</p>
                                                <p className="text-sm font-semibold text-gray-900">{activeCall}</p>
                                            </div>
                                        </div>
                                    )}

                                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                                        Change Status
                                    </label>
                                    <div className="grid grid-cols-2 gap-3 pb-4">
                                            {STATUS_OPTIONS.map((status) => {
                                                const Icon = status.icon;
                                                const isActive = selectedStatus === status.value;
                                                
                                                return (
                                                    <motion.button
                                                        key={status.value}
                                                        whileHover={{ scale: 1.02 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        onClick={() => handleStatusClick(status.value)}
                                                        className={`p-4 rounded-xl border-2 transition-all ${
                                                            isActive 
                                                                ? 'border-blue-500 bg-blue-50' 
                                                                : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                    >
                                                        <div className={`w-12 h-12 rounded-full ${status.color} mx-auto mb-2 flex items-center justify-center`}>
                                                            <Icon className="w-6 h-6" />
                                                        </div>
                                                        <p className="text-sm font-semibold text-gray-900">{status.value}</p>
                                                        <p className="text-xs text-gray-500 mt-1">{status.description}</p>
                                                    </motion.button>
                                                );
                                                })}
                                                </div>

                                                {selectedStatus === 'Out of Service' && (
                                                <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-4 p-4 bg-gray-50 rounded-xl"
                                                >
                                                <Label className="text-sm font-semibold mb-2">Estimated Return Time</Label>
                                                <Input
                                                    type="datetime-local"
                                                    value={estimatedReturn}
                                                    onChange={(e) => setEstimatedReturn(e.target.value)}
                                                    className="mb-3"
                                                />
                                                <Button
                                                    onClick={handleConfirmOutOfService}
                                                    className="w-full bg-gray-600 hover:bg-gray-700"
                                                >
                                                    Confirm Out of Service
                                                </Button>
                                                </motion.div>
                                                )}
                                                </div>
                                                </div>

                                                <div className="pt-4 border-t flex-shrink-0">
                                                <Button variant="outline" onClick={onClose} className="w-full">
                                                Close
                                                </Button>
                                                </div>
                                                </Card>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}