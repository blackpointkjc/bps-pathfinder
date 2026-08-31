import { confirmInApp } from '@/lib/inAppDialog';
import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, ChevronLeft, ChevronRight, Users, Wrench, CheckCircle2, Trash2 } from 'lucide-react';
import { listDirectoryUsers } from '@/lib/appDirectory';

const minutes = value => {
  const [h = 0, m = 0] = String(value || '00:00').split(':').map(Number);
  return (h * 60) + m;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  const normalize = (start, end) => {
    const s = minutes(start);
    let e = minutes(end);
    if (e <= s) e += 1440;
    return [s, e];
  };
  const [as, ae] = normalize(aStart, aEnd);
  const [bs, be] = normalize(bStart, bEnd);
  return as < be && bs < ae;
};

export default function FleetVehicleAssignments() {
  const qc = useQueryClient();
  const [dayOffset, setDayOffset] = useState(0);
  const [vehicleChoice, setVehicleChoice] = useState({});
  const [savingShiftId, setSavingShiftId] = useState('');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const normalizedRoles = (user?.additional_roles || []).map(role => String(role).toLowerCase());
  const isAdmin = user?.role === 'admin' || normalizedRoles.includes('full_access') || normalizedRoles.includes('fleet_manager');
  const { data: users = [] } = useQuery({ queryKey: ['fleetUsers'], queryFn: () => listDirectoryUsers() });
  const { data: vehicles = [], error: vehicleError } = useQuery({ queryKey: ['fleetVehicles'], queryFn: () => base44.entities.Vehicle.list('vehicle_id', 500), refetchInterval: 30000 });
  const { data: schedules = [], error: scheduleError } = useQuery({ queryKey: ['fleetSchedules'], queryFn: () => base44.entities.Schedule.list('-shift_date', 5000), refetchInterval: 30000 });
  const { data: assignments = [], error: assignmentError } = useQuery({ queryKey: ['fleetAssignments'], queryFn: () => base44.entities.VehicleAssignment.list('-assignment_date', 5000), refetchInterval: 30000 });

  const windowStart = addDays(startOfDay(new Date()), dayOffset);
  const dates = Array.from({ length: 3 }, (_, i) => format(addDays(windowStart, i), 'yyyy-MM-dd'));
  const availableVehicles = vehicles.filter(v => String(v.status || 'Active').toLowerCase() === 'active');
  const maintenanceVehicles = vehicles.filter(v => ['maintenance', 'out of service'].includes(String(v.status || '').toLowerCase()));

  const getName = email => {
    const person = users.find(item => item.email === email);
    return person ? `${person.rank || 'Officer'} ${person.last_name || person.first_name}` : email;
  };

  const visibleShifts = useMemo(() => {
    const rows = schedules.filter(shift =>
      shift?.archived !== true &&
      dates.includes(String(shift.shift_date || '').slice(0, 10)) &&
      shift.officer_email &&
      shift.officer_email !== 'OPEN' &&
      shift.is_open !== true &&
      (isAdmin || shift.officer_email === user?.email || shift.partner_officer_email === user?.email)
    );

    // Partnered shifts should show as one team card instead of duplicate rows.
    const seen = new Set();
    return rows.filter(shift => {
      const teamKey = [shift.shift_date, shift.start_time, shift.end_time, shift.location, ...(shift.partner_officer_email ? [shift.officer_email, shift.partner_officer_email].sort() : [shift.officer_email])].join('|');
      if (seen.has(teamKey)) return false;
      seen.add(teamKey);
      return true;
    }).sort((a, b) => `${a.shift_date} ${a.start_time}`.localeCompare(`${b.shift_date} ${b.start_time}`));
  }, [schedules, dates, isAdmin, user?.email]);

  const assignmentForShift = shift => assignments.find(a =>
    String(a.assignment_date || '').slice(0, 10) === String(shift.shift_date || '').slice(0, 10) &&
    a.start_time === shift.start_time &&
    a.end_time === shift.end_time &&
    (a.primary_officer_email === shift.officer_email || a.partner_officer_email === shift.officer_email)
  );

  const resolvePartnerEmail = shift => {
    if (shift.partner_officer_email) return shift.partner_officer_email;
    const partnerShift = schedules.find(other =>
      other.id !== shift.id &&
      other.archived !== true &&
      other.shift_date === shift.shift_date &&
      other.start_time === shift.start_time &&
      other.end_time === shift.end_time &&
      other.location === shift.location &&
      other.officer_email &&
      other.officer_email !== shift.officer_email &&
      other.officer_email !== 'OPEN'
    );
    return partnerShift?.officer_email || '';
  };

  const assignVehicleToShift = async shift => {
    if (!isAdmin) return;
    const chosenVehicleId = vehicleChoice[shift.id] || assignmentForShift(shift)?.vehicle_id || '';
    if (!chosenVehicleId) return;
    const vehicle = vehicles.find(item => item.id === chosenVehicleId);
    if (!vehicle) return;

    const currentAssignment = assignmentForShift(shift);
    const conflict = assignments.find(a =>
      a.id !== currentAssignment?.id &&
      a.vehicle_id === chosenVehicleId &&
      String(a.assignment_date || '').slice(0, 10) === String(shift.shift_date || '').slice(0, 10) &&
      a.status !== 'cancelled' &&
      overlaps(a.start_time, a.end_time, shift.start_time, shift.end_time)
    );
    if (conflict) {
      alert(`${vehicle.vehicle_id} is already assigned to ${conflict.primary_officer_name} from ${conflict.start_time}-${conflict.end_time}. Choose another vehicle.`);
      return;
    }

    setSavingShiftId(shift.id);
    try {
      const partnerEmail = resolvePartnerEmail(shift);
      const payload = {
        assignment_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        vehicle_id: vehicle.id,
        vehicle_label: vehicle.vehicle_id,
        primary_officer_email: shift.officer_email,
        primary_officer_name: getName(shift.officer_email),
        partner_officer_email: partnerEmail,
        partner_officer_name: partnerEmail ? getName(partnerEmail) : '',
        location: shift.location || '',
        status: 'scheduled',
        notes: currentAssignment?.notes || '',
        created_by_email: user?.email || ''
      };
      if (currentAssignment?.id) await base44.entities.VehicleAssignment.update(currentAssignment.id, payload);
      else await base44.entities.VehicleAssignment.create(payload);
      setVehicleChoice(prev => ({ ...prev, [shift.id]: vehicle.id }));
      await qc.invalidateQueries({ queryKey: ['fleetAssignments'] });
      await qc.invalidateQueries({ queryKey: ['myVehicleAssignments'] });
    } catch (error) {
      console.error('Fleet assignment failed', error);
      alert(error?.response?.data?.error || error?.message || 'Vehicle assignment could not be saved.');
    } finally {
      setSavingShiftId('');
    }
  };

  const removeAssignment = async (shift, assignment) => {
    if (!isAdmin || !assignment?.id || !await confirmInApp(`Remove ${assignment.vehicle_label} from ${getName(shift.officer_email)}?`)) return;
    await base44.entities.VehicleAssignment.delete(assignment.id);
    setVehicleChoice(prev => ({ ...prev, [shift.id]: '' }));
    await qc.invalidateQueries({ queryKey: ['fleetAssignments'] });
    await qc.invalidateQueries({ queryKey: ['myVehicleAssignments'] });
  };

  return <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-6">
    <div className="mx-auto max-w-[1500px] space-y-4">
      <section className="rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-6"><div className="flex flex-wrap items-center gap-3">
        <Car className="h-7 w-7 text-amber-400" />
        <div>
          <h1 className="text-xl font-black tracking-wide">FLEET VEHICLE SCHEDULE</h1>
          <p className="text-xs text-slate-500">Assign a vehicle directly to the officer's scheduled shift.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDayOffset(v => v - 3)}><ChevronLeft className="h-4 w-4" /></Button>
          <Badge variant="outline">{format(windowStart, 'MMM d')} - {format(addDays(windowStart, 2), 'MMM d, yyyy')}</Badge>
          <Button variant="outline" size="sm" onClick={() => setDayOffset(0)}>TODAY</Button>
          <Button variant="outline" size="sm" onClick={() => setDayOffset(v => v + 3)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div></section>

      {(vehicleError || scheduleError || assignmentError) && <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">Fleet data could not be fully loaded. Refresh the page; if the message remains, verify fleet and scheduling access.</div>}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="border-slate-800 bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-sm">FLEET STATUS</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded border border-emerald-900 bg-emerald-950/20 p-3">
              <div className="text-[10px] font-bold uppercase text-emerald-300">Available Vehicles</div>
              <div className="mt-1 text-2xl font-black">{availableVehicles.length}</div>
            </div>
            <div className="space-y-1">{availableVehicles.map(v => <div key={v.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs"><div className="font-bold text-white">{v.vehicle_id}</div><div className="text-slate-500">{v.year} {v.make} {v.model}</div></div>)}</div>
            {maintenanceVehicles.length > 0 && <div className="rounded border border-red-900 bg-red-950/20 p-2"><div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-red-300"><Wrench className="h-3 w-3" />UNAVAILABLE</div>{maintenanceVehicles.map(v => <div key={v.id} className="text-[10px] text-slate-400">{v.vehicle_id} · {v.status}</div>)}</div>}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-3">
          {dates.map(date => {
            const dayShifts = visibleShifts.filter(shift => shift.shift_date === date);
            return <Card key={date} className="border-slate-800 bg-slate-900 text-white">
              <CardHeader className="border-b border-slate-800 pb-3">
                <CardTitle className="flex items-center justify-between text-sm"><span>{format(new Date(`${date}T12:00:00`), 'EEEE')}</span><span className="text-xs font-normal text-slate-400">{format(new Date(`${date}T12:00:00`), 'MMM d')}</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-3">
                {dayShifts.map(shift => {
                  const assignment = assignmentForShift(shift);
                  const selected = vehicleChoice[shift.id] ?? assignment?.vehicle_id ?? '';
                  const partnerEmail = resolvePartnerEmail(shift);
                  return <div key={shift.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-white">{getName(shift.officer_email)}</div>
                        {partnerEmail && <div className="mt-1 flex items-center gap-1 text-xs text-blue-300"><Users className="h-3 w-3" />{getName(partnerEmail)}</div>}
                      </div>
                      {assignment && <Badge className="bg-amber-600 text-black">{assignment.vehicle_label}</Badge>}
                    </div>
                    <div className="mt-2 text-xs text-slate-300">{shift.start_time} - {shift.end_time}</div>
                    <div className="mt-1 text-xs text-slate-500">{String(shift.location || '').split(':')[0]}</div>

                    {isAdmin && <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                      <Select value={selected} onValueChange={value => setVehicleChoice(prev => ({ ...prev, [shift.id]: value }))}>
                        <SelectTrigger className="border-slate-700 bg-slate-900"><SelectValue placeholder="Select vehicle for this shift" /></SelectTrigger>
                        <SelectContent>{availableVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.vehicle_id} · {v.year} {v.make} {v.model}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => assignVehicleToShift(shift)} disabled={!selected || savingShiftId === shift.id} className="flex-1 bg-amber-600 hover:bg-amber-500"><CheckCircle2 className="mr-1 h-4 w-4" />{assignment ? 'CHANGE VEHICLE' : 'ASSIGN VEHICLE'}</Button>
                        {assignment && <Button size="sm" variant="outline" onClick={() => removeAssignment(shift, assignment)} className="border-red-900 text-red-300"><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>}
                  </div>;
                })}
                {dayShifts.length === 0 && <div className="rounded border border-dashed border-slate-800 py-12 text-center text-xs text-slate-500">NO SCHEDULED SHIFTS FOR THIS DATE</div>}
              </CardContent>
            </Card>;
          })}
        </div>
      </div>
    </div>
  </div>;
}
