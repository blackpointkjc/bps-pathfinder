import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Wrench, AlertTriangle, Plus, CheckCircle, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MaintenanceTracking({ units }) {
    const [maintenance, setMaintenance] = useState([]);
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
    }, []);

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
            await base44.entities.UnitMaintenance.create(formData);
            setShowForm(false);
            setFormData({ vehicle_id: '', unit_number: '', maintenance_type: 'oil_change', description: '', due_date: '', due_mileage: '', notes: '' });
            await loadMaintenance();
            toast.success('Maintenance scheduled');
        } catch (error) {
            console.error('Error creating maintenance:', error);
            toast.error('Failed to schedule');
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
        <Card className="p-6 bg-slate-900/95 border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-orange-500" />
                    Maintenance Tracking
                </h2>
                <Button onClick={() => setShowForm(!showForm)} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Record
                </Button>
            </div>

            {overdue.length > 0 && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-semibold">{overdue.length} overdue maintenance item(s)</span>
                    </div>
                </div>
            )}

            {showForm && (
                <Card className="p-4 mb-4 bg-slate-800 border-slate-700">
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-slate-300">Vehicle ID</Label>
                                <Input
                                    value={formData.vehicle_id}
                                    onChange={(e) => setFormData({...formData, vehicle_id: e.target.value})}
                                    placeholder="e.g., V-123"
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Unit Number</Label>
                                <select
                                    value={formData.unit_number}
                                    onChange={(e) => setFormData({...formData, unit_number: e.target.value})}
                                    className="flex h-10 w-full rounded-md border bg-slate-900 border-slate-700 text-white px-3 py-2 text-sm"
                                >
                                    <option value="">Select Unit</option>
                                    {units.map(unit => (
                                        <option key={unit.id} value={unit.unit_number}>
                                            {unit.unit_number || unit.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <Label className="text-slate-300">Type</Label>
                            <select
                                value={formData.maintenance_type}
                                onChange={(e) => setFormData({...formData, maintenance_type: e.target.value})}
                                className="flex h-10 w-full rounded-md border bg-slate-900 border-slate-700 text-white px-3 py-2 text-sm"
                            >
                                <option value="oil_change">Oil Change</option>
                                <option value="tire_rotation">Tire Rotation</option>
                                <option value="inspection">Inspection</option>
                                <option value="repair">Repair</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <Label className="text-slate-300">Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                placeholder="Describe the maintenance..."
                                rows={2}
                                className="bg-slate-900 border-slate-700 text-white"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-slate-300">Due Date</Label>
                                <Input
                                    type="date"
                                    value={formData.due_date}
                                    onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Due Mileage</Label>
                                <Input
                                    type="number"
                                    value={formData.due_mileage}
                                    onChange={(e) => setFormData({...formData, due_mileage: e.target.value})}
                                    placeholder="Optional"
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={createMaintenance} className="flex-1">Create</Button>
                            <Button onClick={() => setShowForm(false)} variant="outline" className="flex-1">Cancel</Button>
                        </div>
                    </div>
                </Card>
            )}

            <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                    {overdue.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-red-400 mb-2">Overdue</h3>
                            {overdue.map(item => (
                                <MaintenanceCard key={item.id} item={item} onComplete={completeMaintenance} onDelete={deleteMaintenance} isOverdue />
                            ))}
                        </div>
                    )}

                    {upcoming.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-yellow-400 mb-2">Upcoming</h3>
                            {upcoming.map(item => (
                                <MaintenanceCard key={item.id} item={item} onComplete={completeMaintenance} onDelete={deleteMaintenance} />
                            ))}
                        </div>
                    )}

                    {completed.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-green-400 mb-2">Completed</h3>
                            {completed.map(item => (
                                <MaintenanceCard key={item.id} item={item} onDelete={deleteMaintenance} isCompleted />
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </Card>
    );
}

function MaintenanceCard({ item, onComplete, onDelete, isOverdue, isCompleted }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-lg mb-2 ${
                isOverdue ? 'bg-red-900/20 border border-red-700' :
                isCompleted ? 'bg-green-900/20 border border-green-700 opacity-60' :
                'bg-slate-800 border border-slate-700'
            }`}
        >
            <div className="flex items-start justify-between mb-2">
                <div>
                    <h4 className="font-semibold text-white">
                        {item.vehicle_id} {item.unit_number && `(${item.unit_number})`}
                    </h4>
                    <p className="text-sm text-slate-400">{item.maintenance_type.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {!isCompleted && (
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onComplete(item.id)}
                            className="h-7 w-7 text-green-400"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </Button>
                    )}
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(item.id)}
                        className="h-7 w-7 text-red-400"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            {item.description && <p className="text-xs text-slate-400 mb-2">{item.description}</p>}
            <div className="flex items-center gap-3 text-xs">
                <span className={isOverdue ? 'text-red-400' : 'text-slate-400'}>
                    Due: {new Date(item.due_date).toLocaleDateString()}
                </span>
                {item.due_mileage && <span className="text-slate-400">@ {item.due_mileage} mi</span>}
                {isCompleted && (
                    <Badge className="bg-green-600 text-white">
                        Completed {new Date(item.completed_date).toLocaleDateString()}
                    </Badge>
                )}
            </div>
        </motion.div>
    );
}