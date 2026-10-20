import { useState } from 'react';
import { startOfWeek, format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import Schedule from '@/pages/Schedule';
import SupervisorDutyTimeline from '@/pages/SupervisorDutyTimeline';
import DutySupervisorScheduling from '@/pages/DutySupervisorScheduling';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
export default function SupervisorScheduleWorkspace(){
 const {user}=useAuth();
 const [view,setView]=useState(()=>new URLSearchParams(window.location.search).get('duty_view')||'personal');
 const [editing,setEditing]=useState(false);
 return <div className="min-w-0 space-y-3 p-3 text-white">
  <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div><h2 className="text-lg font-bold">Schedule & Duty Coverage</h2><p className="mt-1 text-xs text-slate-400">Your shifts and company duty coverage share one workspace.</p></div><div className="flex flex-wrap gap-2">{[['personal','My shifts'],['coverage','Company duty coverage']].map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm aria-pressed:border-cyan-600 aria-pressed:bg-cyan-950">{label}</button>)}{hasSupervisorAccess(user)&&<button type="button" onClick={()=>setEditing(true)} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold">Assign duty supervisor</button>}</div></header>
  {view==='personal'?<Schedule/>:<SupervisorDutyTimeline/>}
  <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="w-[calc(100vw-1rem)] max-w-5xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Assign duty supervisor</DialogTitle></DialogHeader><DutySupervisorScheduling embedded editorOnly weekStart={format(startOfWeek(new Date(),{weekStartsOn:0}),'yyyy-MM-dd')}/></DialogContent></Dialog>
 </div>;
}
