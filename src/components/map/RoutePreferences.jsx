import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Settings, Car, Bike, PersonStanding, Ship, Mountain } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

const TRANSPORT_MODES = [
    { id: 'driving', label: 'Driving', icon: Car },
    { id: 'cycling', label: 'Cycling', icon: Bike },
    { id: 'walking', label: 'Walking', icon: PersonStanding }
];

export default function RoutePreferences({ isOpen, onClose, preferences, onSave }) {
    const [localPrefs, setLocalPrefs] = useState(preferences || {
        transportMode: 'driving',
        avoidFerries: false,
        avoidUnpaved: false,
        avoidHighways: false,
        preferScenic: false
    });

    const handleSave = () => {
        onSave(localPrefs);
        toast.success('Route preferences saved');
        onClose();
    };

    const togglePref = (key) => {
        setLocalPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const setTransportMode = (mode) => {
        setLocalPrefs(prev => ({ ...prev, transportMode: mode }));
    };

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
                >
                    <Card className="bg-white w-full max-w-md">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-[#007AFF]" />
                                    <h2 className="text-xl font-bold text-[#1D1D1F]">Route Preferences</h2>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <ScrollArea className="max-h-[60vh]">
                                <div className="space-y-6">
                                    {/* Transport Mode */}
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-900 mb-3 block">
                                            Transport Mode
                                        </Label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {TRANSPORT_MODES.map(({ id, label, icon: Icon }) => (
                                                <button
                                                    key={id}
                                                    onClick={() => setTransportMode(id)}
                                                    className={`p-3 rounded-xl border-2 transition-all ${
                                                        localPrefs.transportMode === id
                                                            ? 'border-[#007AFF] bg-blue-50'
                                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                                    }`}
                                                >
                                                    <Icon className={`w-6 h-6 mx-auto mb-1 ${
                                                        localPrefs.transportMode === id
                                                            ? 'text-[#007AFF]'
                                                            : 'text-gray-600'
                                                    }`} />
                                                    <p className={`text-xs font-medium ${
                                                        localPrefs.transportMode === id
                                                            ? 'text-[#007AFF]'
                                                            : 'text-gray-600'
                                                    }`}>
                                                        {label}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Route Options */}
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-900 mb-3 block">
                                            Avoid
                                        </Label>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Ship className="w-4 h-4 text-gray-600" />
                                                    <span className="text-sm text-gray-700">Ferries</span>
                                                </div>
                                                <Switch
                                                    checked={localPrefs.avoidFerries}
                                                    onCheckedChange={() => togglePref('avoidFerries')}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Mountain className="w-4 h-4 text-gray-600" />
                                                    <span className="text-sm text-gray-700">Unpaved Roads</span>
                                                </div>
                                                <Switch
                                                    checked={localPrefs.avoidUnpaved}
                                                    onCheckedChange={() => togglePref('avoidUnpaved')}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Car className="w-4 h-4 text-gray-600" />
                                                    <span className="text-sm text-gray-700">Highways</span>
                                                </div>
                                                <Switch
                                                    checked={localPrefs.avoidHighways}
                                                    onCheckedChange={() => togglePref('avoidHighways')}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preferences */}
                                    <div>
                                        <Label className="text-sm font-semibold text-gray-900 mb-3 block">
                                            Preferences
                                        </Label>
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <Mountain className="w-4 h-4 text-gray-600" />
                                                <span className="text-sm text-gray-700">Prefer Scenic Routes</span>
                                            </div>
                                            <Switch
                                                checked={localPrefs.preferScenic}
                                                onCheckedChange={() => togglePref('preferScenic')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>

                            <Button
                                onClick={handleSave}
                                className="w-full mt-6 bg-[#007AFF] hover:bg-[#0056CC]"
                            >
                                Save Preferences
                            </Button>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}