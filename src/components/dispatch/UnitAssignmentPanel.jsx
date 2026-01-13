import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Users, Plus, X, Search, MapPin } from 'lucide-react';

export default function UnitAssignmentPanel({ call, units, onUpdate }) {
    const [searchTerm, setSearchTerm] = useState('');
    
    const assignedUnitIds = call?.assigned_units || [];
    const assignedUnits = units.filter(u => assignedUnitIds.includes(u.id));
    
    const availableUnits = units.filter(u => 
        !assignedUnitIds.includes(u.id) &&
        (u.status === 'Available' || u.status === 'On Patrol') &&
        u.show_on_map !== false &&
        (searchTerm === '' || 
            u.unit_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.rank?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleAssignUnit = async (unit) => {
        if (!call) return;
        
        try {
            const updatedUnits = [...assignedUnitIds, unit.id];
            await base44.entities.DispatchCall.update(call.id, {
                assigned_units: updatedUnits,
                status: 'Dispatched',
                time_dispatched: new Date().toISOString()
            });

            // Create assignment record
            await base44.entities.CallAssignment.create({
                call_id: call.id,
                unit_id: unit.id,
                role: assignedUnitIds.length === 0 ? 'primary' : 'backup',
                assigned_at: new Date().toISOString(),
                status: 'pending'
            });

            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
            toast.success(`${unitName} assigned to call`);
            onUpdate();
        } catch (error) {
            console.error('Error assigning unit:', error);
            toast.error('Failed to assign unit');
        }
    };

    const handleUnassignUnit = async (unit) => {
        if (!call) return;
        
        try {
            const updatedUnits = assignedUnitIds.filter(id => id !== unit.id);
            await base44.entities.DispatchCall.update(call.id, {
                assigned_units: updatedUnits
            });

            // Update assignment record
            const assignments = await base44.entities.CallAssignment.filter({
                call_id: call.id,
                unit_id: unit.id
            });
            
            if (assignments && assignments.length > 0) {
                await base44.entities.CallAssignment.update(assignments[0].id, {
                    status: 'cleared',
                    cleared_at: new Date().toISOString()
                });
            }

            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
            toast.success(`${unitName} unassigned from call`);
            onUpdate();
        } catch (error) {
            console.error('Error unassigning unit:', error);
            toast.error('Failed to unassign unit');
        }
    };

    if (!call) {
        return (
            <Card className="bg-slate-900/95 border-slate-700 p-4">
                <p className="text-slate-500 text-sm">Select a call to assign units</p>
            </Card>
        );
    }

    return (
        <Card className="bg-slate-900/95 border-slate-700 p-4">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                Unit Assignment
            </h3>

            {/* Assigned Units */}
            <div className="mb-4">
                <p className="text-sm text-slate-400 mb-2">Assigned Units ({assignedUnits.length})</p>
                {assignedUnits.length > 0 ? (
                    <div className="space-y-2">
                        {assignedUnits.map(unit => {
                            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
                            return (
                                <div key={unit.id} className="bg-slate-800 p-3 rounded-lg flex items-center justify-between">
                                    <div>
                                        <p className="text-white font-semibold">{unitName}</p>
                                        <p className="text-xs text-slate-400">{unit.status}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleUnassignUnit(unit)}
                                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Badge variant="outline" className="border-red-500 text-red-400">
                        No units assigned
                    </Badge>
                )}
            </div>

            {/* Available Units */}
            <div>
                <p className="text-sm text-slate-400 mb-2">Available Units</p>
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search units..."
                        className="pl-10 bg-slate-800 border-slate-700 text-white"
                    />
                </div>
                
                <ScrollArea className="h-48">
                    <div className="space-y-2">
                        {availableUnits.map(unit => {
                            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
                            const distance = call.latitude && call.longitude && unit.latitude && unit.longitude
                                ? calculateDistance(call.latitude, call.longitude, unit.latitude, unit.longitude)
                                : null;
                            
                            return (
                                <div key={unit.id} className="bg-slate-800 p-3 rounded-lg flex items-center justify-between hover:bg-slate-700 transition-colors">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-white font-semibold">{unitName}</p>
                                            <Badge className="bg-green-600 text-white text-xs">
                                                {unit.status}
                                            </Badge>
                                        </div>
                                        {distance && (
                                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                {(distance * 0.621371).toFixed(1)} mi away
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleAssignUnit(unit)}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            );
                        })}
                        {availableUnits.length === 0 && (
                            <p className="text-slate-500 text-sm text-center py-4">
                                {searchTerm ? 'No units found' : 'No available units'}
                            </p>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </Card>
    );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}