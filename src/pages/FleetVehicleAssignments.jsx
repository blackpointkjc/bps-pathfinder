import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Car, ChevronLeft, ChevronRight, Users, Wrench, CheckCircle2, Pencil, Trash2, X } from 'lucide-react';

const hours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number);
  let a = sh * 60 + sm, b = eh * 60 + em; if (b <= a) b += 1440; return (b-a)/60;
};

export default function FleetVehicleAssignments() {
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [editingAssignmentId, setEditingAssignmentId] = useState('');
  const { data: user } = useQuery({ queryKey:['currentUser'], queryFn:()=>base44.auth.me() });
  const isAdmin = user?.role === 'admin' || (user?.additional_roles || []).includes('full_access');
  const { data: users=[] } = useQuery({ queryKey:['fleetUsers'], queryFn:()=>base44.entities.User.list() });
  const { data: vehicles=[] } = useQuery({ queryKey:['fleetVehicles'], queryFn:()=>base44.entities.Vehicle.list('vehicle_id') });
  const { data: schedules=[] } = useQuery({ queryKey:['fleetSchedules'], queryFn:()=>base44.entities.Schedule.list('-shift_date') });
  const { data: assignments=[] } = useQuery({ queryKey:['fleetAssignments'], queryFn:()=>base44.entities.VehicleAssignment.list('-assignment_date') });

  const weekStart = addDays(startOfWeek(new Date(), {weekStartsOn:0}), weekOffset*7);
  const dates = Array.from({length:7},(_,i)=>format(addDays(weekStart,i),'yyyy-MM-dd'));
  const eligibleUsers = users.filter(u => !u.termination_date && (u.additional_roles || []).includes('cad_access') && (u.additional_roles || []).includes('officer'));
  const weekShifts = schedules.filter(s => dates.includes(s.shift_date) && s.officer_email && s.officer_email !== 'OPEN' && !s.is_open);
  const myShifts = isAdmin ? weekShifts : weekShifts.filter(s=>s.officer_email===user?.email);
  const availableVehicles = vehicles.filter(v => v.status === 'Active');
  const maintenanceVehicles = vehicles.filter(v => v.status === 'Maintenance' || v.status === 'Out of Service');
  const selectedShift = schedules.find(s=>s.id===selectedShiftId);

  const getName = email => { const u=users.find(x=>x.email===email); return u ? `${u.rank || 'Officer'} ${u.last_name || u.first_name}` : email; };
  const partnerForShift = shift => {
    if (!shift) return null;
    if (shift.partner_officer_email) return weekShifts.find(s => s.officer_email === shift.partner_officer_email) || users.find(u => u.email === shift.partner_officer_email);
    return weekShifts.find(s => s.id !== shift.id && s.shift_date === shift.shift_date && s.location === shift.location && s.start_time === shift.start_time && s.end_time === shift.end_time);
  };

  const editAssignment = (assignment) => {
    const matchingShift = schedules.find(s => s.shift_date === assignment.assignment_date && s.officer_email === assignment.primary_officer_email && s.start_time === assignment.start_time && s.end_time === assignment.end_time);
    setEditingAssignmentId(assignment.id);
    setSelectedShiftId(matchingShift?.id || '');
    setVehicleId(assignment.vehicle_id || '');
    setNotes(assignment.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditingAssignmentId(''); setSelectedShiftId(''); setVehicleId(''); setNotes(''); };

  const removeAssignment = async (assignment) => {
    if (!isAdmin || !confirm(`Remove ${assignment.vehicle_label} from ${assignment.primary_officer_name}'s ${assignment.assignment_date} assignment?`)) return;
    await base44.entities.VehicleAssignment.delete(assignment.id);
    qc.invalidateQueries({queryKey:['fleetAssignments']});
    qc.invalidateQueries({queryKey:['myVehicleAssignments']});
    if (editingAssignmentId === assignment.id) cancelEdit();
  };

  const assignVehicle = async () => {
    if (!selectedShift || !vehicleId) return;
    const vehicle = vehicles.find(v=>v.id===vehicleId); if (!vehicle) return;
    const partner = partnerForShift(selectedShift);
    const resolvedPartnerEmail = selectedShift.partner_officer_email || partner?.officer_email || partner?.email || '';
    const existing = editingAssignmentId ? assignments.find(a => a.id === editingAssignmentId) : assignments.find(a => a.assignment_date===selectedShift.shift_date && a.primary_officer_email===selectedShift.officer_email && a.start_time===selectedShift.start_time);
    const payload = {
      assignment_date:selectedShift.shift_date, start_time:selectedShift.start_time, end_time:selectedShift.end_time,
      vehicle_id:vehicle.id, vehicle_label:vehicle.vehicle_id,
      primary_officer_email:selectedShift.officer_email, primary_officer_name:getName(selectedShift.officer_email),
      partner_officer_email:resolvedPartnerEmail, partner_officer_name:resolvedPartnerEmail ? getName(resolvedPartnerEmail) : '',
      location:selectedShift.location || '', status:'scheduled', notes, created_by_email:user.email
    };
    if (existing) await base44.entities.VehicleAssignment.update(existing.id,payload); else await base44.entities.VehicleAssignment.create(payload);
    qc.invalidateQueries({queryKey:['fleetAssignments']}); qc.invalidateQueries({queryKey:['myVehicleAssignments']}); cancelEdit();
  };

  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-3">
        <Car className="h-7 w-7 text-amber-400"/><div><h1 className="text-xl font-black tracking-wide">FLEET VEHICLE ASSIGNMENT</h1><p className="text-xs text-slate-500">Vehicle assignments are separate from officer unit numbers.</p></div>
        <div className="ml-auto flex items-center gap-2"><Button variant="outline" size="sm" onClick={()=>setWeekOffset(v=>v-1)}><ChevronLeft className="h-4 w-4"/></Button><Badge variant="outline">{format(weekStart,'MMM d')} - {format(addDays(weekStart,6),'MMM d, yyyy')}</Badge><Button variant="outline" size="sm" onClick={()=>setWeekOffset(v=>v+1)}><ChevronRight className="h-4 w-4"/></Button></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="border-slate-800 bg-slate-900 text-white"><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span>{editingAssignmentId ? 'EDIT VEHICLE ASSIGNMENT' : 'ASSIGN A VEHICLE'}</span>{editingAssignmentId && <button onClick={cancelEdit} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4"/></button>}</CardTitle></CardHeader><CardContent className="space-y-3">
          <div><label className="text-[10px] text-slate-400">SCHEDULED SHIFT</label><Select value={selectedShiftId} onValueChange={setSelectedShiftId}><SelectTrigger className="border-slate-700 bg-slate-950"><SelectValue placeholder="Choose shift"/></SelectTrigger><SelectContent>{myShifts.map(s=><SelectItem key={s.id} value={s.id}>{s.shift_date} · {s.start_time}-{s.end_time} · {getName(s.officer_email)} · {s.location}</SelectItem>)}</SelectContent></Select></div>
          {selectedShift && <div className="rounded border border-blue-900 bg-blue-950/30 p-2 text-xs"><div><strong>Primary Officer:</strong> {getName(selectedShift.officer_email)}</div><div><strong>Scheduled Partner:</strong> {selectedShift.partner_officer_email ? getName(selectedShift.partner_officer_email) : 'None selected'}</div><div><strong>Hours:</strong> {hours(selectedShift.start_time,selectedShift.end_time).toFixed(2)}</div></div>}
          {selectedShift && <div className="rounded border border-slate-800 bg-slate-950/70 p-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Partner From Scheduling</div><div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white"><Users className="h-4 w-4 text-blue-400"/>{selectedShift.partner_officer_email ? getName(selectedShift.partner_officer_email) : 'No partner assigned in Scheduling'}</div><p className="mt-1 text-[10px] text-slate-500">Fleet automatically uses the partner assigned to this shift. Change the partner in Scheduling, not here.</p></div>}
          <div><label className="text-[10px] text-slate-400">ACTIVE / IN-SERVICE FLEET VEHICLE</label><Select value={vehicleId} onValueChange={setVehicleId}><SelectTrigger className="border-slate-700 bg-slate-950"><SelectValue placeholder="Choose vehicle"/></SelectTrigger><SelectContent>{availableVehicles.map(v=><SelectItem key={v.id} value={v.id}>{v.vehicle_id} · {v.year} {v.make} {v.model} · {v.license_plate || 'No plate'}</SelectItem>)}</SelectContent></Select></div>
          <Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Assignment notes" className="border-slate-700 bg-slate-950"/>
          <Button onClick={assignVehicle} disabled={!selectedShiftId || !vehicleId} className="w-full bg-amber-600 hover:bg-amber-500"><CheckCircle2 className="mr-2 h-4 w-4"/>{editingAssignmentId ? 'UPDATE VEHICLE ASSIGNMENT' : 'SAVE VEHICLE ASSIGNMENT'}</Button>
          {maintenanceVehicles.length>0 && <div className="rounded border border-red-900 bg-red-950/20 p-2"><div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-red-300"><Wrench className="h-3 w-3"/>UNAVAILABLE - MAINTENANCE / OOS</div>{maintenanceVehicles.map(v=><div key={v.id} className="text-[10px] text-slate-400">{v.vehicle_id} · {v.status}</div>)}</div>}
        </CardContent></Card>

        <div className="overflow-x-auto rounded border border-slate-800 bg-slate-900">
          <div className="grid min-w-[980px] grid-cols-7 border-b border-slate-800">{dates.map(d=><div key={d} className="border-r border-slate-800 p-2 text-center last:border-r-0"><div className="text-xs font-black">{format(new Date(d+'T12:00:00'),'EEE')}</div><div className="text-[10px] text-slate-500">{format(new Date(d+'T12:00:00'),'MMM d')}</div></div>)}</div>
          <div className="grid min-w-[980px] grid-cols-7 min-h-[520px]">{dates.map(d=><div key={d} className="space-y-2 border-r border-slate-800 p-2 last:border-r-0">{assignments.filter(a=>a.assignment_date===d && (isAdmin || a.primary_officer_email===user?.email || a.partner_officer_email===user?.email)).map(a=><div key={a.id} onClick={()=>isAdmin&&editAssignment(a)} className={`rounded border border-amber-700/50 bg-amber-950/20 p-2 text-[10px] ${isAdmin?'cursor-pointer hover:border-amber-400 hover:bg-amber-950/40':''}`}><div className="flex items-start gap-1"><div className="min-w-0 flex-1"><div className="font-black text-amber-300">{a.vehicle_label}</div><div>{a.start_time}-{a.end_time}</div><div>{a.primary_officer_name}</div>{a.partner_officer_name && <div className="flex items-center gap-1 text-blue-300"><Users className="h-3 w-3"/>{a.partner_officer_name}</div>}<div className="truncate text-slate-500">{a.location}</div></div>{isAdmin&&<div className="flex gap-1"><button title="Edit assignment" onClick={e=>{e.stopPropagation();editAssignment(a)}} className="rounded p-1 text-blue-300 hover:bg-blue-900/40"><Pencil className="h-3 w-3"/></button><button title="Remove vehicle assignment" onClick={e=>{e.stopPropagation();removeAssignment(a)}} className="rounded p-1 text-red-300 hover:bg-red-900/40"><Trash2 className="h-3 w-3"/></button></div>}</div></div>)}</div>)}</div>
        </div>
      </div>
    </div>
  </div>;
}
