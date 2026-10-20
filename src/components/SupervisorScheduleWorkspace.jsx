import { useState } from 'react';
import { startOfWeek, format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import SupervisorDutyTimeline from '@/pages/SupervisorDutyTimeline';
import DutySupervisorScheduling from '@/pages/DutySupervisorScheduling';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
export default function SupervisorScheduleWorkspace(){
 const {user}=useAuth();
 const [editing,setEditing]=useState(false);
 return <div className="min-w-0 space-y-3 p-3 text-white">
  <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4"><div><h2 className="text-xl font-bold">Duty Supervisor Coverage</h2><p className="mt-1 text-sm text-slate-400">Company command coverage by date, supervisor and service area.</p></div>{hasSupervisorAccess(user)&&<button type="button" onClick={()=>setEditing(true)} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold">Assign duty supervisor</button>}</header>
  <SupervisorDutyTimeline/>
  <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="w-[calc(100vw-1rem)] max-w-5xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Assign duty supervisor</DialogTitle></DialogHeader><DutySupervisorScheduling embedded editorOnly weekStart={format(startOfWeek(new Date(),{weekStartsOn:0}),'yyyy-MM-dd')}/></DialogContent></Dialog>
 </div>;
}
