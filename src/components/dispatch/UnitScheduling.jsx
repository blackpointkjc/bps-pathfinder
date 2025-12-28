import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Calendar, Clock, Plus, Trash2, Edit } from 'lucide-react';
import { motion } from 'framer-motion';

export default function UnitScheduling({ units, currentUser }) {
    const [schedules, setSchedules] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [formData, setFormData] = useState({
        unit_id: '',
        unit_name: '',
        shift_start: '',
        shift_end: '',
        shift_type: 'day',
        notes: ''
    });

    useEffect(() => {
        loadSchedules();
    }, [selectedDate]);

    const loadSchedules = async () => {
        try {
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            const data = await base44.entities.UnitSchedule.list('-shift_start', 100);
            const filtered = data.filter(s => {
                const shiftDate = new Date(s.shift_start);
                return shiftDate >= startOfDay && shiftDate <= endOfDay;
            });
            setSchedules(filtered || []);
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    };

    const createSchedule = async () => {
        if (!formData.unit_id || !formData.shift_start || !formData.shift_end) {
            toast.error('Unit, start time, and end time required');
            return;
        }

        try {
            const unit = units.find(u => u.id === formData.unit_id);
            await base44.entities.UnitSchedule.create({
                ...formData,
                unit_name: unit?.unit_number || 'Unit',
                shift_start: new Date(formData.shift_start).toISOString(),
                shift_end: new Date(formData.shift_end).toISOString()
            });
            
            setShowForm(false);
            setFormData({ unit_id: '', unit_name: '', shift_start: '', shift_end: '', shift_type: 'day', notes: '' });
            await loadSchedules();
            toast.success('Shift scheduled');
        } catch (error) {
            console.error('Error creating schedule:', error);
            toast.error('Failed to create schedule');
        }
    };

    const deleteSchedule = async (id) => {
        try {
            await base44.entities.UnitSchedule.delete(id);
            await loadSchedules();
            toast.success('Schedule deleted');
        } catch (error) {
            console.error('Error deleting schedule:', error);
            toast.error('Failed to delete');
        }
    };

    const getShiftColor = (type) => {
        switch(type) {
            case 'day': return 'bg-yellow-600';
            case 'swing': return 'bg-orange-600';
            case 'night': return 'bg-indigo-600';
            case 'overtime': return 'bg-red-600';
            default: return 'bg-slate-600';
        }
    };

    return (
        <Card className="p-6 bg-slate-900/95 border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-500" />
                    Unit Scheduling
                </h2>
                <Button onClick={() => setShowForm(!showForm)} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Shift
                </Button>
            </div>

            <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mb-4 bg-slate-800 border-slate-700 text-white"
            />

            {showForm && (
                <Card className="p-4 mb-4 bg-slate-800 border-slate-700">
                    <div className="space-y-3">
                        <div>
                            <Label className="text-slate-300">Unit</Label>
                            <select
                                value={formData.unit_id}
                                onChange={(e) => setFormData({...formData, unit_id: e.target.value})}
                                className="flex h-10 w-full rounded-md border bg-slate-900 border-slate-700 text-white px-3 py-2 text-sm"
                            >
                                <option value="">Select Unit</option>
                                {units.map(unit => (
                                    <option key={unit.id} value={unit.id}>
                                        {unit.unit_number || unit.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-slate-300">Start Time</Label>
                                <Input
                                    type="datetime-local"
                                    value={formData.shift_start}
                                    onChange={(e) => setFormData({...formData, shift_start: e.target.value})}
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">End Time</Label>
                                <Input
                                    type="datetime-local"
                                    value={formData.shift_end}
                                    onChange={(e) => setFormData({...formData, shift_end: e.target.value})}
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-slate-300">Shift Type</Label>
                            <select
                                value={formData.shift_type}
                                onChange={(e) => setFormData({...formData, shift_type: e.target.value})}
                                className="flex h-10 w-full rounded-md border bg-slate-900 border-slate-700 text-white px-3 py-2 text-sm"
                            >
                                <option value="day">Day Shift</option>
                                <option value="swing">Swing Shift</option>
                                <option value="night">Night Shift</option>
                                <option value="overtime">Overtime</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={createSchedule} className="flex-1">Create</Button>
                            <Button onClick={() => setShowForm(false)} variant="outline" className="flex-1">Cancel</Button>
                        </div>
                    </div>
                </Card>
            )}

            <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                    {schedules.map(schedule => (
                        <motion.div
                            key={schedule.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3 rounded-lg bg-slate-800 border border-slate-700"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h4 className="font-semibold text-white">{schedule.unit_name}</h4>
                                    <p className="text-sm text-slate-400">
                                        {new Date(schedule.shift_start).toLocaleTimeString()} - {new Date(schedule.shift_end).toLocaleTimeString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className={getShiftColor(schedule.shift_type)}>
                                        {schedule.shift_type}
                                    </Badge>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => deleteSchedule(schedule.id)}
                                        className="h-7 w-7 text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            {schedule.notes && <p className="text-xs text-slate-400 mt-1">{schedule.notes}</p>}
                        </motion.div>
                    ))}
                    {schedules.length === 0 && (
                        <p className="text-center text-slate-500 py-8">No shifts scheduled for this date</p>
                    )}
                </div>
            </ScrollArea>
        </Card>
    );
}