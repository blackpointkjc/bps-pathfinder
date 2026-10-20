import OfficerCommandControls from '@/components/admin/OfficerCommandControls';
import AdminOutOfOffice from '@/components/AdminOutOfOffice';
import { actingCoverage } from '@/utils/commandReporting';
import { isOutOfOffice } from '@/utils/outOfOffice';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { comparePersonnel } from '@/utils/rankPolicy';
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
import { CalendarDays, Check, CheckCircle2, Clock3, MapPin, Shield, XCircle } from 'lucide-react';
import { invalidateAppDirectory, listDirectoryLocations, listOfficerDirectory } from '@/lib/appDirectory';
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
  const [homeAddressForm, setHomeAddressForm] = useState({ address: '', city: '', state: '', zip: '' });
  const [saving, setSaving] = useState(false);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const roles = new Set((user?.additional_roles || []).map(normalize));
  const isAdmin = user?.role === 'admin' || roles.has('full_access');

  const { data: allUsers = [], isPending:officersLoading, isError:officersError, refetch:retryOfficers } = useQuery({
    queryKey: ['officerDirectory', 'adminOfficerManagement'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: isAdmin,
  });
  const {data:commandUsers=[]} = useQuery({queryKey:['officerCoverageDirectory'],queryFn:()=>listDirectoryUsers(),enabled:isAdmin,staleTime:30000});
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
  useEffect(() => {
    if (!selectedOfficer && activeOfficers.length) setSelectedOfficer(activeOfficers[0].email);
  },[selectedOfficer,activeOfficers]);
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

  const filteredOfficers = useMemo(() => activeOfficers.filter(o => {
    const hay = `${rankLast(o)} ${o.unit_number || ''}`.toLowerCase();
    return hay.includes(searchTerm.trim().toLowerCase());
  }).sort(comparePersonnel), [activeOfficers, searchTerm]);

  const selectedOfficerRecord = officerByEmail.get(normalize(selectedOfficer));
  const { data: selectedOfficerPrivate = null } = useQuery({
    queryKey: ['adminOfficerPrivateProfile', selectedOfficer],
    queryFn: async () => {
      const rows = await base44.entities.User.filter({ email: selectedOfficer });
      return rows?.[0] || null;
    },
    enabled: isAdmin && Boolean(selectedOfficer),
    staleTime: 0,
  });
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

  useEffect(() => {
    const profile = selectedOfficerPrivate || selectedOfficerRecord;
    setHomeAddressForm({
      address: String(profile?.address || ''),
      city: String(profile?.city || ''),
      state: String(profile?.state || ''),
      zip: String(profile?.zip || ''),
    });
  }, [selectedOfficer, selectedOfficerPrivate?.id, selectedOfficerPrivate?.address, selectedOfficerPrivate?.city, selectedOfficerPrivate?.state, selectedOfficerPrivate?.zip]);

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

      const officerId = selectedOfficerPrivate?.id || selectedOfficerRecord?.id;
      if (!officerId) throw new Error('Unable to resolve the selected officer profile.');
      const profileResult = await base44.functions.invoke('updateUser', {
        userId: officerId,
        updates: {
          address: homeAddressForm.address.trim(),
          city: homeAddressForm.city.trim(),
          state: homeAddressForm.state.trim().toUpperCase(),
          zip: homeAddressForm.zip.trim(),
        },
      });
      const profilePayload = profileResult?.data || profileResult || {};
      if (profilePayload.error) throw new Error(profilePayload.error);
    },
    onSuccess: async () => {
      invalidateAppDirectory();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['allAvailability'] }),
        queryClient.invalidateQueries({ queryKey: ['adminOfficerPrivateProfile', selectedOfficer] }),
        queryClient.invalidateQueries({ queryKey: ['officerDirectory'] }),
      ]);
      setSaving(false);
      alert('Officer availability and Home navigation address saved.');
    },
    onError: error => { setSaving(false); alert(error.message || 'Failed to save.'); },
  });

  const updateDay = (day, field, value) => setAvailability(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  const toggleLocation = name => setPreferredLocations(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  const addDayOff = () => { if (newDayOff && !daysOff.includes(newDayOff)) { setDaysOff(prev => [...prev, newDayOff]); setNewDayOff(''); } };

  if (!isAdmin) return <div className="p-10 text-center text-slate-300"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><div className="text-xl font-black">Admin Access Required</div></div>;

  return (
    <div className="min-h-screen bg-[#07101b] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-3"><div><h1 className="text-xl font-black">Personnel & Command</h1><p className="mt-1 text-xs text-slate-400">Select one officer to manage platoon, reporting chain, CAD status, absence and weekly availability.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>window.location.href=createPageUrl('AdminScheduling')}>Scheduling</Button>{selectedOfficer && <Button size="sm" onClick={()=>saveAvailabilityMutation.mutate()} disabled={saving} className="bg-emerald-700">{saving?'Saving…':'Save working availability'}</Button>}</div></header>
        <div className="grid items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-700 bg-slate-900 p-3 lg:sticky lg:top-3"><label className="text-xs text-slate-400">Find officer<Input value={searchTerm} onChange={event=>setSearchTerm(event.target.value)} placeholder="Rank, name, unit…" className="mt-2 border-slate-600 bg-slate-950 text-white"/></label><div className="mt-3 max-h-[30vh] space-y-1 overflow-auto lg:max-h-[70vh]">{officersLoading?<p className="p-3 text-sm">Loading officers…</p>:officersError?<button type="button" onClick={()=>retryOfficers()} className="p-3 text-sm text-cyan-300">Could not load officers. Retry</button>:filteredOfficers.map(officer=><button type="button" key={officer.id} aria-pressed={selectedOfficer===officer.email} onClick={()=>setSelectedOfficer(officer.email)} className="w-full rounded-lg border border-transparent p-3 text-left text-sm hover:bg-slate-800 aria-pressed:border-cyan-600 aria-pressed:bg-cyan-950"><strong className="block">{rankLast(officer)}</strong><span className="mt-1 block text-xs text-slate-400">{officer.platoon?'Platoon '+officer.platoon:'Command'}{isOutOfOffice(officer)?' · Out of office':''}</span></button>)}</div></aside>
          <main className="min-w-0 space-y-4">
        {selectedOfficer && <>
          <section className="rounded-xl border border-cyan-800 bg-cyan-950/20 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">{rankLast(selectedOfficerRecord)}</h2><p className="mt-1 text-xs text-slate-400">{selectedOfficerRecord?.platoon ? 'Platoon '+selectedOfficerRecord.platoon : 'Command'} · {selectedOfficerRecord?.unit_number ? 'Unit '+selectedOfficerRecord.unit_number : selectedOfficerRecord?.email}</p></div><span className="rounded-full border border-slate-600 px-3 py-1 text-xs">{isOutOfOffice(selectedOfficerPrivate || selectedOfficerRecord)?'Out of office':'Available'}</span></div>
            <OfficerCommandControls key={selectedOfficerRecord?.id+':'+selectedOfficerRecord?.updated_date} officer={selectedOfficerPrivate||selectedOfficerRecord} users={commandUsers}/>
            <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,.65fr)]">
              <AdminOutOfOffice key={[selectedOfficer,(selectedOfficerPrivate || selectedOfficerRecord)?.out_of_office,(selectedOfficerPrivate || selectedOfficerRecord)?.out_of_office_start,(selectedOfficerPrivate || selectedOfficerRecord)?.out_of_office_return].join(':')} user={selectedOfficerPrivate || selectedOfficerRecord}/>
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4"><h3 className="text-sm font-bold text-cyan-200">Automatic acting coverage</h3><p className="text-lg font-bold">{(() => {const profile={...(selectedOfficerPrivate || selectedOfficerRecord),out_of_office:true,out_of_office_start:new Date(Date.now()-1000).toISOString(),out_of_office_return:new Date(Date.now()+60000).toISOString()};const acting=actingCoverage(profile,commandUsers);return acting?rankLast(acting)+(acting.unit_number?' · Unit '+acting.unit_number:''):'No available replacement';})()}</p><p className="text-xs leading-5 text-slate-400">Chosen by platoon, highest eligible rank, then earliest hire date, then unit number. Covers platoon command and assigned site supervision during the absence.</p><div className="border-t border-slate-700 pt-3 text-xs text-slate-300"><strong>Assigned tasks:</strong> eligible duties are shared among the highest available rank, starting with the longest-serving employee. Unfinished duties return automatically.</div></div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5">
            <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-emerald-300"/><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Weekly Availability</div><h3 className="text-xl font-black">Approved working windows</h3></div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{DAYS.map(day => { const row = availability[day] || {}; const on = row.available !== false; return <div key={day} className={`rounded-xl border p-3 ${on ? 'border-emerald-800/50 bg-emerald-950/15' : 'border-slate-800 bg-slate-950/30'}`}><div className="flex items-center justify-between"><span className={`text-sm font-black ${on ? 'text-emerald-200' : 'text-slate-500'}`}>{DAY_FULL[day]}</span><Switch checked={on} onCheckedChange={checked => updateDay(day, 'available', checked)}/></div>{on ? <div className="mt-3 space-y-2"><Input type="time" value={row.preferred_start_time || '07:00'} onChange={e => updateDay(day, 'preferred_start_time', e.target.value)} className="h-9 border-slate-700 bg-[#07101b] text-xs text-white"/><Input type="time" value={row.preferred_end_time || '23:00'} onChange={e => updateDay(day, 'preferred_end_time', e.target.value)} className="h-9 border-slate-700 bg-[#07101b] text-xs text-white"/></div> : <div className="mt-4 text-xs text-slate-600">Unavailable</div>}</div>; })}</div>
          </section>
          <details className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-200">Shift preferences, home address & upcoming assignments</summary><div className="mt-3">
          <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5">
              <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Officer Profile</div><h3 className="mt-1 text-xl font-black">{rankLast(selectedOfficerRecord)}</h3></div>{selectedOfficerRecord?.unit_number && <Badge className="bg-blue-500/15 text-blue-200">UNIT {selectedOfficerRecord.unit_number}</Badge>}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{maxHours}</div><div className="text-[10px] text-slate-500">MAX HOURS / WEEK</div></div>
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{preferredShiftLength}h</div><div className="text-[10px] text-slate-500">PREFERRED SHIFT</div></div>
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{selectedUpcoming.length}</div><div className="text-[10px] text-slate-500">SHIFTS · NEXT 14D</div></div>
                <div className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="text-xl font-black">{preferredLocations.length}</div><div className="text-[10px] text-slate-500">PREFERRED SITES</div></div>
              </div>
              <div className="mt-4 rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-3">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-cyan-300"/><div className="text-xs font-black uppercase tracking-[.12em] text-cyan-200">Home / Navigation Address</div></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label className="text-slate-300">Street Address</Label><Input autoComplete="street-address" value={homeAddressForm.address} onChange={e => setHomeAddressForm(prev => ({ ...prev, address: e.target.value }))} placeholder="123 Main Street" className="mt-1 border-slate-700 bg-[#07101b] text-white"/></div>
                  <div><Label className="text-slate-300">City</Label><Input autoComplete="address-level2" value={homeAddressForm.city} onChange={e => setHomeAddressForm(prev => ({ ...prev, city: e.target.value }))} placeholder="Richmond" className="mt-1 border-slate-700 bg-[#07101b] text-white"/></div>
                  <div className="grid grid-cols-[.8fr_1.2fr] gap-2"><div><Label className="text-slate-300">State</Label><Input autoComplete="address-level1" maxLength={2} value={homeAddressForm.state} onChange={e => setHomeAddressForm(prev => ({ ...prev, state: e.target.value.toUpperCase() }))} placeholder="VA" className="mt-1 border-slate-700 bg-[#07101b] text-white"/></div><div><Label className="text-slate-300">ZIP</Label><Input autoComplete="postal-code" value={homeAddressForm.zip} onChange={e => setHomeAddressForm(prev => ({ ...prev, zip: e.target.value }))} placeholder="23223" className="mt-1 border-slate-700 bg-[#07101b] text-white"/></div></div>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">Saved to the officer's User profile and used by their private GPS Home button.</p>
              </div>
              <div className="mt-4 space-y-3"><div><Label className="text-slate-300">Max hours per week</Label><Input type="number" min={8} max={80} value={maxHours} onChange={e => setMaxHours(Number(e.target.value) || 40)} className="mt-1 border-slate-700 bg-[#07101b] text-white"/></div><div><Label className="text-slate-300">Preferred shift length</Label><Select value={preferredShiftLength} onValueChange={setPreferredShiftLength}><SelectTrigger className="mt-1 border-slate-700 bg-[#07101b]"><SelectValue/></SelectTrigger><SelectContent>{['6','8','10','12'].map(v => <SelectItem key={v} value={v}>{v} hours</SelectItem>)}</SelectContent></Select></div><div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><Switch checked={canSplitSites} onCheckedChange={setCanSplitSites}/><Label>Can split shifts between sites</Label></div></div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Upcoming Assignments</div><h3 className="mt-1 text-xl font-black">Next 14 days</h3>
              <div className="mt-4 grid gap-2 md:grid-cols-2">{selectedUpcoming.slice(0,10).map(shift => <div key={shift.id} className="rounded-xl border border-slate-800 bg-[#0d1b2b] p-3"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-300"/><div className="text-sm font-black">{dateKey(shift.shift_date)}</div></div><div className="mt-1 text-xs text-slate-300">{shift.location || 'Location pending'}</div><div className="mt-1 text-[10px] text-slate-500">{shift.start_time || '—'}–{shift.end_time || '—'}</div></div>)}{!selectedUpcoming.length && <div className="col-span-full rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No scheduled assignments in the next 14 days.</div>}</div>
            </section>
          </div>



          </div></details>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-violet-300"/><h3 className="text-lg font-black">Preferred Locations</h3></div><div className="mt-4 flex flex-wrap gap-2">{locations.map(loc => <button type="button" key={loc.id} onClick={() => toggleLocation(loc.site_name)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${preferredLocations.includes(loc.site_name) ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-slate-700 bg-[#07101b] text-slate-400 hover:text-white'}`}>{preferredLocations.includes(loc.site_name) && <Check className="mr-1 inline h-3 w-3"/>}{loc.site_name}</button>)}</div></section>
            <section className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><h3 className="text-lg font-black">Blocked Dates & Notes</h3><div className="mt-4 flex gap-2"><Input type="date" value={newDayOff} onChange={e => setNewDayOff(e.target.value)} className="border-slate-700 bg-[#07101b] text-white"/><Button type="button" onClick={addDayOff}>ADD DATE</Button></div><div className="mt-3 flex flex-wrap gap-2">{daysOff.map(date => <button type="button" key={date} onClick={() => setDaysOff(prev => prev.filter(d => d !== date))} className="rounded-md border border-red-800/50 bg-red-950/20 px-2 py-1 text-xs text-red-200">{date} ×</button>)}</div><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Scheduling notes…" className="mt-4 border-slate-700 bg-[#07101b] text-white"/></section>
          </div>
        </>}
          </main>
        </div>
        <details className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="cursor-pointer text-sm font-bold">Availability approval queue · {pendingRequests.length} pending</summary><div className="mt-3">
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
        </div></details>
      </div>
    </div>
  );
}
