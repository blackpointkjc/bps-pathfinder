import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, CheckCircle, MapPin, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

const blank = { location:"", shift_date:format(new Date(),'yyyy-MM-dd'), shift_start:"", shift_end:"", key_updates:"", ongoing_issues:"", pending_tasks:"", equipment_status:"" };
const shiftTime = s => new Date(`${s.shift_date}T${s.start_time || '00:00'}`).getTime();

export default function ShiftHandover(){
  const [showForm,setShowForm]=useState(false); const [form,setForm]=useState(blank); const qc=useQueryClient();
  const {data:user}=useQuery({queryKey:['currentUser'],queryFn:()=>base44.auth.me()});
  const {data:schedules=[]}=useQuery({queryKey:['handoverSchedules'],queryFn:()=>base44.entities.Schedule.list('shift_date',1000)});
  const {data:locations=[]}=useQuery({queryKey:['handoverLocations'],queryFn:()=>listDirectoryLocations('site_name')});
  const {data:users=[]}=useQuery({queryKey:['handoverUsers'],queryFn:()=>listDirectoryUsers()});
  const {data:handovers=[]}=useQuery({queryKey:['shiftHandovers'],queryFn:()=>base44.entities.ShiftHandover.list('-created_date',100),refetchInterval:10000});
  const mySites=useMemo(()=>{
    const assigned=[
      ...(user?.assigned_sites||[]),
      ...(user?.assigned_locations||[]),
      user?.assigned_location,
      ...schedules.filter(s=>s.officer_email===user?.email).map(s=>s.location||s.site_name),
    ].filter(Boolean);
    const activeLocations=locations.filter(l=>l.active!==false).map(l=>l.site_name).filter(Boolean);
    return [...new Set(assigned.length ? assigned : activeLocations)].sort();
  },[schedules,locations,user?.email,user?.assigned_location,JSON.stringify(user?.assigned_sites||[]),JSON.stringify(user?.assigned_locations||[])]);
  const visible=useMemo(()=>handovers.filter(h=>h.departing_officer_email===user?.email||h.incoming_officer_email===user?.email||mySites.includes(h.location)),[handovers,user?.email,mySites]);
  const incoming=useMemo(()=>{
    if(!form.location||!form.shift_date) return null;
    const end=new Date(`${form.shift_date}T${form.shift_end||'23:59'}`).getTime();
    const next=schedules.filter(s=>s.location===form.location&&s.officer_email&&s.officer_email!=='OPEN'&&s.officer_email!==user?.email&&shiftTime(s)>=end).sort((a,b)=>shiftTime(a)-shiftTime(b))[0];
    if(!next) return null; const person=users.find(u=>u.email===next.officer_email);
    return {...next,name:person?`${person.rank||'Officer'} ${person.last_name||person.first_name}`:next.officer_email};
  },[form,schedules,users,user?.email]);
  const create=useMutation({mutationFn:()=>base44.entities.ShiftHandover.create({...form,departing_officer_email:user.email,departing_officer_name:`${user.rank||'Officer'} ${user.last_name||user.first_name}`,incoming_officer_email:incoming?.officer_email||'',incoming_officer_name:incoming?.name||'Next assigned officer',acknowledged_by_incoming:false}),onSuccess:()=>{qc.invalidateQueries({queryKey:['shiftHandovers']});setForm(blank);setShowForm(false);toast.success('Shift handover sent');},onError:e=>toast.error(e.message)});
  const acknowledge=useMutation({mutationFn:id=>base44.entities.ShiftHandover.update(id,{acknowledged_by_incoming:true,acknowledgement_time:new Date().toISOString()}),onSuccess:()=>qc.invalidateQueries({queryKey:['shiftHandovers']})});
  return <div className="min-h-screen bg-[#07111d] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-3xl font-bold"><ArrowRightLeft className="h-7 w-7 text-blue-400"/>Shift Handover</h1><p className="text-slate-300">Pass site information to the next scheduled officer</p></div><Button className="bg-blue-600 text-white hover:bg-blue-500" onClick={()=>setShowForm(!showForm)}><Plus className="mr-2 h-4 w-4"/>New Handover</Button></div>
    {showForm&&<Card className="border-slate-700 bg-slate-900 text-slate-100"><CardHeader><CardTitle>Create Handover</CardTitle></CardHeader><CardContent><form onSubmit={e=>{e.preventDefault();create.mutate()}} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2"><div><Label>Site</Label><Select value={form.location || undefined} onValueChange={value=>setForm({...form,location:value})} required><SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent>{mySites.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div><div><Label>Date</Label><Input required type="date" value={form.shift_date} onChange={e=>setForm({...form,shift_date:e.target.value})}/></div></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Label>Your Shift Start</Label><Input type="time" value={form.shift_start} onChange={e=>setForm({...form,shift_start:e.target.value})}/></div><div><Label>Your Shift End</Label><Input required type="time" value={form.shift_end} onChange={e=>setForm({...form,shift_end:e.target.value})}/></div></div>
      <div className="rounded-lg border border-blue-700/50 bg-blue-950/20 p-3 text-sm"><strong>Passing to:</strong> {incoming?`${incoming.name} — ${incoming.shift_date} ${incoming.start_time}`:'No later scheduled officer found for this site yet. The handover will remain visible to officers assigned to the site.'}</div>
      <div><Label>Key Updates</Label><Textarea required rows={4} value={form.key_updates} onChange={e=>setForm({...form,key_updates:e.target.value})}/></div>
      <div><Label>Ongoing Issues</Label><Textarea rows={3} value={form.ongoing_issues} onChange={e=>setForm({...form,ongoing_issues:e.target.value})}/></div>
      <div><Label>Pending Tasks</Label><Textarea rows={3} value={form.pending_tasks} onChange={e=>setForm({...form,pending_tasks:e.target.value})}/></div>
      <div><Label>Equipment / Keys / Vehicle Status</Label><Textarea rows={2} value={form.equipment_status} onChange={e=>setForm({...form,equipment_status:e.target.value})}/></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Send Handover</Button></div>
    </form></CardContent></Card>}
    <div className="space-y-3">{visible.length===0?<Card className="border-slate-700 bg-slate-900 text-slate-100"><CardContent className="p-8 text-center text-slate-300">No handovers for your assigned sites.</CardContent></Card>:visible.map(h=><Card key={h.id} className={`bg-slate-900 text-slate-100 ${h.incoming_officer_email===user?.email&&!h.acknowledged_by_incoming?'border-amber-600':'border-slate-700'}`}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4"/>{h.location}</CardTitle><p className="mt-1 text-sm text-slate-400">{h.departing_officer_name} → {h.incoming_officer_name||'Next assigned officer'} • {h.shift_date}</p></div>{h.acknowledged_by_incoming?<Badge className="bg-emerald-700">Acknowledged</Badge>:h.incoming_officer_email===user?.email?<Button size="sm" onClick={()=>acknowledge.mutate(h.id)}><CheckCircle className="mr-2 h-4 w-4"/>Acknowledge</Button>:<Badge variant="outline" className="border-slate-500 text-slate-200">Pending</Badge>}</div></CardHeader><CardContent className="space-y-3 text-sm"><div><strong>Key updates:</strong><p className="text-slate-300">{h.key_updates}</p></div>{h.ongoing_issues&&<div><strong>Ongoing issues:</strong><p className="text-slate-300">{h.ongoing_issues}</p></div>}{h.pending_tasks&&<div><strong>Pending tasks:</strong><p className="text-slate-300">{h.pending_tasks}</p></div>}{h.equipment_status&&<div><strong>Equipment status:</strong><p className="text-slate-300">{h.equipment_status}</p></div>}</CardContent></Card>)}</div>
  </div></div>;
}