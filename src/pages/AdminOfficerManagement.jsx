import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CalendarDays, Check, CheckCircle2, Clock3, MapPin, Save, Search, Shield, UserCheck, Users, XCircle } from 'lucide-react';
import { listDirectoryLocations, listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { createPageUrl } from '@/utils';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const DAY_FULL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const normalize = value => String(value || '').trim().toLowerCase();
const dateKey = value => {
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const rankLast = officer => {
  if (!officer) return 'Officer';
  const last = String(officer.last_name || officer.full_name || '').trim().split(/\s+/).pop();
  return [String(officer.rank || '').trim(), last].filter(Boolean).join(' ') || (officer.unit_number ? `Unit ${officer.unit_number}` : 'Officer');
};

export default function AdminOfficerManagement() {
  const queryClient = useQueryClient();
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [availability, setAvailability] = useState({});
  const [maxHours, setMaxHours] = useState(40);
  const [preferredShiftLength, setPreferredShiftLength] = useState('8');
  const [canSplitSites, setCanSplitSites] = useState(false);
  const [daysOff, setDaysOff] = useState([]);
  const [newDayOff, setNewDayOff] = useState('');
  const [preferredLocations, setPreferredLocations] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const roles = new Set((user?.additional_roles || []).map(normalize));
  const isAdmin = user?.role === 'admin' || roles.has('full_access');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['officerDirectory', 'adminOfficerManagement'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: isAdmin,
  });
  const { data: allAvailability = [] } = useQuery({
    queryKey: ['allAvailability'], queryFn: () => base44.entities.OfficerAvailability.list(), enabled: isAdmin,
  });
  const { data: availabilityRequests = [] } = useQuery({
    queryKey: ['availabilityApprovalQueue'], queryFn: () => base44.entities.AvailabilityRequest.list('-requested_at', 200), enabled: isAdmin,
  });
  const { data: schedules = [] } = useQuery({
    queryKey: ['availabilityWorkspaceSchedules'], queryFn: () => base44.entities.Schedule.list('-shift_date', 1200), enabled: isAdmin,
    staleTime: 30000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ['activeLocations'], queryFn: async () => (await listDirectoryLocations('site_name')).filter(l => l.active !== false), enabled: isAdmin,
  });

  const activeOfficers = useMemo(() => (allUsers || []).filter(isOperationalOfficer), [allUsers]);
  const officerByEmail = useMemo(() => new Map(activeOfficers.map(o => [normalize(o.email), o])), [activeOfficers]);
  const pendingRequests = useMemo(() => availabilityRequests.filter(r => normalize(r.status) === 'pending'), [availabilityRequests]);

  const today = dateKey(new Date());
  const endWindow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 13); return dateKey(d);
  }, []);
  const upcomingSchedules = useMemo(() => (schedules || []).filter(s => {
    const day = dateKey(s.shift_date || s.start_time || s.date);
    return day && day >= today && day <= endWindow && s.archived !== true;
  }), [schedules, today, endWindow]);
  const openShifts = useMemo(() => upcomingSchedules.filter(s => s.is_open === true || ['open', 'unassigned'].includes(normalize(s.officer_email))), [upcomingSchedules]);
  const assignedUpcoming = useMemo(() => upcomingSchedules.filter(s => !openShifts.includes(s)), [upcomingSchedules, openShifts]);
  const officersWithoutAvailability = useMemo(() => activeOfficers.filter(o => !(allAvailability || []).some(a => normalize(a.officer_email) === normalize(o.email))), [activeOfficers, allAvailability]);

  const filteredOfficers = useMemo(() => activeOfficers.filter(o => {
    const hay = `${rankLast(o)} ${o.unit_number || ''}`.toLowerCase();
    return hay.includes(searchTerm.trim().toLowerCase());
  }).sort((a, b) => rankLast(a).localeCompare(rankLast(b))), [activeOfficers, searchTerm]);

  const selectedOfficerRecord = officerByEmail.get(normalize(selectedOfficer));
  const selectedUpcoming = useMemo(() => upcomingSchedules.filter(s => normalize(s.officer_email) === normalize(selectedOfficer)), [upcomingSchedules, selectedOfficer]);

  useEffect(() => {
    if (!selectedOfficer) return;
    const rows = allAvailability.filter(a => normalize(a.officer_email) === normalize(selectedOfficer));
    const mapped = {};
    DAYS.forEach(day => { mapped[day] = { available: true, preferred_start_time: '07:00', preferred_end_time: '23:00' }; });
    rows.forEach(a => { mapped[a.day_of_week] = { ...mapped[a.day_of_week], ...a }; });
    setAvailability(mapped);
    setMaxHours(rows[0]?.max_hours_per_week || 40);
    setPreferredShiftLength(String(rows[0]?.preferred_shift_length || '8'));
    setCanSplitSites(Boolean(rows[0]?.can_split_sites));
    setDaysOff(rows[0]?.days_off || []);
    setPreferredLocations(rows[0]?.preferred_locations || []);
    setNotes(rows[0]?.notes || '');
  }, [selectedOfficer, allAvailability]);

  const reviewAvailabilityRequest = async (request, approved) => {
    try {
      if (approved) {
        const snapshot = JSON.parse(request.availability_snapshot || '[]');
        const existing = allAvailability.filter(a => normalize(a.officer_email) === normalize(request.officer_email));
        for (const row of snapshot) {
          const current = existing.find(a => a.day_of_week === row.day_of_week);
          const payload = { officer_email: request.officer_email, ...row };
          if (current?.id) await base44.entities.OfficerAvailability.update(current.id, payload);
          else await base44.entities.OfficerAvailability.create(payload);
        }
      }
      await base44.entities.AvailabilityRequest.update(request.id, {
        status: approved ? 'approved' : 'denied', reviewed_by: user.email, reviewed_at: new Date().toISOString(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['availabilityApprovalQueue'] }),
        queryClient.invalidateQueries({ queryKey: ['allAvailability'] }),
        queryClient.invalidateQueries({ queryKey: ['officerAvailability'] }),
        queryClient.invalidateQueries({ queryKey: ['availabilityWorkspaceSchedules'] }),
      ]);
    } catch (error) {
      alert(`Unable to review request: ${error.message}`);
    }
  };

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfficer) throw new Error('Select an officer first.');
      setSaving(true);
      const existing = allAvailability.filter(a => normalize(a.officer_email) === normalize(selectedOfficer));
      for (const day of DAYS) {
        const dayData = availability[day] || {};
        const row = existing.find(a => a.day_of_week === day);
        const payload = {
          officer_email: selectedOfficer,
          day_of_week: day,
          available: dayData.available !== false,
          preferred_start_time: dayData.preferred_start_time || '07:00',
          preferred_end_time: dayData.preferred_end_time || '23:00',
          max_hours_per_week: maxHours,
          preferred_shift_length: preferredShiftLength,
          can_split_sites: canSplitSites,
          days_off: daysOff,
          preferred_locations: preferredLocations,
          notes,
        };
        if (row?.id) await base44.entities.OfficerAvailability.update(row.id, payload);
        else await base44.entities.OfficerAvailability.create(payload);
      }
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['allAvailability'] }); setSaving(false); },
    onError: error => { setSaving(false); alert(error.message || 'Failed to save.'); },
  });

  const updateDay = (day, field, value) => setAvailability(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  const toggleLocation = name => setPreferredLocations(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  const addDayOff = () => { if (newDayOff && !daysOff.includes(newDayOff)) { setDaysOff(prev => [...prev, newDayOff]); setNewDayOff(''); } };

  if (!isAdmin) return <div className="p-10 text-center text-slate-300"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><div className="text-xl font-black">Admin Access Required</div></div>;

  return (
    <div className="min-h-screen bg-[#07101b] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0d1b2b] via-[#0c1725] to-[#09121d] shadow-2xl">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300">Scheduling Command</div>
              <h1 className="mt-1 text-2xl font-black md:text-3xl">Officer Availability & Assignments</h1>
              <p className="mt-1 text-sm text-slate-400">Approve availability, identify coverage gaps, review upcoming assignments, and manage officer scheduling preferences.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.location.href = createPageUrl('AdminScheduling')} className="border-slate-700 bg-slate-900 text-slate-200">OPEN SCHEDULING</Button>
              <Button variant="outline" onClick={() => window.location.href = createPageUrl('AdminPlannedShifts')} className="border-slate-700 bg-slate-900 text-slate-200">PLANNED SHIFTS</Button>
              {selectedOfficer && <Button onClick={() => saveAvailabilityMutation.mutate()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500"><Save className="mr-2 h-4 w-4"/>{saving ? 'SAVING…' : 'SAVE OFFICER'}</Button>}
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-slate-800 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['PENDING APPROVALS', pendingRequests.length, pendingRequests.length ? 'text-amber-300' : 'text-emerald-300'],
              ['ACTIVE OFFICERS', activeOfficers.length, 'text-cyan-300'],
              ['OPEN SHIFTS · 14D', openShifts.length, openShifts.length ? 'text-red-300' : 'text-emerald-300'],
              ['ASSIGNED SHIFTS · 14D', assignedUpcoming.length, 'text-blue-300'],
              ['NO AVAILABILITY', officersWithoutAvailability.length, officersWithoutAvailability.length ? 'text-amber-300' : 'text-emerald-300'],
              ['ACTIVE SITES', locations.length, 'text-violet-300'],
            ].map(([label, value, tone]) => <div key={label} className="border-b border-r border-slate-800 p-4 lg:border-b-0"><div className={`text-2xl font-black ${tone}`}>{value}</div><div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-500">{label}</div></div>)}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
          <section className="rounded-2xl border border-amber-500/20 bg-[#0b1624] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Pending Actions</div><h2 className="mt-1 text-xl font-black">Availability Approval Queue</h2></div><Badge className="bg-amber-500/15 text-amber-200">{pendingRequests.length}</Badge></div>
            <div className="mt-4 space-y-2">
              {pendingRequests.slice(0,8).map(req => {
                let snapshot = []; try { snapshot = JSON.parse(req.availability_snapshot || '[]'); } catch {}
                const officer = officerByEmail.get(normalize(req.officer_email));
                return <div key={req.id} className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="font-black text-white">{rankLast(officer)}</div><div className="mt-1 text-xs text-slate-500">Submitted {req.requested_at ? new Date(req.requested_at).toLocaleString() : 'recently'}</div></div><div className="flex gap-2"><Button size="sm" onClick={() => reviewAvailabilityRequest(req, true)} className="bg-emerald-600 hover:bg-emerald-500"><CheckCircle2 className="mr-1 h-4 w-4"/>APPROVE</Button><Button size="sm" variant="destructive" onClick={() => reviewAvailabilityRequest(req, false)}><XCircle className="mr-1 h-4 w-4"/>DENY</Button></div></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{snapshot.map(day => <span key={day.day_of_week} className={`rounded-md border px-2 py-1 text-[10px] font-bold ${day.available ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-200' : 'border-red-800/50 bg-red-950/30 text-red-200'}`}>{DAY_LABELS[day.day_of_week]} · {day.available ? `${day.preferred_start_time || '—'}–${day.preferred_end_time || '—'}` : 'Unavailable'}</span>)}</div>
                </div>;
              })}
              {!pendingRequests.length && <div className="rounded-xl border border-dashed border-emerald-800/50 p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400"/><div className="mt-2 font-black text-emerald-200">Approval queue clear</div><div className="mt-1 text-xs text-slate-500">No officer availability requests are waiting.</div></div>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5 shadow-xl">
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Coverage Watch</div><h2 className="mt-1 text-xl font-black">Scheduling attention</h2>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><AlertTriangle className={`h-5 w-5 ${openShifts.length ? 'text-red-300' : 'text-emerald-300'}`}/><div className="flex-1"><div className="text-sm font-black">Open shifts next 14 days</div><div className="text-xs text-slate-500">{openShifts.length ? `${openShifts.length} shift(s) still need coverage.` : 'No open coverage gaps found.'}</div></div><Button size="sm" variant="outline" onClick={() => window.location.href = createPageUrl('AdminScheduling')} className="border-slate-700">VIEW</Button></div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><UserCheck className={`h-5 w-5 ${officersWithoutAvailability.length ? 'text-amber-300' : 'text-emerald-300'}`}/><div className="flex-1"><div className="text-sm font-black">Missing approved availability</div><div className="text-xs text-slate-500">{officersWithoutAvailability.length ? `${officersWithoutAvailability.length} active officer(s) have no approved availability on file.` : 'Every active officer has availability on file.'}</div></div></div>
              {openShifts.slice(0,4).map(shift => <div key={shift.id} className="rounded-xl border border-red-900/30 bg-red-950/10 px-4 py-3"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black text-white">{shift.location || 'Unassigned site'}</div><div className="text-xs text-red-200">{dateKey(shift.shift_date)} · {shift.start_time || '—'}–{shift.end_time || '—'}</div></div><span className="text-[9px] font-black text-red-300">OPEN</span></div></div>)}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5 shadow-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1"><div className="text-[10px] font-black uppercase tracking-[.18em] text-blue-300">Officer Workspace</div><h2 className="mt-1 text-xl font-black">Select an officer to manage</h2><p className="mt-1 text-xs text-slate-500">Directory uses rank + last name. Search by rank, last name, or unit number.</p></div>
            <div className="relative w-full lg:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search rank, last name, unit…" className="border-slate-700 bg-[#07101b] pl-10 text-white"/></div>
            <Select value={selectedOfficer} onValueChange={setSelectedOfficer}><SelectTrigger className="w-full border-slate-700 bg-[#07101b] text-white lg:w-80"><SelectValue placeholder="Select officer…"/></SelectTrigger><SelectContent>{filteredOfficers.map(officer => <SelectItem key={officer.email} value={officer.email}>{rankLast(officer)}{officer.unit_number ? ` · Unit ${officer.unit_number}` : ''}</SelectItem>)}</SelectContent></Select>
          </div>
        </section>

        {selectedOfficer && <>
          <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5">
              <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Officer Profile</div><h3 className="mt-1 text-xl font-black">{rankLast(selectedOfficerRecord)}</h3></div>{selectedOfficerRecord?.unit_number && <Badge className="bg-blue-500/15 text-blue-200">UNIT {selectedOfficerRecord.unit_number}</Badge>}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{maxHours}</div><div className="text-[10px] text-slate-500">MAX HOURS / WEEK</div></div>
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{preferredShiftLength}h</div><div className="text-[10px] text-slate-500">PREFERRED SHIFT</div></div>
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{selectedUpcoming.length}</div><div className="text-[10px] text-slate-500">SHIFTS · NEXT 14D</div></div>
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{preferredLocations.length}</div><div className="text-[10px] text-slate-500">PREFERRED SITES</div></div>
              </div>
              <div className="mt-4 space-y-3"><div><Label className="text-slate-300">Max hours per week</Label><Input type="number" min={8} max={80} value={maxHours} onChange={e => setMaxHours(Number(e.target.value) || 40)} className="mt-1 border-slate-700 bg-[#07101b] text-white"/></div><div><Label className="text-slate-300">Preferred shift length</Label><Select value={preferredShiftLength} onValueChange={setPreferredShiftLength}><SelectTrigger className="mt-1 border-slate-700 bg-[#07101b]"><SelectValue/></SelectTrigger><SelectContent>{['6','8','10','12'].map(v => <SelectItem key={v} value={v}>{v} hours</SelectItem>)}</SelectContent></Select></div><div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><Switch checked={canSplitSites} onCheckedChange={setCanSplitSites}/><Label>Can split shifts between sites</Label></div></div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Upcoming Assignments</div><h3 className="mt-1 text-xl font-black">Next 14 days</h3>
              <div className="mt-4 grid gap-2 md:grid-cols-2">{selectedUpcoming.slice(0,10).map(shift => <div key={shift.id} className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-300"/><div className="text-sm font-black">{dateKey(shift.shift_date)}</div></div><div className="mt-1 text-xs text-slate-300">{shift.location || 'Location pending'}</div><div className="mt-1 text-[10px] text-slate-500">{shift.start_time || '—'}–{shift.end_time || '—'}</div></div>)}{!selectedUpcoming.length && <div className="col-span-full rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No scheduled assignments in the next 14 days.</div>}</div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5">
            <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-emerald-300"/><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Weekly Availability</div><h3 className="text-xl font-black">Approved working windows</h3></div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{DAYS.map(day => { const row = availability[day] || {}; const on = row.available !== false; return <div key={day} className={`rounded-xl border p-3 ${on ? 'border-emerald-800/50 bg-emerald-950/15' : 'border-slate-800 bg-slate-950/30'}`}><div className="flex items-center justify-between"><span className={`text-sm font-black ${on ? 'text-emerald-200' : 'text-slate-500'}`}>{DAY_FULL[day]}</span><Switch checked={on} onCheckedChange={checked => updateDay(day, 'available', checked)}/></div>{on ? <div className="mt-3 space-y-2"><Input type="time" value={row.preferred_start_time || '07:00'} onChange={e => updateDay(day, 'preferred_start_time', e.target.value)} className="h-9 border-slate-700 bg-[#07101b] text-xs text-white"/><Input type="time" value={row.preferred_end_time || '23:00'} onChange={e => updateDay(day, 'preferred_end_time', e.target.value)} className="h-9 border-slate-700 bg-[#07101b] text-xs text-white"/></div> : <div className="mt-4 text-xs text-slate-600">Unavailable</div>}</div>; })}</div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-violet-300"/><h3 className="text-lg font-black">Preferred Locations</h3></div><div className="mt-4 flex flex-wrap gap-2">{locations.map(loc => <button type="button" key={loc.id} onClick={() => toggleLocation(loc.site_name)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${preferredLocations.includes(loc.site_name) ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-slate-700 bg-[#07101b] text-slate-400 hover:text-white'}`}>{preferredLocations.includes(loc.site_name) && <Check className="mr-1 inline h-3 w-3"/>}{loc.site_name}</button>)}</div></section>
            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><h3 className="text-lg font-black">Blocked Dates & Notes</h3><div className="mt-4 flex gap-2"><Input type="date" value={newDayOff} onChange={e => setNewDayOff(e.target.value)} className="border-slate-700 bg-[#07101b] text-white"/><Button type="button" onClick={addDayOff}>ADD DATE</Button></div><div className="mt-3 flex flex-wrap gap-2">{daysOff.map(date => <button type="button" key={date} onClick={() => setDaysOff(prev => prev.filter(d => d !== date))} className="rounded-md border border-red-800/50 bg-red-950/20 px-2 py-1 text-xs text-red-200">{date} ×</button>)}</div><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Scheduling notes…" className="mt-4 border-slate-700 bg-[#07101b] text-white"/></section>
          </div>
        </>}
      </div>
    </div>
  );
}
