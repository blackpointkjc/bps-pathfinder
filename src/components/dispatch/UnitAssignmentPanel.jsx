import { useState } from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { Plus, X, Search } from 'lucide-react';

const isOperationalUnit = isOperationalOfficer;
const displayUnitName = (unit) => {
    const rank = String(unit?.rank || '').trim();
    const last = String(unit?.last_name || '').trim();
    if (rank && last) return `${rank} ${last}`;
    const fallback=String(unit?.full_name||unit?.officer_name||'').trim().split(/\s+/).pop();
    return fallback ? `${rank||'Officer'} ${fallback}` : (unit?.unit_number ? `Unit ${unit.unit_number}` : 'Field Unit');
};
const displayProperty = (unit) => String(unit?.current_location || unit?.assigned_location || unit?.location || 'No current property').split(':')[0].trim();

export default function UnitAssignmentPanel({ call, calls = [], units = [], allAssignments=[], unitLoadStatus = 'ready', onRetryUnits, onUpdate }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [destinationByOfficer,setDestinationByOfficer]=useState({});
    const [reassigning,setReassigning]=useState('');
    const [holding,setHolding]=useState('');
    const [localHold,setLocalHold]=useState({});
    const queryClient=useQueryClient();
    const {data:heldRoster=[],refetch:refetchHeldRoster}=useQuery({queryKey:['dispatchHeldOfficerRoster'],queryFn:async()=>{const response=await base44.functions.invoke('getHeldDispatchOfficers',{});return response?.data?.officers||[];},staleTime:30000,refetchInterval:60000,refetchIntervalInBackground:false});
    const {data:assignments=[]}=useQuery({
        queryKey:['cadUnitRoles',call?.id],enabled:!!call?.id,
        queryFn:()=>base44.entities.CallAssignment.filter({call_id:call.id},'-assigned_at',90),
        staleTime:15000,refetchInterval:30000,refetchIntervalInBackground:false,
    });
    const activeRoles=(assignments||[]).filter(row=>!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
    const roleOf=(unit)=>activeRoles.find(row=>String(row.unit_id)===String(unit.id))?.role||'unverified';
    
    const assignedUnitIds = (call?.assigned_units || []).map(String);
    const isAssigned = unit => assignedUnitIds.includes(String(unit.id)) || Boolean(unit.active_officer_id && assignedUnitIds.includes(String(unit.active_officer_id)));
    const assignedUnits = units.filter(u => isAssigned(u) && isOperationalUnit(u));
    
    const holdOf=unit=>localHold[unit.id]??unit.dispatch_hold_new_calls===true;
    const isOperationalStatus=status=>!['out of service','distress','offline'].includes(String(status||'').toLowerCase());
    const availableUnits=units.filter(u=>isOperationalUnit(u)&&!isAssigned(u)&&isOperationalStatus(u.status)&&u.session_active!==false&&!holdOf(u)
      &&(!searchTerm||[u.unit_number,u.last_name,u.rank].some(v=>String(v||'').toLowerCase().includes(searchTerm.toLowerCase()))));
    const heldUnits=[...units.filter(u=>isOperationalUnit(u)&&holdOf(u))];
    for(const held of heldRoster){if(!heldUnits.some(u=>String(u.user_id||u.id)===String(held.id)||String(u.email||u.officer_email||'').toLowerCase()===String(held.email||'').toLowerCase()))heldUnits.push(held);} 
    const otherActiveUnits=units.filter(u=>isOperationalUnit(u)&&!isAssigned(u)&&!availableUnits.includes(u)&&!heldUnits.includes(u));
    const currentCallCount=unit=>(allAssignments||[]).filter(row=>String(row.unit_id)===String(unit.id)&&!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase())).length;
    const changeHold=async(unit,hold)=>{
      setHolding(unit.id);
      try{
        const response=await base44.functions.invoke('setOfficerDispatchHold',{officer_id:unit.id,hold,reason:hold?'Temporarily unavailable for new assignments by dispatch':''});
        const data=response?.data||response||{};
        if(!data.success)throw new Error(data.error||'Hold not saved');
        setLocalHold(prev=>({...prev,[unit.id]:hold}));
        toast.success(data.message);
        await Promise.allSettled([onUpdate?.(),refetchHeldRoster()]);
      }catch(error){toast.error(error?.response?.data?.error||error?.message||'Dispatch hold failed');}
      finally{setHolding('');}
    };

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

            const unitName = displayUnitName(unit);
            toast.success(`${unitName} assigned to call`);
            // manageCadUnitAssignment creates the single durable CallStatusLog
            // announcement event. Do not speak from this rendering component.
            await queryClient.invalidateQueries({queryKey:['cadUnitRoles',call.id]});
            onUpdate();
        } catch (error) {
            console.error('Error assigning unit:', error);
            toast.error(error?.response?.data?.error||error?.message||'Failed to assign unit');
        }
    };

    const handleAddAnotherCall=async unit=>{
        const targetId=destinationByOfficer[unit.id];
        if(!targetId||String(targetId)===String(call?.id))return toast.error('Choose another active CAD call.');
        setReassigning(unit.id);
        try {
            const response=await base44.functions.invoke('manageCadUnitAssignment',{action:'assign',call_id:targetId,unit_id:unit.id});
            const result=response?.data||response||{};
            if(result.error)throw new Error(result.error);
            toast.success('Additional call assigned to '+displayUnitName(unit)+' without removing existing calls.');
            setDestinationByOfficer(old=>({...old,[unit.id]:''}));
            await queryClient.invalidateQueries({queryKey:['cadUnitRoles',targetId]});
            await onUpdate?.();
        }catch(error){toast.error(error?.response?.data?.error||error?.message||'Could not add another call');}
        finally{setReassigning('');}
    };
    const handleReassignUnit=async unit=>{
        const targetId=destinationByOfficer[unit.id];
        if(!targetId||targetId===call?.id)return toast.error('Choose a different active CAD call.');
        setReassigning(unit.id);
        try{
            const response=await base44.functions.invoke('reassignCadOfficer',{source_call_id:call.id,destination_call_id:targetId,officer_id:unit.id});
            const result=response?.data||response||{};
            if(!result.success)throw new Error(result.error||'CAD did not confirm the reassignment');
            toast.success(`${displayUnitName(unit)} reassigned to CAD ${result.to}. Officer-specific instructions sent.`);
            setDestinationByOfficer(old=>({...old,[unit.id]:''}));
            await queryClient.invalidateQueries({queryKey:['cadUnitRoles',call.id]});
            await onUpdate?.();
        }catch(error){toast.error(error?.response?.data?.error||error?.message||'Reassignment failed');}
        finally{setReassigning('');}
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

            const unitName = displayUnitName(unit);
            toast.success(`${unitName} unassigned from call`);
            await queryClient.invalidateQueries({queryKey:['cadUnitRoles',call.id]});
            onUpdate();
        } catch (error) {
            console.error('Error unassigning unit:', error);
            toast.error('Failed to unassign unit');
        }
    };

    if (!call) {
        return <div className="space-y-3 rounded-xl border border-slate-700 bg-[#09121e] p-3">
          <div className="text-xs font-black text-white">Dispatch · New-Call Availability</div>
          <p className="text-xs text-slate-400">Dispatch can place or remove a Hold on any signed-in officer. Holds block only NEW calls, not assignments already in progress. Select a CAD call to assign units.</p>
          {units.filter(isOperationalUnit).map(unit=><div key={unit.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs"><div className="min-w-0"><p className="font-black text-slate-100">{displayUnitName(unit)}</p><p className="text-slate-400">Unit {unit.unit_number||'—'} · {unit.status||'Status pending'}</p><p className={holdOf(unit)?'text-amber-300':'text-emerald-300'}>{holdOf(unit)?'HOLD: No new calls':'New calls permitted'}</p></div><Button size="sm" variant="outline" disabled={!!holding} onClick={()=>changeHold(unit,!holdOf(unit))} className={holdOf(unit)?'border-emerald-600 text-emerald-300':'border-amber-700 text-amber-300'}>{holding===unit.id?'Saving…':holdOf(unit)?'Remove Hold':'Hold New Calls'}</Button></div>)}
          {!units.length&&<p className="text-xs text-amber-300">Awaiting the on-duty officer roster.</p>}
        </div>;
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
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned Units ({assignedUnitIds.length})</p>
                {assignedUnits.length > 0 ? (
                    <div className="space-y-1">
                        {assignedUnits.map(unit => {
                            const unitName = displayUnitName(unit);
                            return (
                                <div key={unit.id} className="flex items-center justify-between rounded-xl border border-emerald-800/40 bg-emerald-950/15 p-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-black text-white">{unitName}</p>
                                        <span className={roleOf(unit)==='primary'?'text-emerald-300':'text-blue-300'}>{roleOf(unit)==='primary'?'PRIMARY UNIT':roleOf(unit)==='backup'?'ADDITIONAL UNIT':'ROLE NOT YET VERIFIED'}</span>
                                        <p className="mt-0.5 truncate text-[10px] text-slate-400">{displayProperty(unit)} · {unit.status||'Duty active'}</p>
                                        <p className="text-[10px] text-emerald-300">{currentCallCount(unit)} active call(s)</p>
                                        {unit.unit_number && <p className="mt-0.5 text-[9px] font-bold text-blue-300">UNIT {unit.unit_number}</p>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                        <Button size="sm" variant="outline" disabled={!!holding} onClick={()=>changeHold(unit,!holdOf(unit))} className={`h-8 ${holdOf(unit)?'border-emerald-700 text-emerald-300':'border-amber-700 text-amber-300'}`}>{holding===unit.id?'Saving…':holdOf(unit)?'Remove Hold':'Hold New Calls'}</Button>
                                        <select aria-label={`Reassign ${unitName} to a different call`} value={destinationByOfficer[unit.id]||''} onChange={e=>setDestinationByOfficer(prev=>({...prev,[unit.id]:e.target.value}))} className="max-w-[160px] rounded border border-cyan-900 bg-slate-950 px-1 py-2 text-[10px] text-cyan-100">
                                            <option value="">Select another CAD call…</option>
                                            {calls.filter(c=>String(c.id)!==String(call.id)&&!['cleared','cancelled','closed','resolved','completed'].includes(String(c.status||'').toLowerCase())&&c.manual_dismissed!==true).map(c=><option key={c.id} value={c.id}>{c.agency_cad_number||c.bps_reference||c.call_id||c.id} · {String(c.incident||'').slice(0,34)}</option>)}
                                        </select>
                                        <Button size="sm" variant="outline" disabled={!destinationByOfficer[unit.id]||!!reassigning} onClick={()=>handleAddAnotherCall(unit)} className="h-8 border-emerald-700 text-emerald-300">{reassigning===unit.id?'Adding…':'ADD CALL'}</Button><Button size="sm" variant="outline" disabled={!destinationByOfficer[unit.id]||!!reassigning} onClick={()=>handleReassignUnit(unit)} className="h-8 border-cyan-700 text-cyan-300">{reassigning===unit.id?'Moving…':'REASSIGN'}</Button>
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
                ) : assignedUnitIds.length > 0 ? (
                    <div className="text-xs text-amber-300 text-center p-2">{assignedUnitIds.length} unit(s) assigned in CAD. Waiting for live roster details.</div>
                ) : (
                    <div className="text-xs text-slate-500 text-center p-2">No units assigned</div>
                )}
            </div>

            {/* Available Units */}
            <div className="flex min-h-0 flex-1 flex-col">
                <p className="mb-1 text-[10px] font-black tracking-wider text-slate-300">Eligible for New Calls ({availableUnits.length}) · Available, En Route, On Scene & Busy</p>
                <p className="mb-2 text-[10px] text-cyan-300">Officers can have several assigned calls. Only Dispatch Hold prevents new assignments.</p>
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
                    {units.length === 0 && unitLoadStatus === 'loading' ? (
                        <div role="status" className="text-xs text-amber-400 text-center p-2">Loading on-duty units…</div>
                    ) : units.length === 0 && unitLoadStatus === 'error' ? (
                        <div role="alert" className="rounded-lg border border-red-800/60 bg-red-950/20 p-3 text-center">
                            <p className="text-xs text-red-300">Unable to load the live unit roster. This is a connection error, not proof there are no units.</p>
                            <Button size="sm" variant="outline" className="mt-2" onClick={onRetryUnits}>Retry unit roster</Button>
                        </div>
                    ) : availableUnits.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center p-2">
                            {searchTerm ? 'No matching available units' : units.length === 0 ? 'No signed-in units are currently reported.' : 'No officers currently qualify for new calls. Check Out of Service status and Dispatch Holds below.'}
                        </div>
                    ) : (
                        availableUnits.map(unit => {
                            const unitName = displayUnitName(unit);
                            const distance = call.latitude && call.longitude && unit.latitude && unit.longitude
                                ? calculateDistance(call.latitude, call.longitude, unit.latitude, unit.longitude)
                                : null;
                            
                            return (
                                <div key={unit.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-[#101b29] p-2.5 transition-colors hover:border-blue-700/60 hover:bg-[#142236]">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-black text-white">{unitName}</p>
                                        <p className="mt-0.5 truncate text-[10px] text-slate-400">{displayProperty(unit)} · {unit.status||'Duty active'}</p>
                                        <p className="text-[10px] text-emerald-300">{currentCallCount(unit)} active call(s)</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] font-bold text-blue-300">
                                            {unit.unit_number && <span>UNIT {unit.unit_number}</span>}
                                            {distance && <span className="text-slate-500">{(distance * 0.621371).toFixed(1)} mi</span>}
                                        </div>
                                    </div>
                                    <Button size="sm" variant="outline" disabled={!!holding} onClick={()=>changeHold(unit,true)} className="mr-1 h-9 border-amber-700 text-amber-300">Hold</Button>
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
                {!!heldUnits.length&&<div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/15 p-2"><p className="mb-2 text-[10px] font-black text-amber-300">DISPATCH HOLD · NEW CALLS BLOCKED ({heldUnits.length})</p>{heldUnits.map(unit=><div key={unit.id} className="flex items-center justify-between gap-2 border-t border-slate-800 py-1.5 text-xs"><span>{displayUnitName(unit)} · {currentCallCount(unit)} active call(s)</span><Button size="sm" variant="outline" disabled={!!holding} onClick={()=>changeHold(unit,false)} className="h-8 border-emerald-700 text-emerald-300">Resume Calls</Button></div>)}</div>}
                {otherActiveUnits.length > 0 && !searchTerm && (
                    <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-2">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">On duty but unavailable ({otherActiveUnits.length})</p>
                        {otherActiveUnits.map(unit => (
                            <div key={unit.id} className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-300">
                                <span className="truncate">{unit.unit_number ? 'Unit ' + unit.unit_number + ' · ' : ''}{displayUnitName(unit)}</span>
                                <span className="shrink-0 text-amber-400">{unit.status || 'Busy'}</span>
                            </div>
                        ))}
                    </div>
                )}
                {unitLoadStatus === 'error' && units.length > 0 && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={onRetryUnits}>Roster may be outdated · Retry</Button>
                )}
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