import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Car, Plus, Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function VehicleManagement() {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [formData, setFormData] = useState({
        vehicle_id: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        vin: '',
        license_plate: '',
        mileage: 0,
        status: 'Active',
        assigned_to: '',
        notes: ''
    });

    useEffect(() => {
        loadVehicles();
    }, []);

    const loadVehicles = async () => {
        try {
            const data = await base44.entities.Vehicle.list('-created_date', 100);
            setVehicles(data || []);
        } catch (error) {
            console.error('Error loading vehicles:', error);
            toast.error('Failed to load vehicles');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingVehicle) {
                await base44.entities.Vehicle.update(editingVehicle.id, formData);
                toast.success('Vehicle updated');
            } else {
                await base44.entities.Vehicle.create(formData);
                toast.success('Vehicle added');
            }
            setShowDialog(false);
            setEditingVehicle(null);
            resetForm();
            await loadVehicles();
        } catch (error) {
            console.error('Error saving vehicle:', error);
            toast.error('Failed to save vehicle');
        }
    };

    const handleEdit = (vehicle) => {
        setEditingVehicle(vehicle);
        setFormData({
            vehicle_id: vehicle.vehicle_id || '',
            make: vehicle.make || '',
            model: vehicle.model || '',
            year: vehicle.year || new Date().getFullYear(),
            vin: vehicle.vin || '',
            license_plate: vehicle.license_plate || '',
            mileage: vehicle.mileage || 0,
            status: vehicle.status || 'Active',
            assigned_to: vehicle.assigned_to || '',
            notes: vehicle.notes || ''
        });
        setShowDialog(true);
    };

    const handleDelete = async (vehicleId) => {
        if (!confirm('Are you sure you want to delete this vehicle?')) return;
        try {
            await base44.entities.Vehicle.delete(vehicleId);
            toast.success('Vehicle deleted');
            await loadVehicles();
        } catch (error) {
            console.error('Error deleting vehicle:', error);
            toast.error('Failed to delete vehicle');
        }
    };

    const resetForm = () => {
        setFormData({
            vehicle_id: '',
            make: '',
            model: '',
            year: new Date().getFullYear(),
            vin: '',
            license_plate: '',
            mileage: 0,
            status: 'Active',
            assigned_to: '',
            notes: ''
        });
    };

    const getStatusColor = (status) => {
        const colors = {
            'Active': 'bg-green-100 text-green-800',
            'Maintenance': 'bg-yellow-100 text-yellow-800',
            'Out of Service': 'bg-red-100 text-red-800',
            'Retired': 'bg-gray-100 text-gray-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Car className="w-6 h-6 text-blue-600" />
                    Vehicle Assets ({vehicles.length})
                </h2>
                <Button
                    onClick={() => {
                        resetForm();
                        setEditingVehicle(null);
                        setShowDialog(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vehicle
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicles.map((vehicle) => (
                    <Card key={vehicle.id} className="border-gray-200">
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="text-gray-900 text-lg">{vehicle.vehicle_id}</CardTitle>
                                    <p className="text-gray-600 text-sm">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                                </div>
                                <Badge className={getStatusColor(vehicle.status)}>{vehicle.status}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 text-sm text-gray-700">
                                {vehicle.license_plate && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Plate:</span>
                                        <span>{vehicle.license_plate}</span>
                                    </div>
                                )}
                                {vehicle.mileage > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Mileage:</span>
                                        <span>{vehicle.mileage.toLocaleString()} mi</span>
                                    </div>
                                )}
                                {vehicle.vin && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">VIN:</span>
                                        <span className="truncate ml-2 text-xs">{vehicle.vin}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 mt-4">
                                <Button
                                    onClick={() => handleEdit(vehicle)}
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                >
                                    <Edit className="w-3 h-3 mr-1" />
                                    Edit
                                </Button>
                                <Button
                                    onClick={() => handleDelete(vehicle.id)}
                                    size="sm"
                                    variant="outline"
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {vehicles.length === 0 && (
                <div className="text-center py-12">
                    <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No vehicles added yet</p>
                    <Button
                        onClick={() => {
                            resetForm();
                            setEditingVehicle(null);
                            setShowDialog(true);
                        }}
                        className="mt-4 bg-blue-600 hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Vehicle
                    </Button>
                </div>
            )}

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Vehicle ID *</Label>
                                <Input
                                    value={formData.vehicle_id}
                                    onChange={(e) => setFormData({...formData, vehicle_id: e.target.value})}
                                    placeholder="Unit 23"
                                    required
                                />
                            </div>
                            <div>
                                <Label>Status</Label>
                                <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Active">Active</SelectItem>
                                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                                        <SelectItem value="Out of Service">Out of Service</SelectItem>
                                        <SelectItem value="Retired">Retired</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <Label>Make *</Label>
                                <Input
                                    value={formData.make}
                                    onChange={(e) => setFormData({...formData, make: e.target.value})}
                                    placeholder="Ford"
                                    required
                                />
                            </div>
                            <div>
                                <Label>Model *</Label>
                                <Input
                                    value={formData.model}
                                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                                    placeholder="Explorer"
                                    required
                                />
                            </div>
                            <div>
                                <Label>Year *</Label>
                                <Input
                                    type="number"
                                    value={formData.year}
                                    onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
                                    required
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>License Plate</Label>
                                <Input
                                    value={formData.license_plate}
                                    onChange={(e) => setFormData({...formData, license_plate: e.target.value})}
                                    placeholder="ABC-1234"
                                />
                            </div>
                            <div>
                                <Label>Mileage</Label>
                                <Input
                                    type="number"
                                    value={formData.mileage}
                                    onChange={(e) => setFormData({...formData, mileage: parseInt(e.target.value)})}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>VIN</Label>
                            <Input
                                value={formData.vin}
                                onChange={(e) => setFormData({...formData, vin: e.target.value})}
                                placeholder="1HGBH41JXMN109186"
                            />
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                placeholder="Additional notes..."
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                                {editingVehicle ? 'Update' : 'Add'} Vehicle
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}