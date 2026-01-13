import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Car, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function UnitSettings({ isOpen, onClose, unitName, onSave, showLights, onLightsChange }) {
    const [name, setName] = useState(unitName || '');
    const [lightsEnabled, setLightsEnabled] = useState(showLights || false);

    const handleSave = () => {
        if (name.trim()) {
            onSave(name.trim());
            onLightsChange(lightsEnabled);
            toast.success('Unit settings saved');
            onClose();
        } else {
            toast.error('Please enter a unit name');
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
                onClick={(e) => {
                    if (unitName) {
                        onClose();
                    }
                    e.stopPropagation();
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Card className="bg-white p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Car className="w-5 h-5 text-[#007AFF]" />
                                <h2 className="text-xl font-bold text-[#1D1D1F]">Unit Settings</h2>
                            </div>
                            {unitName && (
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="w-5 h-5" />
                                </Button>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="unitName" className="text-sm font-medium text-gray-700">
                                    Unit Name / Call Sign
                                </Label>
                                <Input
                                    id="unitName"
                                    placeholder="e.g., Unit 23, Car 5, K-9..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="mt-1"
                                    maxLength={20}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This will be displayed on the map with your location
                                </p>
                            </div>

                            <Button
                                onClick={handleSave}
                                className="w-full bg-[#007AFF] hover:bg-[#0056CC]"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Save Unit Name
                            </Button>
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}