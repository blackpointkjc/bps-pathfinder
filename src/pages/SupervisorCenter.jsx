import SupervisorScheduleWorkspace from '@/components/SupervisorScheduleWorkspace';
import { useAuth } from '@/lib/AuthContext';
import { useEffect } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import { ClipboardCheck, Shield, ShieldCheck, LayoutDashboard } from 'lucide-react';
import React from 'react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import OfficerCenter from './OfficerCenter';
import SupervisorFieldOversight from './SupervisorFieldOversight';
import SupervisorTasks from './SupervisorTasks';
import ParkingRecords from './ParkingRecords';
import SupervisorCallOuts from './SupervisorCallOuts';
import SupervisorDailyCode from './SupervisorDailyCode';
import SupervisorInspections from './SupervisorInspections';
import SupervisorPerformanceReview from './SupervisorPerformanceReview';
import SupervisorWriteUps from './SupervisorWriteUps';
import SupervisorUseOfForce from './SupervisorUseOfForce';
import SupervisorComplaints from './SupervisorComplaints';
import SupervisorChat from './SupervisorChat';
import RankStructure from './RankStructure';
import SupervisorShiftHandover from './SupervisorShiftHandover';
import SupervisorOverview from './SupervisorOverview';
import CADCenter from './CADCenter';
import SupervisorCommandBoard from './SupervisorCommandBoard';
import { Radio } from 'lucide-react';

const SECTIONS = [
  { id: 'overview', label: 'Overview & Alerts', description: 'Priority alerts, work queue and supervisor command status', icon: LayoutDashboard },
  { id: 'officer', label: 'My Officer Workspace', description: 'Your own shift, field tools, reports, schedule, profile and training', icon: Shield },
  { id: 'calendar', label: 'Duty Supervisor Coverage', description: 'Company duty supervisors and coverage areas', icon: Shield },
  { id: 'cad', label: 'My Platoon CAD', description: 'Assigned platoon calls, units and officer welfare', icon: Radio },
  { id: 'command', label: 'Live Command & Handoff', description: 'Field oversight, welfare, action items, communication and duty handoff', icon: ShieldCheck },
  { id: 'oversight', label: 'Personnel Oversight', description: 'Inspections, performance reviews, write-ups, force and complaints', icon: ClipboardCheck },
];

const COMMAND_TOOLS = [
  {id:'callouts',label:'Officer Call-Outs',component:SupervisorCallOuts},
  { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
  { id: 'parking', label: 'Parking Review Tasks', component: () => <ParkingRecords mode="supervisor"/> },
  { id: 'field', label: 'Live Field Oversight', component: SupervisorFieldOversight },
  { id: 'handover', label: 'Duty Supervisor Handoff', component: SupervisorShiftHandover },
  { id: 'chat', label: 'Supervisor Chat', component: SupervisorChat },
  { id: 'code', label: 'Daily Code', component: SupervisorDailyCode },
  { id: 'rank', label: 'Rank Structure', component: RankStructure },
];

const OVERSIGHT_TOOLS = [
  { id: 'inspections', label: 'Officer Inspections', component: SupervisorInspections },
  { id: 'reviews', label: 'Performance Reviews', component: SupervisorPerformanceReview },
  { id: 'writeups', label: 'Write-Ups', component: SupervisorWriteUps },
  { id: 'force', label: 'Use of Force', component: SupervisorUseOfForce },
  { id: 'complaints', label: 'Complaints', component: SupervisorComplaints },
];

class SupervisorSectionBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[SupervisorCenter] Section crashed:', this.props.section, error, info); }
  componentDidUpdate(previous) { if (previous.section !== this.props.section && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return <div role="alert" className="m-4 rounded-xl border border-red-500/50 bg-red-950/30 p-5 text-white">
      <h2 className="text-lg font-bold">This supervisor module could not load</h2>
      <p className="mt-2 text-sm text-red-200">{this.state.error?.message || 'Unexpected error'}</p>
      <p className="mt-2 text-xs text-slate-400">Other Supervisor Center sections remain available. Select another section or retry.</p>
      <button type="button" onClick={() => this.setState({error:null})} className="mt-4 rounded-lg border border-cyan-500 px-3 py-2 text-sm font-bold">Retry Module</button>
    </div>;
    return this.props.children;
  }
}

function SupervisorSectionContent({ section, embedded }) {
  if (section === 'overview') return <SupervisorOverview />;
  if (section === 'officer') return <OfficerCenter embedded />;
  if (section === 'cad') return <SupervisorCommandBoard />;
  if (section === 'calendar') return <SupervisorScheduleWorkspace/>;
  if (section === 'command') return <CenterToolSection tools={COMMAND_TOOLS} queryParam={embedded ? 'supervisor_tool' : 'tool'} />;
  return <CenterToolSection tools={OVERSIGHT_TOOLS} queryParam={embedded ? 'supervisor_tool' : 'tool'} />;
}

export default function SupervisorCenter({ embedded = false }) {
  const {user}=useAuth();
  const location=useLocation(),navigate=useNavigate();
  useEffect(()=>{
   const params=new URLSearchParams(location.search),key=embedded?'supervisor_section':'section';
   const previous=params.get(key);
   if(['myschedule','dutytimeline','dutyschedule'].includes(previous)){params.set(key,'calendar');params.set('duty_view',previous==='myschedule'?'personal':'coverage');}
   else if(previous==='callouts'){params.set(key,'command');params.set(embedded?'supervisor_tool':'tool','callouts');}
   else return;
   navigate({pathname:location.pathname,search:'?'+params.toString()},{replace:true});
  },[embedded,location.pathname,location.search,navigate]);

  const roles=new Set([user?.role,...(user?.additional_roles||[])].map(value=>String(value||'').trim().toLowerCase()));
  const allAccess=roles.has('admin')||roles.has('full_access');
  const platoon=user?.oversight_platoon||user?.platoon;
  const platoonReady=['A','B'].includes(String(platoon||'').toUpperCase());
  const assignedArea=[user?.division&&`Region ${user.division}`,user?.subdivision&&`Division ${user.subdivision}`,user?.substation&&`Substation ${user.substation}`].filter(Boolean).join(' · ');
  const scopeLabel=allAccess?'Company-wide administrator':`Platoon ${platoon||'not assigned'} · ${assignedArea||'Organization not assigned'}`;
  const scopeMissing=!allAccess&&(!platoonReady||!user?.division||!user?.subdivision||(!['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','lt','lt col'].includes(String(user?.rank||'').toLowerCase())&&!user?.substation));
  return <UnifiedCenter
    eyebrow="Field Leadership"
    title="Supervisor Center"
    description="Lower-rank personnel oversight within your assigned platoon and operating area."
    sections={SECTIONS}
    defaultSection="overview"
    queryParam={embedded ? 'supervisor_section' : 'section'}
    embedded={embedded}
    headerAction={<span className="hidden max-w-[360px] truncate text-[10px] font-semibold text-cyan-200 lg:inline" title={scopeLabel}>{scopeLabel}</span>}
  >
    {section => <SupervisorSectionBoundary key={section} section={section}>
      <div className={`mx-3 mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${scopeMissing?'border-amber-600/50 bg-amber-950/20 text-amber-200':'border-cyan-800/50 bg-cyan-950/15 text-cyan-200'}`} role="status">
        {scopeLabel}{scopeMissing?' · Complete your platoon and organization assignments in Manage Officers to enable supervisor personnel access.':''}
      </div>
      <SupervisorSectionContent section={section} embedded={embedded} />
    </SupervisorSectionBoundary>}
  </UnifiedCenter>;
}
