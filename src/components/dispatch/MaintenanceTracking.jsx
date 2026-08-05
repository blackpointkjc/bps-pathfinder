import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Wrench, AlertTriangle, Plus, CheckCircle, Trash2 } from 'lucide-react';

export default function MaintenanceTracking({ units }) {
    const [maintenance, setMaintenance] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        vehicle_id: '',
        unit_number: '',
        maintenance_type: 'oil_change',
        description: '',
        due_date: '',
        due_mileage: '',
        notes: ''
    });

    useEffect(() => {
        loadMaintenance();
        loadVehicles();
    }, []);

    const loadVehicles = async () => {
        try {
            const data = await base44.entities.Vehicle.list('-created_date', 100);
            setVehicles(data || []);
        } catch (error) {
            console.error('Error loading vehicles:', error);
        }
    };

    const loadMaintenance = async () => {
        try {
            const data = await base44.entities.UnitMaintenance.list('-due_date', 100);
            setMaintenance(data || []);
        } catch (error) {
            console.error('Error loading maintenance:', error);
        }
    };

    const createMaintenance = async () => {
        if (!formData.vehicle_id || !formData.due_date) {
            toast.error('Vehicle and due date required');
            return;
        }

        try {
            const dataToCreate = {
                vehicle_id: formData.vehicle_id,
                unit_number: formData.unit_number || '',
                maintenance_type: formData.maintenance_type,
                description: formData.description || '',
                due_date: formData.due_date,
                notes: formData.notes || ''
            };

            // Only add due_mileage if it has a value
            if (formData.due_mileage && formData.due_mileage !== '') {
                dataToCreate.due_mileage = parseFloat(formData.due_mileage);
            }

            console.log('Creating maintenance with data:', dataToCreate);
            await base44.entities.UnitMaintenance.create(dataToCreate);
            
            setShowForm(false);
            setFormData({ vehicle_id: '', unit_number: '', maintenance_type: 'oil_change', description: '', due_date: '', due_mileage: '', notes: '' });
            await loadMaintenance();
            toast.success('Maintenance scheduled');
        } catch (error) {
            console.error('Error creating maintenance:', error);
            toast.error('Failed to schedule: ' + error.message);
        }
    };

    const completeMaintenance = async (id) => {
        try {
            await base44.entities.UnitMaintenance.update(id, {
                completed: true,
                completed_date: new Date().toISOString()
            });
            await loadMaintenance();
            toast.success('Marked as complete');
        } catch (error) {
            console.error('Error completing maintenance:', error);
            toast.error('Failed to update');
        }
    };

    const deleteMaintenance = async (id) => {
        try {
            await base44.entities.UnitMaintenance.delete(id);
            await loadMaintenance();
            toast.success('Deleted');
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error('Failed to delete');
        }
    };

    const overdue = maintenance.filter(m => !m.completed && new Date(m.due_date) < new Date());
    const upcoming = maintenance.filter(m => !m.completed && new Date(m.due_date) >= new Date());
    const completed = maintenance.filter(m => m.completed);

    return (
        <div className="font-mono">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-gold rounded-sm" />
                    <Wrench className="w-4 h-4 text-gold" />
                    <span className="text-white font-bold text-sm tracking-widest">MAINTENANCE TRACKING</span>
                    <span className="text-slate-500 text-[10px] ml-1">{maintenance.length} RECORDS</span>
                </div>
                <button onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 border border-gold/40 text-gold hover:bg-gold/20 text-[10px] font-bold rounded transition-all">
                    <Plus className="w-3 h-3" />
                    ADD RECORD
                </button>
            </div>

            {overdue.length > 0 && (
                <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-[10px]">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-red-400 font-bold">{overdue.length} OVERDUE MAINTENANCE ITEM(S)</span>
                </div>
            )}

            {showForm && (
                <div className="bg-slate-900 border border-slate-700 rounded p-4 mb-4 space-y-3">
                    <div className="text-[10px] text-gold font-bold tracking-widest mb-2">NEW MAINTENANCE RECORD</div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-slate-500 font-mono text-[10px] tracking-widest">VEHICLE</Label>
                            <select value={formData.vehicle_id}
                                onChange={e => {
                                    const sel = vehicles.find(v => v.vehicle_id === e.target.value);
                                    setFormData({ ...formData, vehicle_id: e.target.value, unit_number: units?.find(u => u.id === sel?.assigned_to)?.unit_number || '' });
                                }}
                                className="mt-1 w-full h-9 bg-slate-800 border border-slate-700 text-white font-mono text-xs rounded px-2">
                                <option value="">Select Vehicle</option>
                                {vehicles.map(v => <option key={v.id} value={v.vehicle_id}>{v.vehicle_id} — {v.year} {v.make} {v.model}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label className="text-slate-500 font-mono text-[10px] tracking-widest">UNIT NUMBER</Label>
                            <select value={formData.unit_number}
                                onChange={e => setFormData({...formData, unit_number: e.target.value})}
                                className="mt-1 w-full h-9 bg-slate-800 border border-slate-700 text-white font-mono text-xs rounded px-2">
                                <option value="">Select Unit</option>
                                {units?.map(u => <option key={u.id} value={u.unit_number}>{u.unit_number || u.full_name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <Label className="text-slate-500 font-mono text-[10px] tracking-widest">TYPE</Label>
                        <select value={formData.maintenance_type}
                            onChange={e => setFormData({...formData, maintenance_type: e.target.value})}
                            className="mt-1 w-full h-9 bg-slate-800 border border-slate-700 text-white font-mono text-xs rounded px-2">
                            <option value="oil_change">Oil Change</option>
                            <option value="tire_rotation">Tire Rotation</option>
                            <option value="inspection">Inspection</option>
                            <option value="repair">Repair</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <Label className="text-slate-500 font-mono text-[10px] tracking-widest">DESCRIPTION</Label>
                        <Textarea value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            placeholder="Describe the maintenance..."
                            rows={2}
                            className="mt-1 bg-slate-800 border-slate-700 text-white font-mono text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-slate-500 font-mono text-[10px] tracking-widest">DUE DATE</Label>
                            <Input type="date" value={formData.due_date}
                                onChange={e => setFormData({...formData, due_date: e.target.value})}
                                className="mt-1 bg-slate-800 border-slate-700 text-white font-mono text-xs" />
                        </div>
                        <div>
                            <Label className="text-slate-500 font-mono text-[10px] tracking-widest">DUE MILEAGE</Label>
                            <Input type="number" value={formData.due_mileage}
                                onChange={e => setFormData({...formData, due_mileage: e.target.value})}
                                placeholder="Optional"
                                className="mt-1 bg-slate-800 border-slate-700 text-white font-mono text-xs" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={createMaintenance}
                            className="flex-1 py-2 bg-gold/10 border border-gold/50 text-gold hover:bg-gold/20 font-mono text-xs font-bold rounded transition-all">CREATE</button>
                        <button onClick={() => setShowForm(false)}
                            className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-mono text-xs rounded transition-all">CANCEL</button>
                    </div>
                </div>
            )}

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {overdue.length > 0 && (
                    <div>
                        <div className="text-[9px] text-red-400 font-bold tracking-widest mb-2 px-1">OVERDUE</div>
                        {overdue.map(item => <MaintenanceCard key={item.id} item={item} onComplete={completeMaintenance} onDelete={deleteMaintenance} isOverdue />)}
                    </div>
                )}
                {upcoming.length > 0 && (
                    <div>
                        <div className="text-[9px] text-yellow-400 font-bold tracking-widest mb-2 px-1">UPCOMING</div>
                        {upcoming.map(item => <MaintenanceCard key={item.id} item={item} onComplete={completeMaintenance} onDelete={deleteMaintenance} />)}
                    </div>
                )}
                {completed.length > 0 && (
                    <div>
                        <div className="text-[9px] text-green-400 font-bold tracking-widest mb-2 px-1">COMPLETED</div>
                        {completed.map(item => <MaintenanceCard key={item.id} item={item} onDelete={deleteMaintenance} isCompleted />)}
                    </div>
                )}
                {maintenance.length === 0 && (
                    <div className="text-center py-12">
                        <Wrench className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-600 text-xs font-mono">NO MAINTENANCE RECORDS</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function MaintenanceCard({ item, onComplete, onDelete, isOverdue, isCompleted }) {
    return (
        <div className={`flex items-start justify-between px-3 py-2.5 rounded mb-1.5 border font-mono text-[10px] ${
            isOverdue ? 'bg-red-500/5 border-red-500/25' :
            isCompleted ? 'bg-slate-900/40 border-slate-800 opacity-60' :
            'bg-slate-900 border-slate-800'
        }`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{item.vehicle_id}</span>
                    {item.unit_number && <span className="text-slate-500">#{item.unit_number}</span>}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                        isOverdue ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        isCompleted ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    }`}>{item.maintenance_type.replace('_', ' ').toUpperCase()}</span>
                </div>
                {item.description && <div className="text-slate-500 mt-0.5 truncate">{item.description}</div>}
                <div className="flex items-center gap-3 mt-1 text-[9px]">
                    <span className={isOverdue ? 'text-red-400' : 'text-slate-500'}>DUE: {new Date(item.due_date).toLocaleDateString()}</span>
                    {item.due_mileage && <span className="text-slate-600">@ {item.due_mileage} MI</span>}
                    {isCompleted && <span className="text-green-400">✓ {new Date(item.completed_date).toLocaleDateString()}</span>}
                </div>
            </div>
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {!isCompleted && (
                    <button onClick={() => onComplete(item.id)}
                        className="p-1 text-slate-500 hover:text-green-400 transition-colors">
                        <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                )}
                <button onClick={() => onDelete(item.id)}
                    className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}