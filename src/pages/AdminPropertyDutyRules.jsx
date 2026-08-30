import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { listDirectoryLocations } from '@/lib/appDirectory';

const defaultRule = {
  property_site: '', active: true, effective_date: '', daily_activity_report_required: true,
  incident_report_required_for_property_calls: true, qr_required: false, qr_frequency_minutes: 60,
  qr_window_minutes: 30, qr_scans_per_shift: 0, require_all_required_checkpoints: true,
  required_checkpoint_ids: [], notes: '',
};

export default function AdminPropertyDutyRules() {
  const qc = useQueryClient();
  const [showForm,setShowForm] = useState(false);
  const [editingRule,setEditingRule] = useState(null);
  const [ruleForm,setRuleForm] = useState(defaultRule);
  const {data:user} = useQuery({queryKey:['currentUser'],queryFn:()=>base44.auth.me()});
  const {data:rules=[]} = useQuery({queryKey:['jobDutyRules'],queryFn:()=>base44.entities.JobDutyRule.list('property_site',1000),initialData:[]});
  const {data:checkpoints=[]} = useQuery({queryKey:['qrCheckpoints'],queryFn:()=>base44.entities.QRCheckpoint.list('-created_date',1000),initialData:[]});
  const {data:locations=[]} = useQuery({queryKey:['activeLocations','dutyRules'],queryFn:async()=>{try{const direct=await base44.entities.Location.list('site_name',1000);if(Array.isArray(direct)&&direct.length)return direct.filter(x=>x.active!==false);}catch{} const rows=await listDirectoryLocations('site_name');return (rows||[]).filter(x=>x.active!==false);},initialData:[]});

  const saveRule = useMutation({mutationFn:async data=>{
    const validIds=new Set(checkpoints.filter(cp=>cp.property_site===data.property_site&&cp.is_active!==false).map(cp=>cp.id));
    const payload={...data,required_checkpoint_ids:(data.required_checkpoint_ids||[]).filter(id=>validIds.has(id)),updated_by:user?.email||''};
    return editingRule?base44.entities.JobDutyRule.update(editingRule.id,payload):base44.entities.JobDutyRule.create(payload);
  },onSuccess:()=>{qc.invalidateQueries({queryKey:['jobDutyRules']});setShowForm(false);setEditingRule(null);toast.success('Property duty rules updated.');},onError:e=>toast.error(e?.message||'Unable to save property duty rules.')});

  const openRule=site=>{const existing=rules.find(rule=>rule.property_site===site);setEditingRule(existing||null);setRuleForm({
    property_site:site,active:existing?.active!==false,effective_date:existing?.effective_date||'',daily_activity_report_required:existing?.daily_activity_report_required!==false,
    incident_report_required_for_property_calls:existing?.incident_report_required_for_property_calls!==false,qr_required:existing?existing.qr_required===true:checkpoints.some(cp=>cp.property_site===site&&cp.is_active!==false&&cp.is_required!==false),
    qr_frequency_minutes:Number(existing?.qr_frequency_minutes||60),qr_window_minutes:Number(existing?.qr_window_minutes||30),qr_scans_per_shift:Number(existing?.qr_scans_per_shift||0),
    require_all_required_checkpoints:existing?.require_all_required_checkpoints!==false,required_checkpoint_ids:(existing?.required_checkpoint_ids||[]).filter(id=>checkpoints.some(cp=>cp.id===id&&cp.property_site===site&&cp.is_active!==false)),notes:existing?.notes||''
  });setShowForm(true);};

  if(user?.role!=='admin') return <div className="p-8 text-center text-slate-500">Admin access required.</div>;
  const sites=(locations||[]).map(x=>x.site_name);
  return <div className="bps-command-page min-h-full bg-[#080d16] p-4 text-white md:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <section className="rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl"><div className="flex items-center gap-3"><Settings2 className="h-7 w-7 text-cyan-300"/><div><div className="text-[11px] font-black uppercase tracking-[.22em] text-cyan-300">Patrol Standards</div><h1 className="mt-1 text-3xl font-black">Property Duty Rules</h1><p className="mt-1 text-sm text-slate-400">Configure DAR, incident-report, and QR compliance requirements by property. These rules remain separate from QR checkpoint management.</p></div></div></section>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sites.map(site=>{const rule=rules.find(x=>x.property_site===site);const requiredCount=(rule?.required_checkpoint_ids||[]).length||checkpoints.filter(cp=>cp.property_site===site&&cp.is_required!==false&&cp.is_active!==false).length;return <button key={site} type="button" onClick={()=>openRule(site)} className="rounded-2xl border border-slate-700 bg-[#0d1420] p-4 text-left transition hover:border-cyan-500"><div className="flex items-start justify-between gap-2"><div className="font-black text-white">{site}</div><Badge className={rule?.effective_date?'bg-cyan-900 text-cyan-100':'bg-slate-800 text-slate-300'}>{rule?.effective_date?`Effective ${rule.effective_date}`:rule?'Configured':'Not Configured'}</Badge></div><div className="mt-3 space-y-1 text-xs text-slate-400"><div>DAR: {rule?.daily_activity_report_required===false?'Not required':'Required'}</div><div>Incident report for property calls: {rule?.incident_report_required_for_property_calls===false?'Not required':'Required'}</div><div>QR: {rule?.qr_required?`Required · ${requiredCount} checkpoint(s)`:'Not required'}</div></div></button>})}</div>
    <Dialog open={showForm} onOpenChange={setShowForm}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Property Duty Rules — {ruleForm.property_site}</DialogTitle></DialogHeader><div className="space-y-5">
      <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-3"><Label>Performance Effective Date</Label><Input type="date" value={ruleForm.effective_date} onChange={e=>setRuleForm(p=>({...p,effective_date:e.target.value}))} className="mt-2"/><p className="mt-2 text-xs text-amber-100/70">Nothing before this date is scored as a missed duty.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-3"><Label>DAR required every worked shift</Label><Switch checked={ruleForm.daily_activity_report_required} onCheckedChange={v=>setRuleForm(p=>({...p,daily_activity_report_required:v}))}/></div><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-3"><Label>Incident Report required for property calls</Label><Switch checked={ruleForm.incident_report_required_for_property_calls} onCheckedChange={v=>setRuleForm(p=>({...p,incident_report_required_for_property_calls:v}))}/></div><div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-3 sm:col-span-2"><Label>QR compliance required</Label><Switch checked={ruleForm.qr_required} onCheckedChange={v=>setRuleForm(p=>({...p,qr_required:v}))}/></div></div>
      {ruleForm.qr_required&&<div className="space-y-4 rounded-xl border border-cyan-900 bg-slate-900 p-4"><div className="grid gap-3 sm:grid-cols-3"><div><Label>Frequency (minutes)</Label><Input type="number" min="1" value={ruleForm.qr_frequency_minutes} onChange={e=>setRuleForm(p=>({...p,qr_frequency_minutes:Number(e.target.value||60)}))}/></div><div><Label>Scan window</Label><Input type="number" min="1" value={ruleForm.qr_window_minutes} onChange={e=>setRuleForm(p=>({...p,qr_window_minutes:Number(e.target.value||30)}))}/></div><div><Label>Minimum scans / shift</Label><Input type="number" min="0" value={ruleForm.qr_scans_per_shift} onChange={e=>setRuleForm(p=>({...p,qr_scans_per_shift:Number(e.target.value||0)}))}/></div></div><div><Label className="mb-2 block">Required checkpoints</Label><div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">{checkpoints.filter(cp=>cp.property_site===ruleForm.property_site&&cp.is_active!==false).map(cp=>{const checked=ruleForm.required_checkpoint_ids.includes(cp.id);return <label key={cp.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={checked} onChange={e=>setRuleForm(p=>({...p,required_checkpoint_ids:e.target.checked?[...p.required_checkpoint_ids,cp.id]:p.required_checkpoint_ids.filter(id=>id!==cp.id)}))}/><span><strong>{cp.checkpoint_name}</strong> — {cp.location_label}</span></label>})}</div></div></div>}
      <div><Label>Rule Notes</Label><Input value={ruleForm.notes} onChange={e=>setRuleForm(p=>({...p,notes:e.target.value}))}/></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button><Button onClick={()=>saveRule.mutate(ruleForm)} disabled={saveRule.isPending}>{saveRule.isPending?'Saving…':'Save Property Rules'}</Button></div>
    </div></DialogContent></Dialog>
  </div></div>;
}
