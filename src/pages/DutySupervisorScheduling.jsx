import { comparePersonnel } from '@/utils/rankPolicy';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay, startOfWeek } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ChevronLeft, ChevronRight, CheckCircle2, Check, Printer } from 'lucide-react';
import { openBlackPointReport } from '@/lib/reportPrint';
import { toast } from 'sonner';
import { confirmInApp } from '@/lib/inAppDialog';
import { useAuth } from '@/lib/AuthContext';

const lower = value => String(value || '').trim().toLowerCase();
const minutes = value => { const [h=0,m=0] = String(value || '00:00').split(':').map(Number); return h*60+m; };
const overlaps = (aStart,aEnd,bStart,bEnd) => {
  const normalize = (start,end) => { const s=minutes(start); let e=minutes(end); if(e<=s)e+=1440; return [s,e]; };
  const [as,ae]=normalize(aStart,aEnd); const [bs,be]=normalize(bStart,bEnd); return as<be&&bs<ae;
};

export default function DutySupervisorScheduling({ embedded=false, weekStart, editorOnly=false }) {
  const qc = useQueryClient();
  const [dayOffset,setDayOffset] = useState(0);
  const [repeatWeek,setRepeatWeek]=useState(false);
  const [editing,setEditing] = useState(null);
  const [saving,setSaving] = useState(false);
  const [form,setForm] = useState({ assignment_date:format(new Date(),'yyyy-MM-dd'), start_time:'18:00', end_time:'06:00', locations:['ALL'], supervisor_emails:[], notes:'' });
  const { user, isLoadingAuth:userLoading } = useAuth();
  const canManage = hasSupervisorAccess(user);
  const { data:users=[] } = useQuery({ queryKey:['dutySupervisorUsers'], queryFn:()=>listDirectoryUsers('last_name',1000) });
  const { data:locations=[] } = useQuery({ queryKey:['dutySupervisorLocations'], queryFn:async()=> (await listDirectoryLocations('site_name',1000)).filter(row=>row.active!==false) });
  const { data:assignments=[],error } = useQuery({ queryKey:['dutySupervisorAssignments'], queryFn:async()=>{ try { const response=await base44.functions.invoke('manageDutySupervisorSchedule',{action:'list'}); const payload=response?.data||response||{}; if(payload.error) throw new Error(payload.error); return payload.assignments||[]; } catch(error) { try { return await base44.entities.DutySupervisorAssignment.list('-assignment_date',1500); } catch { throw error; } } }, refetchInterval:5 * 60 * 1000 });

  useEffect(() => {
    let unsubscribe;
    try {
      unsubscribe = base44.entities.DutySupervisorAssignment.subscribe(() => {
        qc.invalidateQueries({ queryKey:['dutySupervisorAssignments'] });
      });
    } catch {}
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [qc]);

  const supervisors = useMemo(()=>users.filter(person=>{
    return !person.termination_date && (hasSupervisorAccess(person));
  }).sort(comparePersonnel),[users]);

  useEffect(()=>{if(weekStart&&!editing)setForm(current=>({...current,assignment_date:weekStart}));},[weekStart]);
  const windowStart=weekStart?new Date(weekStart+'T12:00:00'):addDays(startOfWeek(startOfDay(new Date()),{weekStartsOn:0}),dayOffset);
  const dates=Array.from({length:7},(_,i)=>format(addDays(windowStart,i),'yyyy-MM-dd'));
  const visible=assignments.filter(row=>dates.includes(String(row.assignment_date||'').slice(0,10))&&lower(row.status)!=='cancelled');
  const personLabel=email=>{ const p=users.find(row=>lower(row.email)===lower(email)); return p ? [p.rank,p.last_name||p.first_name].filter(Boolean).join(' ') : email; };
  const groupedVisible = useMemo(() => {
    const groups = new Map();
    visible.forEach(row => {
      const key = [row.assignment_date, row.start_time, row.end_time, lower(row.supervisor_email || row.supervisor_name)].join('|');
      const current = groups.get(key) || { ...row, rows: [], locations: [] };
      current.rows.push(row);
      if (!current.locations.includes(row.location || 'ALL')) current.locations.push(row.location || 'ALL');
      groups.set(key, current);
    });
    return [...groups.values()].sort((a,b) => String(a.assignment_date).localeCompare(String(b.assignment_date)) || minutes(a.start_time)-minutes(b.start_time) || personLabel(a.supervisor_email).localeCompare(personLabel(b.supervisor_email)));
  }, [visible, users]);

  const reset = date => { setEditing(null); setForm({ assignment_date:date||format(windowStart,'yyyy-MM-dd'), start_time:'18:00', end_time:'06:00', locations:['ALL'], supervisor_emails:[], notes:'' }); };
  const startEdit = group => { setEditing(group); setForm({ assignment_date:group.assignment_date,start_time:group.start_time,end_time:group.end_time,locations:group.locations?.length?group.locations:['ALL'],supervisor_emails:[group.supervisor_email],notes:group.notes||'' }); };
  const toggleSupervisor = email => setForm(current => {
    const selected = Array.isArray(current.supervisor_emails) ? current.supervisor_emails : [];
    const next = selected.includes(email) ? selected.filter(value => value !== email) : [...selected, email];
    return { ...current, supervisor_emails: next };
  });
  const toggleCoverageArea = area => setForm(current => {
    const selected = Array.isArray(current.locations) ? current.locations : ['ALL'];
    if (area === 'ALL') return { ...current, locations:['ALL'] };
    const withoutAll = selected.filter(value => value !== 'ALL');
    const next = withoutAll.includes(area) ? withoutAll.filter(value => value !== area) : [...withoutAll, area];
    return { ...current, locations: next.length ? next : ['ALL'] };
  });
  const save = async () => {
    if(!canManage) return;
    const requestedSupervisors = Array.isArray(form.supervisor_emails) ? form.supervisor_emails.filter(Boolean) : [];
    if(!requestedSupervisors.length) return toast.error('Select at least one duty supervisor.');
    const requestedAreas = Array.isArray(form.locations) && form.locations.length ? form.locations : ['ALL'];
    const editingIds = new Set((editing?.rows || []).map(row => row.id));
    const duplicate=assignments.find(row=>!editingIds.has(row.id)&&row.assignment_date===form.assignment_date&&lower(row.status)!=='cancelled'&&overlaps(row.start_time,row.end_time,form.start_time,form.end_time)&&requestedAreas.some(area => lower(row.location||'ALL')===lower(area))&&requestedSupervisors.some(email => lower(row.supervisor_email)===lower(email)));
    if(duplicate&&!repeatWeek) return toast.error(`${duplicate.supervisor_name||personLabel(duplicate.supervisor_email)} is already assigned to ${duplicate.location==='ALL'?'All Sites':duplicate.location} during this time.`);
    setSaving(true);
    try {
      const writeAssignment = async (supervisor_email, location, id = null) => {
        const supervisor = users.find(person => lower(person.email) === lower(supervisor_email));
        if (!supervisor) throw new Error('Selected duty supervisor was not found.');
        const payload = {
          assignment_date: form.assignment_date,
          start_time: form.start_time,
          end_time: form.end_time,
          location: location || 'ALL',
          supervisor_email: lower(supervisor.email),
          supervisor_name: [supervisor.rank, supervisor.last_name || supervisor.first_name].filter(Boolean).join(' '),
          supervisor_rank: supervisor.rank || '',
          status: 'scheduled',
          notes: form.notes || '',
          updated_by_email: user?.email || '',
        };
        const response = await base44.functions.invoke('manageDutySupervisorSchedule', { action:'save', assignment:{ ...payload, id } });
        const result = response?.data || response || {};
        if (result.error) throw new Error(result.error);
        return result.assignment;
      };
      const deleteAssignment = async row => {
        const response = await base44.functions.invoke('manageDutySupervisorSchedule', { action:'delete', id:row.id });
        const result = response?.data || response || {};
        if (result.error) throw new Error(result.error);
        return result;
      };
      if(!editing&&repeatWeek){
       const rows=[];
       for(let day=0;day<7;day++)for(const supervisor_email of requestedSupervisors)for(const location of requestedAreas)
        rows.push({assignment_date:format(addDays(new Date(form.assignment_date+'T12:00:00'),day),'yyyy-MM-dd'),start_time:form.start_time,end_time:form.end_time,supervisor_email,location,notes:form.notes});
       const response=await base44.functions.invoke('manageDutySupervisorSchedule',{action:'batch',assignments:rows});
       if(response.data?.error)throw new Error(response.data.error);
       toast.success(response.data.created+' duty blocks created; '+response.data.skipped+' existing blocks retained.');
      }else if (editing) {
        const supervisor_email = requestedSupervisors[0];
        const existingByArea = new Map((editing.rows || []).map(row => [lower(row.location || 'ALL'), row]));
        for (const location of requestedAreas) {
          const existing = existingByArea.get(lower(location));
          await writeAssignment(supervisor_email, location, existing?.id || null);
        }
        for (const row of (editing.rows || []).filter(row => !requestedAreas.some(area => lower(area) === lower(row.location || 'ALL')))) await deleteAssignment(row);
      } else {
        for (const supervisor_email of requestedSupervisors) {
          for (const location of requestedAreas) await writeAssignment(supervisor_email, location);
        }
      }
      await qc.invalidateQueries({queryKey:['dutySupervisorAssignments']});
      await qc.invalidateQueries({queryKey:['myScheduleData']});
      if(editing||!repeatWeek)toast.success(editing?'Duty supervisor assignment updated.':`${requestedSupervisors.length} duty supervisor${requestedSupervisors.length===1?'':'s'} scheduled across ${requestedAreas.length} coverage area${requestedAreas.length===1?'':'s'}.`); reset(form.assignment_date);
    } catch(e){ toast.error(e?.response?.data?.error||e?.message||'Unable to save duty supervisor.'); } finally { setSaving(false); }
  };
  const copyWeek=async()=>{
   if(!canManage||saving)return;setSaving(true);
   try{
    const response=await base44.functions.invoke('manageDutySupervisorSchedule',{action:'copy_week',source_start:format(addDays(windowStart,-7),'yyyy-MM-dd'),target_start:format(windowStart,'yyyy-MM-dd'),supervisor_emails:form.supervisor_emails});
    if(response.data?.error)throw new Error(response.data.error);
    toast.success(response.data.created+' coverage blocks copied; '+response.data.skipped+' duplicates skipped.');
    await qc.invalidateQueries({queryKey:['dutySupervisorAssignments']});
   }catch(error){toast.error(error.response?.data?.error||error.message);}finally{setSaving(false);}
  };
  const remove=async group=>{ if(!canManage||!await confirmInApp(`Remove ${group.supervisor_name||personLabel(group.supervisor_email)} from this duty supervisor coverage block?`)) return; try { for (const row of (group.rows||[group])) { const response=await base44.functions.invoke('manageDutySupervisorSchedule',{action:'delete',id:row.id}); const payload=response?.data||response||{}; if(payload.error) throw new Error(payload.error); } await qc.invalidateQueries({queryKey:['dutySupervisorAssignments']}); await qc.invalidateQueries({queryKey:['myScheduleData']}); toast.success('Duty supervisor coverage block removed.'); } catch(error){ toast.error(error?.message||'Unable to remove duty supervisor coverage.'); } };
  const printSchedule=()=>openBlackPointReport({ title:'Duty Supervisor Schedule', subtitle:'BlackPoint Command Coverage', status:'Published', meta:[{label:'Coverage Period',value:`${format(windowStart,'MMM d')} – ${format(addDays(windowStart,6),'MMM d, yyyy')}`},{label:'Coverage Blocks',value:String(groupedVisible.length)}], sections:dates.map(date=>({title:format(new Date(`${date}T12:00:00`),'EEEE, MMMM d, yyyy'),fields:groupedVisible.filter(group=>group.assignment_date===date).map(group=>({label:`${group.start_time}–${group.end_time}`,value:`${group.supervisor_name||personLabel(group.supervisor_email)}\n${group.locations.map(location=>location==='ALL'?'All Sites':location).join(' • ')}${group.notes?`\n${group.notes}`:''}`,wide:true}))})).filter(section=>section.fields.length), officer:{name:user?.full_name||user?.email||'Command Staff'}, footerNote:'Official BlackPoint duty supervisor command coverage schedule.' });

  if (userLoading) return <div className="min-h-screen bg-[#080d16] p-8 text-center text-slate-300">Checking administrator access…</div>;
  if (!canManage) return <div className="min-h-screen bg-[#080d16] p-8 text-white"><div className="mx-auto max-w-xl rounded-2xl border border-red-700/50 bg-red-950/20 p-6 text-center"><h1 className="text-xl font-black">Administrator access required</h1><p className="mt-2 text-sm text-slate-400">Only administrators can view or manage the Duty Supervisor Schedule.</p></div></div>;

  return <div className={editorOnly?"min-w-0 text-white":"bps-command-page min-h-full bg-[#080d16] p-4 text-white md:p-6"}>
    <div className="mx-auto max-w-[1700px] space-y-5">
      {!editorOnly&&<section className={embedded?"rounded-xl border border-slate-700 bg-slate-900 p-3":"bps-command-hero rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-7"}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.26em] text-cyan-300">Scheduling Command</div><h1 className="mt-2 text-3xl font-black md:text-4xl">Duty Supervisor Schedule</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Schedule command coverage by date, time, and site. Officers see the assigned duty supervisor directly on their published schedule.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setDayOffset(v=>v-7)}><ChevronLeft className="h-4 w-4"/></Button><Button variant="outline" onClick={()=>setDayOffset(0)}>TODAY</Button><Button variant="outline" onClick={()=>setDayOffset(v=>v+7)}><ChevronRight className="h-4 w-4"/></Button><Button onClick={printSchedule} className="bg-cyan-700 hover:bg-cyan-600"><Printer className="mr-2 h-4 w-4"/>PRINT</Button></div></div>
      </section>}
      {error&&<div className="rounded-2xl border border-red-700/60 bg-red-950/25 p-4 text-sm text-red-200">Duty supervisor schedule could not load: {error.message}</div>}
      <div className={editorOnly?"mx-auto w-full max-w-3xl":"grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]"}>
        <section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10"><ShieldCheck className="h-5 w-5 text-cyan-300"/></div><div><div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Coverage Assignment</div><div className="text-sm text-slate-500">{editing?'Editing existing coverage':'Create duty coverage'}</div></div></div>
          <div className="mt-5 space-y-4"><label className="flex gap-2 text-sm text-cyan-200"><input type="checkbox" checked={repeatWeek} disabled={!!editing} onChange={event=>setRepeatWeek(event.target.checked)}/>Fill seven days from this date</label><Button type="button" variant="outline" disabled={saving} onClick={copyWeek}>Copy previous week into displayed week</Button><p className="text-xs text-slate-400">Copy selected supervisors, or all when none are selected. Existing blocks are kept; leave and overlaps are checked.</p><div><Label>Date</Label><Input type="date" value={form.assignment_date} onChange={e=>setForm({...form,assignment_date:e.target.value})}/></div><div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></div><div><Label>End</Label><Input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></div></div><div><Label>Duty Supervisors</Label><p className="mb-2 mt-1 text-[11px] leading-4 text-slate-500">Select one or more supervisors. Multiple duty supervisors may cover the same property and time block.</p><div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-[#09111d] p-2">{supervisors.map(person=>{const email=person.email;const active=form.supervisor_emails.includes(email);return <button type="button" key={person.id||email} onClick={()=>toggleSupervisor(email)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-bold ${active?'border-emerald-500/50 bg-emerald-500/10 text-emerald-100':'border-slate-700 text-slate-300 hover:border-slate-500'}`}><span>{[person.rank,person.last_name||person.first_name].filter(Boolean).join(' ')}</span>{active&&<Check className="h-4 w-4"/>}</button>})}</div><div className="mt-2 text-[10px] font-bold text-emerald-300">SELECTED: {form.supervisor_emails.length} SUPERVISOR{form.supervisor_emails.length===1?'':'S'}</div></div><div><Label>Coverage Areas</Label><p className="mb-2 mt-1 text-[11px] leading-4 text-slate-500">Choose one or more areas. The same duty supervisor can cover multiple sites during the same time block.</p><div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-[#09111d] p-2"><button type="button" onClick={()=>toggleCoverageArea('ALL')} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-bold ${form.locations.includes('ALL')?'border-cyan-500/50 bg-cyan-500/10 text-cyan-100':'border-slate-700 text-slate-300'}`}><span>All Sites / Company Duty</span>{form.locations.includes('ALL')&&<Check className="h-4 w-4"/>}</button>{locations.map(location=>{const active=form.locations.includes(location.site_name);return <button type="button" key={location.id} onClick={()=>toggleCoverageArea(location.site_name)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-bold ${active?'border-cyan-500/50 bg-cyan-500/10 text-cyan-100':'border-slate-700 text-slate-300 hover:border-slate-500'}`}><span>{location.site_name}</span>{active&&<Check className="h-4 w-4"/>}</button>})}</div><div className="mt-2 text-[10px] font-bold text-cyan-300">SELECTED: {form.locations.join(' • ')}</div></div><div><Label>Notes</Label><Input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional duty notes"/></div>{canManage&&<div className="flex gap-2"><Button className="flex-1 bg-cyan-700 hover:bg-cyan-600" onClick={save} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4"/>{saving?'SAVING…':editing?'UPDATE COVERAGE':'SCHEDULE SUPERVISOR'}</Button>{editing&&<Button variant="outline" onClick={()=>reset(form.assignment_date)}>CANCEL</Button>}</div>}</div>
        </section>
        {!editorOnly&&<section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">7-Day Command Coverage</div><h2 className="mt-1 text-2xl font-black">{format(windowStart,'MMM d')} – {format(addDays(windowStart,6),'MMM d, yyyy')}</h2></div><Badge variant="outline">{groupedVisible.length} COVERAGE BLOCKS</Badge></div><div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{dates.map(date=>{const day=groupedVisible.filter(row=>row.assignment_date===date);return <div key={date} className="overflow-hidden rounded-2xl border border-slate-700 bg-[#101826]"><div className="border-b border-slate-700 px-4 py-3"><div className="text-sm font-black">{format(new Date(`${date}T12:00:00`),'EEEE')}</div><div className="text-xs text-slate-500">{format(new Date(`${date}T12:00:00`),'MMM d')}</div></div><div className="space-y-2 p-3">{day.map(group=><div key={[group.assignment_date,group.start_time,group.end_time,group.supervisor_email].join('-')} className="rounded-xl border border-slate-700 bg-[#0a111d] p-3"><strong className="block text-sm">{group.supervisor_name||personLabel(group.supervisor_email)}</strong><span className="mt-1 block text-xs text-cyan-300">{group.start_time}–{group.end_time}</span><p className="mt-2 text-xs text-slate-400">{group.locations.map(location=>location==='ALL'?'All sites':location).join(' · ')}</p>{group.notes&&<p className="mt-2 text-xs text-slate-400">{group.notes}</p>}{canManage&&<div className="mt-3 flex gap-2 border-t border-slate-800 pt-2"><button type="button" onClick={()=>startEdit(group)} className="text-xs text-cyan-200">Edit</button><button type="button" onClick={()=>{startEdit(group);setEditing(null);setRepeatWeek(false);setForm(current=>({...current,assignment_date:format(addDays(new Date(group.assignment_date+'T12:00:00'),1),'yyyy-MM-dd')}));}} className="text-xs text-cyan-200">Copy</button><button type="button" onClick={()=>remove(group)} className="ml-auto text-xs text-red-300">Remove</button></div>}</div>)}{!day.length&&<button type="button" onClick={()=>{reset(date);setForm(current=>({...current,assignment_date:date}));}} className="w-full rounded-xl border border-dashed border-slate-700 px-3 py-8 text-center text-xs font-bold text-slate-600 hover:border-cyan-700 hover:text-cyan-400">NO DUTY COVERAGE</button>}</div></div>})}</div></section>}
      </div>
      {editorOnly&&<section className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4"><h3 className="font-bold">Existing duty coverage this week</h3><div className="mt-3 divide-y divide-slate-700">{groupedVisible.map(group=><div key={[group.assignment_date,group.start_time,group.supervisor_email].join('-')} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="text-sm">{group.supervisor_name||personLabel(group.supervisor_email)}</strong><p className="mt-1 text-xs text-slate-400">{group.assignment_date} · {group.start_time}–{group.end_time} · {group.locations.join(' · ')}</p></div><div className="flex gap-3 text-xs"><button type="button" onClick={()=>startEdit(group)} className="text-cyan-200">Edit</button><button type="button" onClick={()=>{startEdit(group);setEditing(null);setRepeatWeek(false);setForm(current=>({...current,assignment_date:format(addDays(new Date(group.assignment_date+'T12:00:00'),1),'yyyy-MM-dd')}));}} className="text-cyan-200">Copy</button><button type="button" onClick={()=>remove(group)} className="text-red-300">Remove</button></div></div>)}{!groupedVisible.length&&<p className="py-4 text-sm text-slate-400">No duty coverage has been assigned for this week.</p>}</div></section>}
    </div>
  </div>;
}
