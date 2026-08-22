import { ClipboardCheck, ClipboardList, MessageCircle } from 'lucide-react';
import UnifiedCenter, { useDesktopViewport } from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import SupervisorTasks from './SupervisorTasks';
import SupervisorDailyCode from './SupervisorDailyCode';
import SupervisorCallOuts from './SupervisorCallOuts';
import SupervisorInspections from './SupervisorInspections';
import SupervisorPerformanceReview from './SupervisorPerformanceReview';
import SupervisorWriteUps from './SupervisorWriteUps';
import SupervisorUseOfForce from './SupervisorUseOfForce';
import SupervisorComplaints from './SupervisorComplaints';
import SupervisorChat from './SupervisorChat';
import RankStructure from './RankStructure';

const SECTIONS = [
  { id: 'today', label: 'Today', description: 'Action items, daily code and call-outs', icon: ClipboardList },
  { id: 'oversight', label: 'Officer Oversight', description: 'Inspections, reviews, write-ups, force and complaints', icon: ClipboardCheck },
  { id: 'people', label: 'People & Communication', description: 'Supervisor chat and chain of command', icon: MessageCircle },
];

const TOOLS = {
  today: [
    { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
    { id: 'code', label: 'Daily Code', component: SupervisorDailyCode },
    { id: 'callouts', label: 'Call-Outs', component: SupervisorCallOuts },
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
    <UnifiedCenter eyebrow="Field Leadership" title="Supervisor Center" description="One desktop workspace for today's supervisory work, officer oversight, documentation, and supervisor communication." sections={SECTIONS} defaultSection="today">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
