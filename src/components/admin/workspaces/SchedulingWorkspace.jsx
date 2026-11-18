import { useAuth } from '@/lib/AuthContext';
import { useState } from 'react';
import { addWeeks, startOfWeek, format } from 'date-fns';
import ScheduleBoard from '@/components/admin/ScheduleBoard';
import FleetVehicleAssignments from '@/pages/FleetVehicleAssignments';
import DutySupervisorScheduling from '@/pages/DutySupervisorScheduling';
import AdminPlannedShifts from '@/pages/AdminPlannedShifts';
import AdminShiftBids from '@/pages/AdminShiftBids';
import AdminPTOApproval from '@/pages/AdminPTOApproval';
import AdminSpecialRequests from '@/pages/AdminSpecialRequests';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
const ACTIONS={
 fleet:{title:'Assign a vehicle',description:'Reserve a car for an officer, date and time.',component:FleetVehicleAssignments},
 duty:{title:'Assign duty supervisor',description:'Assign command coverage, fill seven days or copy coverage.',component:DutySupervisorScheduling},
 planned:{title:'Staffing plans',description:'Recurring post requirements and planned shifts.',component:AdminPlannedShifts},
 bids:{title:'Open shifts & bids',description:'Award uncovered shifts to eligible officers.',component:AdminShiftBids},
 pto:{title:'Time-off approvals',description:'Review leave and coverage.',component:AdminPTOApproval},
 requests:{title:'Additional coverage requests',description:'Review client requests for staffing.',component:AdminSpecialRequests},
};
export default function SchedulingWorkspace(){
 const {user,isLoadingAuth}=useAuth();
 const allowed=user?.role==='admin'||(user?.additional_roles||[]).includes('full_access');
 const requested=new URLSearchParams(window.location.search).get('admin_schedule_tool');
 const [action,setAction]=useState(ACTIONS[requested]?requested:null);
 const [weekOffset,setWeekOffset]=useState(0);
 const weekStart=format(addWeeks(startOfWeek(new Date(),{weekStartsOn:0}),weekOffset),'yyyy-MM-dd');
 if(isLoadingAuth)return <p className="p-4 text-slate-400">Checking scheduling access…</p>;
 if(!allowed)return <p className="p-4 text-slate-300">Administrator scheduling access required.</p>;
 const tool=ACTIONS[action],Component=tool?.component;
 return <div className="admin-integrated-workspace min-w-0 space-y-3 p-3 text-white md:p-4">
  <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">Scheduling & Coverage</h1><p className="mt-1 text-xs text-slate-400">Manage shifts, vehicles and duty coverage from this schedule.</p></div><span className="text-xs text-cyan-200">Week of {weekStart}</span></header>
  <ScheduleBoard embedded onWeekChange={setWeekOffset} onSchedulingAction={setAction}/>
  <Dialog open={!!tool} onOpenChange={open=>{if(!open)setAction(null);}}>
   <DialogContent className="w-[calc(100vw-1rem)] max-w-[1500px] border-slate-700 bg-[#08111e] p-3 text-white sm:p-5">
    <DialogHeader className="pr-12"><DialogTitle>{tool?.title}</DialogTitle><DialogDescription className="text-slate-400">{tool?.description}</DialogDescription></DialogHeader>
    {Component&&<Component embedded editorOnly weekStart={weekStart}/>}
   </DialogContent>
  </Dialog>
 </div>;
}
