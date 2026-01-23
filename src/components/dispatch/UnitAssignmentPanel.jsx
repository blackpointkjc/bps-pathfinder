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
            <div className="text-xs text-slate-500 text-center p-2">Select a call to assign units</div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Assigned Units */}
            <div>
                <p className="text-xs text-slate-400 mb-1">Assigned ({assignedUnits.length})</p>
                {assignedUnits.length > 0 ? (
                    <div className="space-y-1">
                        {assignedUnits.map(unit => {
                            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
                            return (
                                <div key={unit.id} className="bg-slate-800 p-2 rounded flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-semibold truncate">{unitName}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleUnassignUnit(unit)}
                                        className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                                    >
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 text-center p-2">No units assigned</div>
                )}
            </div>

            {/* Available Units */}
            <div>
                <p className="text-xs text-slate-400 mb-1">Available ({availableUnits.length})</p>
                <div className="relative mb-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search..."
                        className="pl-7 h-7 bg-slate-800 border-slate-700 text-white text-xs"
                    />
                </div>
                
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    {units.length === 0 ? (
                        <div className="text-xs text-amber-500 text-center p-2">⚠️ Loading units...</div>
                    ) : availableUnits.length === 0 ? (
                        <div className="text-xs text-slate-500 text-center p-2">
                            {searchTerm ? 'No units found' : 'No available units'}
                        </div>
                    ) : (
                        availableUnits.map(unit => {
                            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
                            const distance = call.latitude && call.longitude && unit.latitude && unit.longitude
                                ? calculateDistance(call.latitude, call.longitude, unit.latitude, unit.longitude)
                                : null;
                            
                            return (
                                <div key={unit.id} className="bg-slate-800 p-2 rounded flex items-center justify-between hover:bg-slate-700">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-semibold truncate">{unitName}</p>
                                        {distance && (
                                            <p className="text-[10px] text-slate-400">{(distance * 0.621371).toFixed(1)} mi</p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleAssignUnit(unit)}
                                        className="bg-blue-600 hover:bg-blue-700 h-6 px-2"
                                    >
                                        <Plus className="w-3 h-3" />
                                    </Button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
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