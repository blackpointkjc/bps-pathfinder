import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Plus, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { listDirectoryUsers } from '@/lib/appDirectory';

const blank = () => ({
  shift_date: format(new Date(), 'yyyy-MM-dd'), shift_start:'', shift_end:'', incoming_supervisor_email:'', area:'',
  command_summary:'', staffing_status:'', active_calls_summary:'', critical_incidents:'', bolo_safety_notes:'', unresolved_issues:'', pending_followups:'', equipment_fleet_status:'', client_site_concerns:''
});
const lower = value => String(value || '').trim().toLowerCase();
const supervisorRanks = new Set(['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel']);
const isSupervisor = user => {
  const roles = new Set((user?.additional_roles || []).map(lower));
  return user?.role === 'admin' || roles.has('supervisor') || roles.has('full_access') || supervisorRanks.has(lower(user?.rank));
};
const personLabel = user => [user?.rank, user?.last_name || user?.first_name].filter(Boolean).join(' ') || user?.full_name || user?.email || 'Supervisor';

export default function SupervisorShiftHandover() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const { data:user } = useQuery({ queryKey:['currentUser'], queryFn:()=>base44.auth.me() });
  const { data:users=[] } = useQuery({ queryKey:['supervisorHandoverUsers'], queryFn:()=>listDirectoryUsers('last_name') });
  const { data:handovers=[] } = useQuery({ queryKey:['supervisorShiftHandovers'], queryFn:()=>base44.entities.SupervisorShiftHandover.list('-created_date', 200), refetchInterval:60000 });
  const supervisors = useMemo(() => users.filter(person => isSupervisor(person) && !person.termination_date && lower(person.email) !== lower(user?.email)), [users, user?.email]);
  const incoming = supervisors.find(person => lower(person.email) === lower(form.incoming_supervisor_email));

  const create = useMutation({
    mutationFn:()=>base44.entities.SupervisorShiftHandover.create({
      ...form,
      departing_supervisor_email:user.email,
      departing_supervisor_name:personLabel(user),
      incoming_supervisor_name:incoming ? personLabel(incoming) : 'Incoming Duty Supervisor',
      acknowledged_by_incoming:false,
    }),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['supervisorShiftHandovers']}); setForm(blank()); setShowForm(false); toast.success('Duty supervisor handover sent.'); },
    onError:error=>toast.error(error?.message || 'Unable to send supervisor handover'),
  });
  const acknowledge = useMutation({
    mutationFn:id=>base44.entities.SupervisorShiftHandover.update(id,{ acknowledged_by_incoming:true, acknowledgement_time:new Date().toISOString() }),
    onSuccess:()=>qc.invalidateQueries({queryKey:['supervisorShiftHandovers']}),
  });

  if (user && !isSupervisor(user)) return <div className="p-8 text-center text-slate-400">Supervisor access required.</div>;

  return <div className="min-h-full bg-[#07111d] p-4 text-slate-100 md:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-col gap-3 rounded-2xl border border-cyan-900/60 bg-[#0b1725] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-cyan-300"/><h1 className="break-words text-xl font-black md:text-2xl">Duty Supervisor Shift Handover</h1></div><p className="mt-1 max-w-3xl break-words text-sm leading-5 text-slate-400">Company-wide command handoff between duty supervisors. Use this for staffing, active calls, serious incidents, safety issues, unresolved problems, fleet/equipment concerns, and follow-up items.</p></div>
      <Button className="shrink-0 bg-cyan-700 hover:bg-cyan-600" onClick={()=>setShowForm(value=>!value)}><Plus className="mr-2 h-4 w-4"/>New Supervisor Handover</Button>
    </div>

    {showForm && <Card className="border-slate-700 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="break-words">New Duty Supervisor Handover</CardTitle></CardHeader><CardContent><form className="space-y-4" onSubmit={e=>{e.preventDefault();create.mutate();}}>
      <div className="grid gap-4 md:grid-cols-4"><div><Label>Date</Label><Input type="date" required value={form.shift_date} onChange={e=>setForm({...form,shift_date:e.target.value})}/></div><div><Label>Shift Start</Label><Input type="time" value={form.shift_start} onChange={e=>setForm({...form,shift_start:e.target.value})}/></div><div><Label>Shift End</Label><Input type="time" value={form.shift_end} onChange={e=>setForm({...form,shift_end:e.target.value})}/></div><div><Label>Area / Division</Label><Input value={form.area} onChange={e=>setForm({...form,area:e.target.value})} placeholder="Richmond / All Operations"/></div></div>
      <div><Label>Incoming Duty Supervisor</Label><Select value={form.incoming_supervisor_email || undefined} onValueChange={value=>setForm({...form,incoming_supervisor_email:value})}><SelectTrigger><SelectValue placeholder="Select incoming supervisor"/></SelectTrigger><SelectContent>{supervisors.map(person=><SelectItem key={person.id || person.email} value={person.email}>{personLabel(person)}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Command Summary *</Label><Textarea required rows={4} value={form.command_summary} onChange={e=>setForm({...form,command_summary:e.target.value})} placeholder="Overall condition of the shift and anything the incoming duty supervisor needs immediately..."/></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Label>Staffing / Coverage</Label><Textarea rows={3} value={form.staffing_status} onChange={e=>setForm({...form,staffing_status:e.target.value})}/></div><div><Label>Active Calls / Assignments</Label><Textarea rows={3} value={form.active_calls_summary} onChange={e=>setForm({...form,active_calls_summary:e.target.value})}/></div><div><Label>Critical Incidents</Label><Textarea rows={3} value={form.critical_incidents} onChange={e=>setForm({...form,critical_incidents:e.target.value})}/></div><div><Label>BOLO / Officer Safety</Label><Textarea rows={3} value={form.bolo_safety_notes} onChange={e=>setForm({...form,bolo_safety_notes:e.target.value})}/></div><div><Label>Unresolved Issues</Label><Textarea rows={3} value={form.unresolved_issues} onChange={e=>setForm({...form,unresolved_issues:e.target.value})}/></div><div><Label>Pending Follow-Ups</Label><Textarea rows={3} value={form.pending_followups} onChange={e=>setForm({...form,pending_followups:e.target.value})}/></div><div><Label>Fleet / Equipment</Label><Textarea rows={3} value={form.equipment_fleet_status} onChange={e=>setForm({...form,equipment_fleet_status:e.target.value})}/></div><div><Label>Client / Site Concerns</Label><Textarea rows={3} value={form.client_site_concerns} onChange={e=>setForm({...form,client_site_concerns:e.target.value})}/></div></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending?'Sending…':'Send to Incoming Supervisor'}</Button></div>
    </form></CardContent></Card>}

    <div className="space-y-3">{handovers.length===0 ? <Card className="border-slate-700 bg-slate-900 text-slate-100"><CardContent className="p-8 text-center text-slate-400">No duty supervisor handovers have been submitted yet.</CardContent></Card> : handovers.map(h=><Card key={h.id} className={`overflow-hidden bg-slate-900 text-slate-100 ${lower(h.incoming_supervisor_email)===lower(user?.email)&&!h.acknowledged_by_incoming?'border-amber-500':'border-slate-700'}`}><CardHeader><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><CardTitle className="break-words text-lg">{h.area || 'Duty Supervisor Handover'} · {h.shift_date}</CardTitle><p className="mt-1 break-words text-xs text-slate-400">{h.departing_supervisor_name} → {h.incoming_supervisor_name || 'Incoming Duty Supervisor'} {h.shift_start||h.shift_end ? `· ${h.shift_start||'—'}–${h.shift_end||'—'}`:''}</p></div>{h.acknowledged_by_incoming?<Badge className="w-fit shrink-0 bg-emerald-700">Acknowledged</Badge>:lower(h.incoming_supervisor_email)===lower(user?.email)?<Button className="w-fit shrink-0" size="sm" onClick={()=>acknowledge.mutate(h.id)}><CheckCircle className="mr-2 h-4 w-4"/>Acknowledge</Button>:<Badge variant="outline" className="w-fit shrink-0 border-slate-500 text-slate-200">Pending</Badge>}</div></CardHeader><CardContent className="grid min-w-0 gap-3 md:grid-cols-2">{[
      ['Command Summary',h.command_summary],['Staffing / Coverage',h.staffing_status],['Active Calls / Assignments',h.active_calls_summary],['Critical Incidents',h.critical_incidents],['BOLO / Officer Safety',h.bolo_safety_notes],['Unresolved Issues',h.unresolved_issues],['Pending Follow-Ups',h.pending_followups],['Fleet / Equipment',h.equipment_fleet_status],['Client / Site Concerns',h.client_site_concerns]
    ].filter(([,value])=>value).map(([label,value])=><div key={label} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="break-words text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-200">{value}</div></div>)}</CardContent></Card>)}</div>
  </div></div>;
}
