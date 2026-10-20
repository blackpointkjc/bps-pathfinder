import { useAuth } from '@/lib/AuthContext';
import { useState } from 'react';
import { addWeeks, startOfWeek, format } from 'date-fns';
import ScheduleBoard from '@/components/admin/ScheduleBoard';
import FleetVehicleAssignments from '@/pages/FleetVehicleAssignments';
import DutySupervisorScheduling from '@/pages/DutySupervisorScheduling';
import AdminPlannedShifts from '@/pages/AdminPlannedShifts';
import AdminShiftBids from '@/pages/AdminShiftBids';
import AdminPTOApproval from '@/pages/AdminPTOApproval';
import AdminSupportStaffClock from '@/pages/AdminSupportStaffClock';
import AdminSpecialRequests from '@/pages/AdminSpecialRequests';
import InlineSection from './InlineSection';
export default function SchedulingWorkspace(){
 const {user,isLoadingAuth}=useAuth();
 const allowed=user?.role==='admin'||(user?.additional_roles||[]).includes('full_access');
 const requested=new URLSearchParams(window.location.search).get('admin_schedule_tool');
 const [weekOffset,setWeekOffset]=useState(0);
 const weekStart=format(addWeeks(startOfWeek(new Date(),{weekStartsOn:0}),weekOffset),'yyyy-MM-dd');
 if(isLoadingAuth)return <p className="p-4 text-slate-400">Checking scheduling access…</p>;
 if(!allowed)return <p className="p-4 text-slate-300">Administrator scheduling access required.</p>;
 return <div className="admin-integrated-workspace space-y-4 p-3 text-white md:p-5">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Scheduling & Coverage</h1><p className="mt-1 text-sm text-slate-400">Build the week, cover shifts, and assign vehicles and command in one workspace.</p></div><span className="rounded-lg border border-cyan-800 px-3 py-2 text-xs text-cyan-200">Week of {weekStart}</span></header>
  <ScheduleBoard embedded onWeekChange={setWeekOffset}/>
  <div className="grid items-start gap-4 xl:grid-cols-2">
   <InlineSection id="scheduling-fleet" title="Vehicles for scheduled shifts" description="Officer defaults, automatic reservations and shift-specific changes." initialOpen={requested==='fleet'}><FleetVehicleAssignments embedded weekStart={weekStart}/></InlineSection>
   <InlineSection id="scheduling-duty" title="Duty supervisor coverage" description="Fill seven days, copy last week or edit individual coverage blocks." initialOpen={requested==='duty'}><DutySupervisorScheduling embedded weekStart={weekStart}/></InlineSection>
  </div>
  <InlineSection id="scheduling-planned" title="Staffing plans & recurring requirements" description="Define required posts and recurring shifts, then generate the roster." initialOpen={requested==='planned'}><AdminPlannedShifts embedded/></InlineSection>
  <InlineSection id="scheduling-bids" title="Open shifts & officer bids" description="Review applications and award uncovered shifts here." initialOpen={requested==='bids'}><AdminShiftBids embedded/></InlineSection>
  <InlineSection id="scheduling-leave" title="Time off & absence approvals" description="Review exact leave windows and update coverage." initialOpen={requested==='pto'}><AdminPTOApproval embedded/></InlineSection>
  <InlineSection id="scheduling-requests" title="Additional coverage requests" description="Client requests for temporary or extra staffing." initialOpen={requested==='requests'}><AdminSpecialRequests embedded/></InlineSection>
  <InlineSection id="scheduling-support" title="Support staff time" description="Record administrative and support duty time." initialOpen={requested==='supportclock'}><AdminSupportStaffClock embedded/></InlineSection>
 </div>;
}
