import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Car, Plus, Edit, Trash2 } from 'lucide-react';

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
            'Active': 'bg-green-500/10 text-green-400 border border-green-500/30',
            'Maintenance': 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
            'Out of Service': 'bg-red-500/10 text-red-400 border border-red-500/30',
            'Retired': 'bg-slate-700 text-slate-400 border border-slate-600'
        };
        return colors[status] || 'bg-slate-700 text-slate-400 border border-slate-600';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="font-mono">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-gold rounded-sm" />
                    <Car className="w-4 h-4 text-gold" />
                    <span className="text-white font-bold text-sm tracking-widest">FLEET ASSETS</span>
                    <span className="text-slate-500 text-[10px] ml-1">{vehicles.length} RECORDS</span>
                </div>
                <button
                    onClick={() => { resetForm(); setEditingVehicle(null); setShowDialog(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 border border-gold/40 text-gold hover:bg-gold/20 text-[10px] font-bold rounded transition-all"
                >
                    <Plus className="w-3 h-3" />
                    ADD VEHICLE
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="bg-slate-900 border border-slate-800 rounded hover:border-slate-700 transition-all">
                        <div className="flex items-start justify-between px-3 pt-3 pb-2 border-b border-slate-800">
                            <div>
                                <div className="text-white font-bold text-sm">{vehicle.vehicle_id}</div>
                                <div className="text-slate-500 text-[10px] mt-0.5">{vehicle.year} {vehicle.make} {vehicle.model}</div>
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${getStatusColor(vehicle.status)}`}>{vehicle.status?.toUpperCase()}</span>
                        </div>
                        <div className="px-3 py-2 space-y-1 text-[10px]">
                            {vehicle.license_plate && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">PLATE</span>
                                    <span className="text-slate-300 font-bold">{vehicle.license_plate}</span>
                                </div>
                            )}
                            {vehicle.mileage > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">MILEAGE</span>
                                    <span className="text-slate-300 font-bold">{vehicle.mileage.toLocaleString()} MI</span>
                                </div>
                            )}
                            {vehicle.vin && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">VIN</span>
                                    <span className="text-slate-400 text-[9px] truncate ml-2 max-w-[120px]">{vehicle.vin}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-1 px-3 pb-3">
                            <button onClick={() => handleEdit(vehicle)}
                                className="flex-1 py-1 text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-400 hover:text-gold hover:border-gold/40 rounded transition-all flex items-center justify-center gap-1">
                                <Edit className="w-2.5 h-2.5" /> EDIT
                            </button>
                            <button onClick={() => handleDelete(vehicle.id)}
                                className="px-2 py-1 text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all">
                                <Trash2 className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {vehicles.length === 0 && (
                <div className="text-center py-12">
                    <Car className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-600 text-xs font-mono">NO VEHICLES ON RECORD</p>
                    <button onClick={() => { resetForm(); setEditingVehicle(null); setShowDialog(true); }}
                        className="mt-4 px-4 py-2 bg-gold/10 border border-gold/40 text-gold text-[10px] font-bold rounded hover:bg-gold/20 transition-all">
                        + ADD VEHICLE
                    </button>
                </div>
            )}

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white font-mono text-sm tracking-widest flex items-center gap-2">
                            <Car className="w-4 h-4 text-gold" />
                            {editingVehicle ? 'EDIT VEHICLE RECORD' : 'ADD VEHICLE RECORD'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">VEHICLE ID *</Label>
                                <Input value={formData.vehicle_id} onChange={e => setFormData({...formData, vehicle_id: e.target.value})} placeholder="Unit 23" required className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                            </div>
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">STATUS</Label>
                                <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white font-mono mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {['Active','Maintenance','Out of Service','Retired'].map(s => <SelectItem key={s} value={s} className="text-white font-mono">{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">MAKE *</Label>
                                <Input value={formData.make} onChange={e => setFormData({...formData, make: e.target.value})} placeholder="Ford" required className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                            </div>
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">MODEL *</Label>
                                <Input value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} placeholder="Explorer" required className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                            </div>
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">YEAR *</Label>
                                <Input type="number" value={formData.year} onChange={e => setFormData({...formData, year: parseInt(e.target.value)})} required className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">LICENSE PLATE</Label>
                                <Input value={formData.license_plate} onChange={e => setFormData({...formData, license_plate: e.target.value})} placeholder="ABC-1234" className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                            </div>
                            <div>
                                <Label className="text-slate-500 font-mono text-[10px] tracking-widest">MILEAGE</Label>
                                <Input type="number" value={formData.mileage} onChange={e => setFormData({...formData, mileage: parseInt(e.target.value)})} className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                            </div>
                        </div>
                        <div>
                            <Label className="text-slate-500 font-mono text-[10px] tracking-widest">VIN</Label>
                            <Input value={formData.vin} onChange={e => setFormData({...formData, vin: e.target.value})} placeholder="1HGBH41JXMN109186" className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                        </div>
                        <div>
                            <Label className="text-slate-500 font-mono text-[10px] tracking-widest">NOTES</Label>
                            <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Additional notes..." className="bg-slate-800 border-slate-700 text-white font-mono mt-1" />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => setShowDialog(false)}
                                className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-mono text-xs rounded transition-all">
                                CANCEL
                            </button>
                            <button type="submit"
                                className="flex-1 py-2 bg-gold/10 border border-gold/50 text-gold hover:bg-gold/20 font-mono text-xs font-bold rounded transition-all">
                                {editingVehicle ? 'UPDATE RECORD' : 'ADD VEHICLE'}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}