import { ClipboardCheck, ClipboardList, MessageCircle, ShieldCheck } from 'lucide-react';
import UnifiedCenter, { useDesktopViewport } from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import SupervisorTasks from './SupervisorTasks';
import SupervisorDailyCode from './SupervisorDailyCode';
import SupervisorInspections from './SupervisorInspections';
import SupervisorPerformanceReview from './SupervisorPerformanceReview';
import SupervisorWriteUps from './SupervisorWriteUps';
import SupervisorUseOfForce from './SupervisorUseOfForce';
import SupervisorComplaints from './SupervisorComplaints';
import SupervisorChat from './SupervisorChat';
import RankStructure from './RankStructure';
import ShiftHandover from './ShiftHandover';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '../utils';

const SECTIONS = [
  { id: 'command', label: 'Field Leadership', description: 'Supervisor-only field oversight and shift handoff', icon: ShieldCheck },
  { id: 'today', label: 'Today', description: 'Action items, daily code and call-outs', icon: ClipboardList },
  { id: 'oversight', label: 'Officer Oversight', description: 'Inspections, reviews, write-ups, force and complaints', icon: ClipboardCheck },
  { id: 'people', label: 'People & Communication', description: 'Supervisor chat and chain of command', icon: MessageCircle },
];

const TOOLS = {
  command: [
    { id: 'oversight', label: 'Officer Welfare & Field Oversight', component: SupervisorOversightLauncher },
    { id: 'handover', label: 'Shift Handoff', component: ShiftHandover },
  ],
  today: [
    { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
    { id: 'code', label: 'Daily Code', component: SupervisorDailyCode },
  ],
  oversight: [
    { id: 'inspections', label: 'Officer Inspections', component: SupervisorInspections },
    { id: 'reviews', label: 'Performance Reviews', component: SupervisorPerformanceReview },
    { id: 'writeups', label: 'Write-Ups', component: SupervisorWriteUps },
    { id: 'force', label: 'Use of Force', component: SupervisorUseOfForce },
    { id: 'complaints', label: 'Complaints', component: SupervisorComplaints },
  ],
  people: [
    { id: 'chat', label: 'Supervisor Chat', component: SupervisorChat },
    { id: 'rank', label: 'Rank Structure', component: RankStructure },
  ],
};

function SupervisorOversightLauncher() {
  return <div className="p-5 md:p-8"><div className="mx-auto max-w-4xl rounded-2xl border border-cyan-900/60 bg-[#0b1725] p-6 md:p-8"><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Supervisor Operations</div><h2 className="mt-2 text-2xl font-black text-white">Officer Welfare & Field Oversight</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Open the dedicated supervisor page to monitor active officer assignments, acknowledgement timing, welfare conditions, and GPS freshness. Dispatching, call status, unit assignment, maps, BOLOs, records intelligence, and dispatcher logs remain in CAD Center and are not duplicated here.</p><Button className="mt-5 bg-cyan-700 hover:bg-cyan-600" onClick={() => { window.location.href = createPageUrl('SupervisorFieldOversight'); }}><ShieldCheck className="mr-2 h-4 w-4" />Open Field Oversight</Button></div></div>;
}

export default function SupervisorCenter() {
  const desktop = useDesktopViewport();
  if (!desktop) return <SupervisorTasks />;
  return (
    <UnifiedCenter eyebrow="Field Leadership" title="Supervisor Center" description="Supervisor-specific leadership, officer oversight, handoff, documentation, and personnel work. CAD dispatch operations remain in CAD Center." sections={SECTIONS} defaultSection="command">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
