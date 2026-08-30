import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ChevronLeft, ChevronRight, CalendarClock, MapPin, Trash2, CheckCircle2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { confirmInApp } from '@/lib/inAppDialog';

const lower = value => String(value || '').trim().toLowerCase();
const minutes = value => { const [h=0,m=0] = String(value || '00:00').split(':').map(Number); return h*60+m; };
const overlaps = (aStart,aEnd,bStart,bEnd) => {
  const normalize = (start,end) => { const s=minutes(start); let e=minutes(end); if(e<=s)e+=1440; return [s,e]; };
  const [as,ae]=normalize(aStart,aEnd); const [bs,be]=normalize(bStart,bEnd); return as<be&&bs<ae;
};

export default function DutySupervisorScheduling() {
  const qc = useQueryClient();
  const [dayOffset,setDayOffset] = useState(0);
  const [editing,setEditing] = useState(null);
  const [saving,setSaving] = useState(false);
  const [form,setForm] = useState({ assignment_date:format(new Date(),'yyyy-MM-dd'), start_time:'18:00', end_time:'06:00', locations:['ALL'], supervisor_email:'', notes:'' });
  const { data:user } = useQuery({ queryKey:['currentUser'], queryFn:()=>base44.auth.me() });
  const roles = new Set((user?.additional_roles || []).map(lower));
  const canManage = user?.role === 'admin' || roles.has('full_access') || roles.has('supervisor') || user?.is_supervisor === true;
  const { data:users=[] } = useQuery({ queryKey:['dutySupervisorUsers'], queryFn:()=>listDirectoryUsers('last_name',1000) });
  const { data:locations=[] } = useQuery({ queryKey:['dutySupervisorLocations'], queryFn:async()=> (await listDirectoryLocations('site_name',1000)).filter(row=>row.active!==false) });
  const { data:assignments=[],error } = useQuery({ queryKey:['dutySupervisorAssignments'], queryFn:()=>base44.entities.DutySupervisorAssignment.list('-assignment_date',1000), refetchInterval:30000 });

  const supervisors = useMemo(()=>users.filter(person=>{
    const r=new Set((person.additional_roles||[]).map(lower));
    return !person.termination_date && (person.role==='admin'||person.is_supervisor===true||r.has('supervisor')||r.has('full_access')||['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal'].includes(lower(person.rank)));
  }).sort((a,b)=>String(a.last_name||a.full_name||'').localeCompare(String(b.last_name||b.full_name||''))),[users]);

  const windowStart=addDays(startOfDay(new Date()),dayOffset);
  const dates=Array.from({length:7},(_,i)=>format(addDays(windowStart,i),'yyyy-MM-dd'));
  const visible=assignments.filter(row=>dates.includes(String(row.assignment_date||'').slice(0,10))&&lower(row.status)!=='cancelled');
  const personLabel=email=>{ const p=users.find(row=>lower(row.email)===lower(email)); return p ? [p.rank,p.last_name||p.first_name].filter(Boolean).join(' ') : email; };

  const reset = date => { setEditing(null); setForm({ assignment_date:date||format(windowStart,'yyyy-MM-dd'), start_time:'18:00', end_time:'06:00', locations:['ALL'], supervisor_email:'', notes:'' }); };
  const startEdit = row => { setEditing(row); setForm({ assignment_date:row.assignment_date,start_time:row.start_time,end_time:row.end_time,locations:[row.location||'ALL'],supervisor_email:row.supervisor_email,notes:row.notes||'' }); };
  const toggleCoverageArea = area => setForm(current => {
    const selected = Array.isArray(current.locations) ? current.locations : ['ALL'];
    if (area === 'ALL') return { ...current, locations:['ALL'] };
    const withoutAll = selected.filter(value => value !== 'ALL');
    const next = withoutAll.includes(area) ? withoutAll.filter(value => value !== area) : [...withoutAll, area];
    return { ...current, locations: next.length ? next : ['ALL'] };
  });
  const save = async () => {
    if(!canManage) return;
    if(!form.supervisor_email) return toast.error('Select a duty supervisor.');
    const requestedAreas = Array.isArray(form.locations) && form.locations.length ? form.locations : ['ALL'];
    const conflict=assignments.find(row=>row.id!==editing?.id&&row.assignment_date===form.assignment_date&&lower(row.status)!=='cancelled'&&overlaps(row.start_time,row.end_time,form.start_time,form.end_time)&&requestedAreas.some(area => (row.location||'ALL')==='ALL'||area==='ALL'||lower(row.location)===lower(area))&&lower(row.supervisor_email)!==lower(form.supervisor_email));
    if(conflict) return toast.error(`Coverage area overlaps ${conflict.supervisor_name||personLabel(conflict.supervisor_email)} from ${conflict.start_time}-${conflict.end_time}. A single duty supervisor may cover multiple areas at the same time, but two different duty supervisors cannot overlap the same area.`);
    setSaving(true);
    try {
      if (editing) {
        const area = requestedAreas[0] || 'ALL';
        const response=await base44.functions.invoke('manageDutySupervisorSchedule',{ action:'save', assignment:{...form,location:area,id:editing.id,status:'scheduled'} });
        const payload=response?.data||response||{}; if(payload.error) throw new Error(payload.error);
      } else {
        const results = await Promise.all(requestedAreas.map(location => base44.functions.invoke('manageDutySupervisorSchedule',{ action:'save', assignment:{...form,location,status:'scheduled'} })));
        const failed = results.map(response => response?.data||response||{}).find(payload => payload.error);
        if(failed?.error) throw new Error(failed.error);
      }
      await qc.invalidateQueries({queryKey:['dutySupervisorAssignments']});
      await qc.invalidateQueries({queryKey:['myScheduleData']});
      toast.success(editing?'Duty supervisor assignment updated.':`Duty supervisor scheduled for ${requestedAreas.length} coverage area${requestedAreas.length===1?'':'s'}.`); reset(form.assignment_date);
    } catch(e){ toast.error(e?.response?.data?.error||e?.message||'Unable to save duty supervisor.'); } finally { setSaving(false); }
  };
  const remove=async row=>{ if(!canManage||!await confirmInApp(`Remove ${row.supervisor_name||personLabel(row.supervisor_email)} from duty supervisor coverage?`)) return; const response=await base44.functions.invoke('manageDutySupervisorSchedule',{action:'delete',id:row.id}); const payload=response?.data||response||{}; if(payload.error)return toast.error(payload.error); await qc.invalidateQueries({queryKey:['dutySupervisorAssignments']}); toast.success('Duty supervisor assignment removed.'); };

  return <div className="bps-command-page min-h-full bg-[#080d16] p-4 text-white md:p-6">
    <div className="mx-auto max-w-[1700px] space-y-5">
      <section className="bps-command-hero rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.26em] text-cyan-300">Scheduling Command</div><h1 className="mt-2 text-3xl font-black md:text-4xl">Duty Supervisor Schedule</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Schedule command coverage by date, time, and site. Officers see the assigned duty supervisor directly on their published schedule.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setDayOffset(v=>v-7)}><ChevronLeft className="h-4 w-4"/></Button><Button variant="outline" onClick={()=>setDayOffset(0)}>TODAY</Button><Button variant="outline" onClick={()=>setDayOffset(v=>v+7)}><ChevronRight className="h-4 w-4"/></Button></div></div>
      </section>
      {error&&<div className="rounded-2xl border border-red-700/60 bg-red-950/25 p-4 text-sm text-red-200">Duty supervisor schedule could not load: {error.message}</div>}
      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10"><ShieldCheck className="h-5 w-5 text-cyan-300"/></div><div><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Coverage Assignment</div><div className="text-sm text-slate-500">{editing?'Editing existing coverage':'Create duty coverage'}</div></div></div>
          <div className="mt-5 space-y-4"><div><Label>Date</Label><Input type="date" value={form.assignment_date} onChange={e=>setForm({...form,assignment_date:e.target.value})}/></div><div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></div><div><Label>End</Label><Input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></div></div><div><Label>Duty Supervisor</Label><Select value={form.supervisor_email} onValueChange={value=>setForm({...form,supervisor_email:value})}><SelectTrigger><SelectValue placeholder="Select supervisor"/></SelectTrigger><SelectContent>{supervisors.map(person=><SelectItem key={person.id||person.email} value={person.email}>{[person.rank,person.last_name||person.first_name].filter(Boolean).join(' ')}</SelectItem>)}</SelectContent></Select></div><div><Label>Coverage Areas</Label><p className="mb-2 mt-1 text-[11px] leading-4 text-slate-500">Choose one or more areas. The same duty supervisor can cover multiple sites during the same time block.</p><div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-[#09111d] p-2"><button type="button" onClick={()=>toggleCoverageArea('ALL')} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-bold ${form.locations.includes('ALL')?'border-cyan-500/50 bg-cyan-500/10 text-cyan-100':'border-slate-700 text-slate-300'}`}><span>All Sites / Company Duty</span>{form.locations.includes('ALL')&&<Check className="h-4 w-4"/>}</button>{locations.map(location=>{const active=form.locations.includes(location.site_name);return <button type="button" key={location.id} onClick={()=>toggleCoverageArea(location.site_name)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-bold ${active?'border-cyan-500/50 bg-cyan-500/10 text-cyan-100':'border-slate-700 text-slate-300 hover:border-slate-500'}`}><span>{location.site_name}</span>{active&&<Check className="h-4 w-4"/>}</button>})}</div><div className="mt-2 text-[10px] font-bold text-cyan-300">SELECTED: {form.locations.join(' • ')}</div></div><div><Label>Notes</Label><Input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional duty notes"/></div>{canManage&&<div className="flex gap-2"><Button className="flex-1 bg-cyan-700 hover:bg-cyan-600" onClick={save} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4"/>{saving?'SAVING…':editing?'UPDATE COVERAGE':'SCHEDULE SUPERVISOR'}</Button>{editing&&<Button variant="outline" onClick={()=>reset(form.assignment_date)}>CANCEL</Button>}</div>}</div>
        </section>
        <section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">7-Day Command Coverage</div><h2 className="mt-1 text-2xl font-black">{format(windowStart,'MMM d')} – {format(addDays(windowStart,6),'MMM d, yyyy')}</h2></div><Badge variant="outline">{visible.length} ASSIGNMENTS</Badge></div><div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{dates.map(date=>{const day=visible.filter(row=>row.assignment_date===date);return <div key={date} className="overflow-hidden rounded-2xl border border-slate-700 bg-[#101826]"><div className="border-b border-slate-700 px-4 py-3"><div className="text-sm font-black">{format(new Date(`${date}T12:00:00`),'EEEE')}</div><div className="text-xs text-slate-500">{format(new Date(`${date}T12:00:00`),'MMM d')}</div></div><div className="space-y-2 p-3">{day.map(row=><button type="button" key={row.id} onClick={()=>canManage&&startEdit(row)} className="w-full rounded-xl border border-slate-700 bg-[#0a111d] p-3 text-left transition hover:border-cyan-600/60"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-black text-white">{row.supervisor_name||personLabel(row.supervisor_email)}</div><div className="mt-1 flex items-center gap-1 text-xs text-cyan-300"><CalendarClock className="h-3.5 w-3.5"/>{row.start_time}–{row.end_time}</div><div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5"/>{row.location==='ALL'?'All Sites':row.location}</div></div>{canManage&&<span onClick={e=>{e.stopPropagation();remove(row);}} className="rounded-lg border border-red-800/60 p-2 text-red-300 hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5"/></span>}</div></button>)}{!day.length&&<button type="button" onClick={()=>{reset(date);setForm(current=>({...current,assignment_date:date}));}} className="w-full rounded-xl border border-dashed border-slate-700 px-3 py-8 text-center text-xs font-bold text-slate-600 hover:border-cyan-700 hover:text-cyan-400">NO DUTY COVERAGE</button>}</div></div>})}</div></section>
      </div>
    </div>
  </div>;
}
