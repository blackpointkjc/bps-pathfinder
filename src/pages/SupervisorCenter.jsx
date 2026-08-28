import { ClipboardCheck, ClipboardList, MessageCircle } from 'lucide-react';
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
import CommandDashboard from './CommandDashboard';
import DispatchCenter from './DispatchCenter';
import Navigation from './Navigation';
import ShiftHandover from './ShiftHandover';
import RecordsAssistant from './RecordsAssistant';
import DispatcherShiftReports from './DispatcherShiftReports';

const SECTIONS = [
  { id: 'command', label: 'Command', description: 'Live command, dispatch, map, handoff, records intelligence and shift log', icon: ClipboardList },
  { id: 'today', label: 'Today', description: 'Action items, daily code and call-outs', icon: ClipboardList },
  { id: 'oversight', label: 'Officer Oversight', description: 'Inspections, reviews, write-ups, force and complaints', icon: ClipboardCheck },
  { id: 'people', label: 'People & Communication', description: 'Supervisor chat and chain of command', icon: MessageCircle },
];

const TOOLS = {
  command: [
    { id: 'dashboard', label: 'Command Dashboard', component: CommandDashboard },
    { id: 'dispatch', label: 'Dispatch Center', component: DispatchCenter },
    { id: 'map', label: 'Live Map', component: Navigation },
    { id: 'handover', label: 'Shift Handoff', component: ShiftHandover },
    { id: 'records', label: 'Records Intelligence', component: RecordsAssistant },
    { id: 'shiftlog', label: 'Dispatcher Shift Log', component: DispatcherShiftReports },
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

export default function SupervisorCenter() {
  const desktop = useDesktopViewport();
  if (!desktop) return <SupervisorTasks />;
  return (
    <UnifiedCenter eyebrow="Field Leadership" title="Supervisor Center" description="One command workspace for live CAD supervision, officer welfare/escalation, handoff, connected records, documentation, and supervisory work." sections={SECTIONS} defaultSection="command">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
