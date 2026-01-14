import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Car, Save } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function UnitSettings({ isOpen, onClose, unitName, onSave, showLights, onLightsChange }) {
    const [name, setName] = useState(unitName || '');
    const [assignedCar, setAssignedCar] = useState(localStorage.getItem('assignedCar') || '');
    const [lightsEnabled, setLightsEnabled] = useState(showLights || false);
    const [vehicles, setVehicles] = useState([]);

    useEffect(() => {
        if (isOpen) {
            loadVehicles();
        }
    }, [isOpen]);

    const loadVehicles = async () => {
        try {
            const data = await base44.entities.Vehicle.list('-created_date', 100);
            setVehicles(data?.filter(v => v.status === 'Active') || []);
        } catch (error) {
            console.error('Error loading vehicles:', error);
        }
    };

    const handleSave = async () => {
        if (name.trim()) {
            onSave(name.trim());
            onLightsChange(lightsEnabled);
            localStorage.setItem('assignedCar', assignedCar.trim());
            
            // Update backend with unit info and link vehicle
            try {
                const user = await base44.auth.me();
                await base44.auth.updateMe({ 
                    unit_number: name.trim(),
                    assigned_vehicle: assignedCar.trim()
                });

                // Update vehicle assignment if a vehicle was selected
                if (assignedCar.trim()) {
                    const vehicle = vehicles.find(v => v.vehicle_id === assignedCar.trim());
                    if (vehicle) {
                        await base44.entities.Vehicle.update(vehicle.id, {
                            assigned_to: user.id
                        });
                    }
                }
            } catch (error) {
                console.error('Error updating unit info:', error);
            }
            
            toast.success('Unit settings saved');
            onClose();
        } else {
            toast.error('Please enter a unit number');
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 pointer-events-auto"
                onClick={(e) => {
                    if (unitName && e.target === e.currentTarget) {
                        onClose();
                    }
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="pointer-events-auto"
                >
                    <Card className="bg-white p-6 w-full max-w-md pointer-events-auto">
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
                                    Unit Number / Call Sign *
                                </Label>
                                <Input
                                    id="unitName"
                                    placeholder="e.g., Unit 23, Car 5, K-9..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="mt-1"
                                    maxLength={20}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This will be displayed on the map with your location
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="assignedCar" className="text-sm font-medium text-gray-700">
                                    Assigned Vehicle
                                </Label>
                                {vehicles.length > 0 ? (
                                    <select
                                        id="assignedCar"
                                        value={assignedCar}
                                        onChange={(e) => setAssignedCar(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                    >
                                        <option value="">Select Vehicle</option>
                                        {vehicles.map(vehicle => (
                                            <option key={vehicle.id} value={vehicle.vehicle_id}>
                                                {vehicle.vehicle_id} - {vehicle.year} {vehicle.make} {vehicle.model}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <Input
                                        id="assignedCar"
                                        placeholder="e.g., CV-201, Patrol Car 5..."
                                        value={assignedCar}
                                        onChange={(e) => setAssignedCar(e.target.value)}
                                        className="mt-1"
                                        maxLength={20}
                                    />
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                    The vehicle you're currently assigned to
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