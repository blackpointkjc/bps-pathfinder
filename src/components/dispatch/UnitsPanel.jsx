import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Users, Search, MapPin, Clock, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function UnitsPanel({ units, selectedCall, currentUser, onUpdate }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filteredUnits = units.filter(unit => {
        const matchesSearch = searchQuery === '' || 
            unit.unit_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            unit.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || unit.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

    const statusCounts = {
        all: units.length,
        Available: units.filter(u => u.status === 'Available').length,
        Assigned: units.filter(u => u.status === 'Assigned').length,
        Enroute: units.filter(u => u.status === 'Enroute').length,
        'On Scene': units.filter(u => u.status === 'On Scene').length,
        'Out of Service': units.filter(u => u.status === 'Out of Service').length
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Available': return 'bg-green-600';
            case 'Assigned': return 'bg-yellow-600';
            case 'Enroute': return 'bg-blue-600';
            case 'On Scene': return 'bg-purple-600';
            case 'Busy': return 'bg-orange-600';
            case 'Out of Service': return 'bg-slate-600';
            default: return 'bg-slate-500';
        }
    };

    const assignUnit = async (unit) => {
        if (!selectedCall) {
            toast.error('Please select a call first');
            return;
        }

        try {
            const currentAssignments = selectedCall.assigned_units || [];
            const updatedAssignments = [...currentAssignments, unit.id];
            
            await base44.entities.DispatchCall.update(selectedCall.id, {
                assigned_units: updatedAssignments,
                status: 'Dispatched',
                time_dispatched: new Date().toISOString()
            });

            // Create assignment record
            await base44.entities.CallAssignment.create({
                call_id: selectedCall.id,
                unit_id: unit.id,
                role: currentAssignments.length === 0 ? 'primary' : 'backup',
                assigned_at: new Date().toISOString(),
                status: 'pending'
            });

            // Create audit log
            await base44.entities.AuditLog.create({
                entity_type: 'CallAssignment',
                entity_id: selectedCall.id,
                action: 'assign',
                actor_id: currentUser.id,
                actor_name: currentUser.full_name,
                after_value: `Assigned ${unit.unit_number} to call`,
                timestamp: new Date().toISOString()
            });

            toast.success(`${unit.unit_number} assigned to call`);
            onUpdate();
        } catch (error) {
            console.error('Error assigning unit:', error);
            toast.error('Failed to assign unit');
        }
    };

    const unassignUnit = async (unit) => {
        if (!selectedCall) return;

        try {
            const currentAssignments = selectedCall.assigned_units || [];
            const updatedAssignments = currentAssignments.filter(id => id !== unit.id);
            
            await base44.entities.DispatchCall.update(selectedCall.id, {
                assigned_units: updatedAssignments
            });

            // Update assignment record
            const assignments = await base44.entities.CallAssignment.filter({
                call_id: selectedCall.id,
                unit_id: unit.id
            });
            if (assignments && assignments.length > 0) {
                await base44.entities.CallAssignment.update(assignments[0].id, {
                    cleared_at: new Date().toISOString(),
                    status: 'cleared'
                });
            }

            // Create audit log
            await base44.entities.AuditLog.create({
                entity_type: 'CallAssignment',
                entity_id: selectedCall.id,
                action: 'unassign',
                actor_id: currentUser.id,
                actor_name: currentUser.full_name,
                after_value: `Unassigned ${unit.unit_number} from call`,
                timestamp: new Date().toISOString()
            });

            toast.success(`${unit.unit_number} unassigned`);
            onUpdate();
        } catch (error) {
            console.error('Error unassigning unit:', error);
            toast.error('Failed to unassign unit');
        }
    };

    const isAssignedToSelectedCall = (unit) => {
        return selectedCall && selectedCall.assigned_units?.includes(unit.id);
    };

    return (
        <Card className="h-full bg-slate-900/95 border-slate-700 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" />
                    Units ({units.length})
                </h2>

                {/* Search */}
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search units..."
                        className="pl-10 bg-slate-800 border-slate-700 text-white"
                    />
                </div>

                {/* Status Filter */}
                <div className="flex flex-wrap gap-1">
                    {['all', 'Available', 'Assigned', 'Enroute', 'On Scene'].map(status => (
                        <Button
                            key={status}
                            size="sm"
                            variant={statusFilter === status ? 'default' : 'outline'}
                            onClick={() => setStatusFilter(status)}
                            className="text-xs"
                        >
                            {status} ({statusCounts[status] || 0})
                        </Button>
                    ))}
                </div>

                {selectedCall && (
                    <div className="mt-3 p-2 bg-blue-900/30 rounded-lg border border-blue-700">
                        <p className="text-xs text-blue-300">
                            Assigning to: <span className="font-semibold">{selectedCall.incident}</span>
                        </p>
                    </div>
                )}
            </div>

            {/* Units List */}
            <ScrollArea className="flex-1 p-2">
                {filteredUnits.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No units found</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredUnits.map(unit => {
                            const isAssigned = isAssignedToSelectedCall(unit);
                            return (
                                <motion.div
                                    key={unit.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h3 className="font-bold text-white">
                                                {unit.unit_number || 'N/A'}
                                            </h3>
                                            <p className="text-xs text-slate-400">{unit.full_name}</p>
                                        </div>
                                        <Badge className={`${getStatusColor(unit.status)} text-white text-xs`}>
                                            {unit.status || 'Unknown'}
                                        </Badge>
                                    </div>

                                    {unit.current_call_info && (
                                        <div className="mb-2 p-2 bg-slate-900 rounded text-xs">
                                            <p className="text-slate-400">Current Call:</p>
                                            <p className="text-white">{unit.current_call_info}</p>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                        {unit.speed !== undefined && (
                                            <span>{Math.round(unit.speed)} mph</span>
                                        )}
                                        {unit.last_updated && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(unit.last_updated).toLocaleTimeString()}
                                            </span>
                                        )}
                                    </div>

                                    {selectedCall && (
                                        <Button
                                            size="sm"
                                            onClick={() => isAssigned ? unassignUnit(unit) : assignUnit(unit)}
                                            className={`w-full ${
                                                isAssigned 
                                                    ? 'bg-red-600 hover:bg-red-700' 
                                                    : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                        >
                                            {isAssigned ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4 mr-2" />
                                                    Unassign
                                                </>
                                            ) : (
                                                'Assign to Call'
                                            )}
                                        </Button>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </Card>
    );
}