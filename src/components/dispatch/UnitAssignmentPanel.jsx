import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { Plus, X, Search } from 'lucide-react';
import { announceVoice } from '@/utils/voiceAnnouncer';

const isOperationalUnit = isOperationalOfficer;

export default function UnitAssignmentPanel({ call, units, onUpdate }) {
    const [searchTerm, setSearchTerm] = useState('');
    
    const assignedUnitIds = call?.assigned_units || [];
    const assignedUnits = units.filter(u => assignedUnitIds.includes(u.id) && isOperationalUnit(u));
    
    const availableUnits = units.filter(u => 
        isOperationalUnit(u) &&
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
            const result = await base44.functions.invoke('manageCadUnitAssignment', {
                action: 'assign',
                call_id: call.id,
                unit_id: unit.id,
            });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);

            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
            const callNumber = call.agency_cad_number || call.bps_reference || call.call_id || 'reference pending';
            const incident = call.incident || 'call for service';
            const location = call.location || 'address unavailable';
            toast.success(`${unitName} assigned to call`);
            announceVoice(`Dispatch assignment. Unit ${unit.unit_number || unitName}. ${callNumber}. ${incident}. ${location}.`, { force: true, dedupeMs: 2500, rate: 0.82, pitch: 0.68 });
            onUpdate();
        } catch (error) {
            console.error('Error assigning unit:', error);
            toast.error('Failed to assign unit');
        }
    };

    const handleUnassignUnit = async (unit) => {
        if (!call) return;
        
        try {
            const result = await base44.functions.invoke('manageCadUnitAssignment', {
                action: 'unassign',
                call_id: call.id,
                unit_id: unit.id,
            });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);

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
            <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#09121e] p-5 text-center">
                <div className="text-[10px] font-black tracking-[.16em] text-slate-500">UNIT ASSIGNMENT</div>
                <div className="mt-2 text-xs text-slate-400">Select an active call to view assigned and available field units.</div>
            </div>
        );
    }

    const callNumber = call.agency_cad_number || call.bps_reference || call.call_id || 'REFERENCE PENDING';

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="rounded-xl border border-blue-800/50 bg-gradient-to-br from-blue-950/35 to-[#0b1522] p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black tracking-[.14em] text-blue-300">ASSIGNING CALL</span><span className="rounded-md bg-blue-500/15 px-2 py-1 text-[9px] font-black text-blue-200">{callNumber}</span></div>
                <div className="mt-2 text-sm font-black text-white">{call.incident || 'Call for Service'}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-slate-400">{call.location || 'Location unavailable'}</div>
            </div>
            {/* Assigned Units */}
            <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned Units ({assignedUnits.length})</p>
                {assignedUnits.length > 0 ? (
                    <div className="space-y-1">
                        {assignedUnits.map(unit => {
                            const unitName = unit.unit_number || (unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name);
                            return (
                                <div key={unit.id} className="flex items-center justify-between rounded-xl border border-emerald-800/40 bg-emerald-950/15 p-2.5">
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
            <div className="flex min-h-0 flex-1 flex-col">
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Available for Dispatch ({availableUnits.length})</p>
                <div className="relative mb-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search..."
                        className="h-9 rounded-lg border-slate-700 bg-[#0b1522] pl-8 text-sm text-white"
                    />
                </div>
                
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
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
                                <div key={unit.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-[#101b29] p-2.5 transition-colors hover:border-blue-700/60 hover:bg-[#142236]">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-semibold truncate">{unitName}</p>
                                        {distance && (
                                            <p className="text-[10px] text-slate-400">{(distance * 0.621371).toFixed(1)} mi</p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleAssignUnit(unit)}
                                        className="h-9 w-9 rounded-lg bg-blue-600 p-0 hover:bg-blue-500"
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