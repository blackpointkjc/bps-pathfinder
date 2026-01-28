import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Car, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function UnitSettingsPanel({ isOpen, onClose }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [unitNumber, setUnitNumber] = useState('');
    const [selectedAsset, setSelectedAsset] = useState('');
    const [vehicles, setVehicles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        if (isOpen) {
            loadUserProfile();
            loadVehicles();
        }
    }, [isOpen]);

    const loadUserProfile = async () => {
        try {
            const user = await base44.auth.me();
            setCurrentUser(user);
            
            // Load saved unit profile
            const profiles = await base44.entities.UserUnitProfile.filter({ 
                user_id: user.id 
            });
            
            if (profiles.length > 0) {
                const profile = profiles[0];
                setUnitNumber(profile.current_unit_number || '');
                setSelectedAsset(profile.current_asset_id || '');
                setLastUpdated(profile.last_updated_at);
            } else {
                // Fallback to user entity data
                setUnitNumber(user.unit_number || '');
                setSelectedAsset(user.assigned_vehicle || '');
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    };

    const loadVehicles = async () => {
        try {
            const vehicleList = await base44.entities.Vehicle.list();
            setVehicles(vehicleList.filter(v => v.status === 'Active'));
        } catch (error) {
            console.error('Error loading vehicles:', error);
            setVehicles([]);
        }
    };

    const handleSave = async () => {
        if (!unitNumber.trim()) {
            toast.error('Unit number is required');
            return;
        }

        setSaving(true);
        try {
            const now = new Date().toISOString();
            
            // Update or create unit profile
            const profiles = await base44.entities.UserUnitProfile.filter({ 
                user_id: currentUser.id 
            });
            
            if (profiles.length > 0) {
                await base44.entities.UserUnitProfile.update(profiles[0].id, {
                    current_unit_number: unitNumber,
                    current_asset_id: selectedAsset || null,
                    last_updated_at: now,
                    last_updated_by: currentUser.full_name
                });
            } else {
                await base44.entities.UserUnitProfile.create({
                    user_id: currentUser.id,
                    current_unit_number: unitNumber,
                    current_asset_id: selectedAsset || null,
                    last_updated_at: now,
                    last_updated_by: currentUser.full_name
                });
            }
            
            // Also update user entity for backward compatibility
            await base44.auth.updateMe({
                unit_number: unitNumber,
                assigned_vehicle: selectedAsset || null
            });
            
            // Log the change
            await base44.entities.AuditLog.create({
                entity_type: 'UserUnitProfile',
                entity_id: currentUser.id,
                action: 'update',
                actor_id: currentUser.id,
                actor_name: currentUser.full_name,
                field_changed: 'unit_number',
                before_value: profiles[0]?.current_unit_number || 'none',
                after_value: unitNumber,
                timestamp: now
            });
            
            toast.success('Unit settings saved');
            setLastUpdated(now);
            onClose();
        } catch (error) {
            console.error('Error saving unit settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleAssetChange = (assetId) => {
        setSelectedAsset(assetId);
        
        // Auto-fill unit number from vehicle if available
        const vehicle = vehicles.find(v => v.id === assetId);
        if (vehicle && vehicle.vehicle_id) {
            setUnitNumber(vehicle.vehicle_id);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[2200]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, x: 300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-96 z-[2201] bg-white shadow-2xl pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-full flex flex-col">
                            {/* Header */}
                            <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Car className="w-5 h-5 text-white" />
                                    <h3 className="text-white font-bold text-lg">Unit Settings</h3>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                    className="text-white hover:bg-white/20 p-2 rounded-md transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <p className="text-sm text-blue-900 font-medium">
                                        {currentUser?.full_name}
                                    </p>
                                    <p className="text-xs text-blue-700 mt-1">
                                        {currentUser?.email}
                                    </p>
                                </div>

                                <div>
                                    <Label htmlFor="unit-number" className="text-sm font-semibold text-gray-700 mb-2 block">
                                        Unit/Car Number *
                                    </Label>
                                    <Input
                                        id="unit-number"
                                        value={unitNumber}
                                        onChange={(e) => setUnitNumber(e.target.value)}
                                        placeholder="e.g., 201, Unit 45"
                                        className="text-lg"
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        This is your current unit identifier shown on the map
                                    </p>
                                </div>

                                <div>
                                    <Label htmlFor="asset" className="text-sm font-semibold text-gray-700 mb-2 block">
                                        Assigned Vehicle/Asset
                                    </Label>
                                    <Select value={selectedAsset} onValueChange={handleAssetChange}>
                                        <SelectTrigger id="asset" className="pointer-events-auto">
                                            <SelectValue placeholder="Select vehicle..." />
                                        </SelectTrigger>
                                        <SelectContent className="z-[9999] pointer-events-auto bg-white">
                                            <SelectItem value={null}>None</SelectItem>
                                            {vehicles.map((vehicle) => (
                                                <SelectItem key={vehicle.id} value={vehicle.id}>
                                                    {vehicle.vehicle_id} - {vehicle.make} {vehicle.model}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Select the vehicle you're currently using
                                    </p>
                                </div>

                                {lastUpdated && (
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <TrendingUp className="w-4 h-4" />
                                            <span className="text-xs">
                                                Last updated: {new Date(lastUpdated).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="border-t p-6 space-y-3 pointer-events-auto">
                                <Button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleSave();
                                    }}
                                    disabled={saving || !unitNumber.trim()}
                                    className="w-full bg-blue-600 hover:bg-blue-700 pointer-events-auto"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {saving ? 'Saving...' : 'Save Settings'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                    className="w-full pointer-events-auto"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}