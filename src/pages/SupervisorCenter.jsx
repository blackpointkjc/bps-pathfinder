import { ClipboardCheck, Shield, ShieldCheck, LayoutDashboard } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import OfficerCenter from './OfficerCenter';
import SupervisorFieldOversight from './SupervisorFieldOversight';
import SupervisorTasks from './SupervisorTasks';
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
import DutySupervisorScheduling from './DutySupervisorScheduling';

const SECTIONS = [
  { id: 'overview', label: 'Overview & Alerts', description: 'Priority alerts, work queue and supervisor command status', icon: LayoutDashboard },
  { id: 'officer', label: 'My Officer Workspace', description: 'Your own shift, field tools, reports, schedule, profile and training', icon: Shield },
  { id: 'command', label: 'Live Command & Handoff', description: 'Field oversight, welfare, action items, communication and duty handoff', icon: ShieldCheck },
  { id: 'oversight', label: 'Personnel Oversight', description: 'Inspections, performance reviews, write-ups, force and complaints', icon: ClipboardCheck },
];

const COMMAND_TOOLS = [
  { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
  { id: 'field', label: 'Live Field Oversight', component: SupervisorFieldOversight },
  { id: 'handover', label: 'Duty Supervisor Handoff', component: SupervisorShiftHandover },
  { id: 'dutyschedule', label: 'Duty Supervisor Schedule', component: DutySupervisorScheduling },
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

export default function SupervisorCenter({ embedded = false }) {
  return (
    <UnifiedCenter
      eyebrow="Field Leadership"
      title="Supervisor Center"
      description="One supervisor workspace containing the complete Officer Center plus supervisor-only command, welfare, handoff, and oversight tools."
      sections={SECTIONS}
      defaultSection="overview"
      queryParam={embedded ? 'supervisor_section' : 'section'}
      embedded={embedded}
    >
      {section => {
        if (section === 'overview') return <SupervisorOverview />;
        if (section === 'officer') return <OfficerCenter embedded />;
        if (section === 'command') return <CenterToolSection tools={COMMAND_TOOLS} queryParam={embedded ? 'supervisor_tool' : 'tool'} />;
        return <CenterToolSection tools={OVERSIGHT_TOOLS} queryParam={embedded ? 'supervisor_tool' : 'tool'} />;
      }}
    </UnifiedCenter>
  );
}
