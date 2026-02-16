import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Plus, Edit2, Trash2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function PropertyMonitoring() {
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [editingProperty, setEditingProperty] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        latitude: '',
        longitude: '',
        radiusMeters: 500,
        enabled: true
    });

    useEffect(() => {
        loadProperties();
    }, []);

    const loadProperties = async () => {
        try {
            const data = await base44.entities.MonitoredProperty.list('-created_date');
            setProperties(data || []);
        } catch (error) {
            console.error('Error loading properties:', error);
            toast.error('Failed to load properties');
        } finally {
            setLoading(false);
        }
    };

    const handleAddNew = () => {
        setEditingProperty(null);
        setFormData({
            name: '',
            address: '',
            latitude: '',
            longitude: '',
            radiusMeters: 500,
            enabled: true
        });
        setShowDialog(true);
    };

    const handleEdit = (property) => {
        setEditingProperty(property);
        setFormData({
            name: property.name,
            address: property.address,
            latitude: property.latitude,
            longitude: property.longitude,
            radiusMeters: property.radiusMeters,
            enabled: property.enabled
        });
        setShowDialog(true);
    };

    const handleSave = async () => {
        try {
            // Validate
            if (!formData.name || !formData.address) {
                toast.error('Name and address are required');
                return;
            }
            if (!formData.latitude || !formData.longitude) {
                toast.error('Latitude and longitude are required');
                return;
            }
            if (!formData.radiusMeters || formData.radiusMeters <= 0) {
                toast.error('Radius must be greater than 0');
                return;
            }

            const data = {
                name: formData.name,
                address: formData.address,
                latitude: parseFloat(formData.latitude),
                longitude: parseFloat(formData.longitude),
                radiusMeters: parseInt(formData.radiusMeters),
                enabled: formData.enabled
            };

            if (editingProperty) {
                await base44.entities.MonitoredProperty.update(editingProperty.id, data);
                toast.success('Property updated');
            } else {
                await base44.entities.MonitoredProperty.create(data);
                toast.success('Property added');
            }

            setShowDialog(false);
            await loadProperties();
        } catch (error) {
            console.error('Error saving property:', error);
            toast.error('Failed to save property');
        }
    };

    const handleDelete = async (property) => {
        if (!confirm(`Delete property "${property.name}"? Past alerts will be preserved.`)) {
            return;
        }

        try {
            await base44.entities.MonitoredProperty.delete(property.id);
            toast.success('Property deleted');
            await loadProperties();
        } catch (error) {
            console.error('Error deleting property:', error);
            toast.error('Failed to delete property');
        }
    };

    const handleToggleEnabled = async (property) => {
        try {
            await base44.entities.MonitoredProperty.update(property.id, {
                enabled: !property.enabled
            });
            toast.success(property.enabled ? 'Property disabled' : 'Property enabled');
            await loadProperties();
        } catch (error) {
            console.error('Error updating property:', error);
            toast.error('Failed to update property');
        }
    };

    const handleGeocode = async () => {
        if (!formData.address) {
            toast.error('Enter an address first');
            return;
        }

        try {
            toast.loading('Geocoding address...');
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `What are the exact GPS coordinates (latitude and longitude) for this address: "${formData.address}"? Return ONLY a JSON object with "latitude" and "longitude" as numbers. No other text.`,
                add_context_from_internet: true,
                response_json_schema: {
                    type: "object",
                    properties: {
                        latitude: { type: "number" },
                        longitude: { type: "number" }
                    },
                    required: ["latitude", "longitude"]
                }
            });

            if (result.latitude && result.longitude) {
                setFormData({
                    ...formData,
                    latitude: result.latitude.toString(),
                    longitude: result.longitude.toString()
                });
                toast.success('Coordinates found!');
            } else {
                toast.error('Could not find coordinates');
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            toast.error('Geocoding failed');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white font-mono flex items-center gap-2">
                        <MapPin className="w-6 h-6 text-blue-400" />
                        PROPERTY MONITORING
                    </h2>
                    <p className="text-sm text-slate-400 font-mono mt-1">
                        Automatically alert all users when calls occur near monitored properties
                    </p>
                </div>
                <Button onClick={handleAddNew} className="bg-blue-600 hover:bg-blue-700 font-mono">
                    <Plus className="w-4 h-4 mr-2" />
                    ADD PROPERTY
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {properties.length === 0 ? (
                    <Card className="bg-slate-900 border-slate-800 p-8 col-span-full">
                        <div className="text-center text-slate-500 font-mono">
                            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No monitored properties yet</p>
                            <p className="text-xs mt-1">Add a property to start monitoring</p>
                        </div>
                    </Card>
                ) : (
                    properties.map((property) => (
                        <Card key={property.id} className="bg-slate-900 border-slate-800 p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <h3 className="text-white font-mono font-bold text-sm flex items-center gap-2">
                                        {property.name}
                                        {property.enabled ? (
                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-red-400" />
                                        )}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-mono mt-1">
                                        {property.address}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 text-xs font-mono text-slate-400 mb-3">
                                <div className="flex justify-between">
                                    <span>Coordinates:</span>
                                    <span className="text-slate-300">
                                        {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Radius:</span>
                                    <span className="text-slate-300">{property.radiusMeters}m</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Status:</span>
                                    <span className={property.enabled ? 'text-green-400' : 'text-red-400'}>
                                        {property.enabled ? 'ACTIVE' : 'DISABLED'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEdit(property)}
                                    className="flex-1 bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 font-mono text-xs"
                                >
                                    <Edit2 className="w-3 h-3 mr-1" />
                                    EDIT
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleToggleEnabled(property)}
                                    className={`flex-1 border-slate-700 font-mono text-xs ${
                                        property.enabled
                                            ? 'bg-green-900/20 text-green-400 hover:bg-green-900/40'
                                            : 'bg-red-900/20 text-red-400 hover:bg-red-900/40'
                                    }`}
                                >
                                    {property.enabled ? 'DISABLE' : 'ENABLE'}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDelete(property)}
                                    className="bg-red-900/20 border-red-900/50 text-red-400 hover:bg-red-900/40 font-mono text-xs"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
                    <DialogHeader>
                        <DialogTitle className="text-white font-mono flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-blue-400" />
                            {editingProperty ? 'EDIT PROPERTY' : 'ADD PROPERTY'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-slate-300 font-mono text-xs">PROPERTY NAME</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Police Headquarters"
                                className="bg-slate-800 border-slate-700 text-white font-mono"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300 font-mono text-xs">ADDRESS</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="e.g., 200 W Grace St, Richmond, VA"
                                    className="flex-1 bg-slate-800 border-slate-700 text-white font-mono"
                                />
                                <Button
                                    type="button"
                                    onClick={handleGeocode}
                                    disabled={!formData.address}
                                    className="bg-blue-600 hover:bg-blue-700 font-mono text-xs"
                                >
                                    <MapPin className="w-3 h-3 mr-1" />
                                    GEOCODE
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300 font-mono text-xs">LATITUDE</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={formData.latitude}
                                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                                    placeholder="37.5407"
                                    className="bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300 font-mono text-xs">LONGITUDE</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={formData.longitude}
                                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                                    placeholder="-77.4360"
                                    className="bg-slate-800 border-slate-700 text-white font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300 font-mono text-xs">
                                MONITORING RADIUS (METERS)
                            </Label>
                            <Input
                                type="number"
                                value={formData.radiusMeters}
                                onChange={(e) => setFormData({ ...formData, radiusMeters: e.target.value })}
                                placeholder="500"
                                className="bg-slate-800 border-slate-700 text-white font-mono"
                            />
                            <p className="text-xs text-slate-500 font-mono mt-1">
                                Alerts trigger when calls occur within this radius
                            </p>
                        </div>

                        <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                            <Label className="text-slate-300 font-mono text-xs">ENABLED</Label>
                            <Switch
                                checked={formData.enabled}
                                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                            />
                        </div>

                        <div className="flex gap-2 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setShowDialog(false)}
                                className="flex-1 bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 font-mono"
                            >
                                CANCEL
                            </Button>
                            <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700 font-mono">
                                {editingProperty ? 'UPDATE' : 'ADD'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}