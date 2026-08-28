import { CalendarClock, ClipboardCheck, ClipboardList, MessageCircle, Shield, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import Dashboard from './Dashboard';
import TimeClock from './TimeClock';
import Schedule from './Schedule';
import VirginiaFieldLawAssistant from './VirginiaFieldLawAssistant';
import PostOrders from './PostOrders';
import QRPatrolScan from './QRPatrolScan';
import ShiftHandover from './ShiftHandover';
import VATrespassNotices from './VATrespassNotices';
import VACriminalComplaints from './VACriminalComplaints';
import Summons from './Summons';
import DailyActivityReports from './DailyActivityReports';
import IncidentReports from './IncidentReports';
import MaintenanceReports from './MaintenanceReports';
import OpenDoorReports from './OpenDoorReports';
import ConfidentialReport from './ConfidentialReport';
import ExpenseReports from './ExpenseReports';
import TimeRequests from './TimeRequests';
import OfficerAvailability from './OfficerAvailability';
import OpenShifts from './OpenShifts';
import OfficerPayrollDates from './OfficerPayrollDates';
import Announcements from './Announcements';
import OfficerProfile from './OfficerProfile';
import MyPerformanceAnalytics from './MyPerformanceAnalytics';
import OfficerPerformanceReviews from './OfficerPerformanceReviews';
import OfficerTraining from './OfficerTraining';
import RankStructure from './RankStructure';
import RankDuties from './RankDuties';
import OfficerDispatchQueue from './OfficerDispatchQueue';
import SupervisorFieldOversight from './SupervisorFieldOversight';
import SupervisorTasks from './SupervisorTasks';
import SupervisorDailyCode from './SupervisorDailyCode';
import SupervisorInspections from './SupervisorInspections';
import SupervisorPerformanceReview from './SupervisorPerformanceReview';
import SupervisorWriteUps from './SupervisorWriteUps';
import SupervisorUseOfForce from './SupervisorUseOfForce';
import SupervisorComplaints from './SupervisorComplaints';
import SupervisorChat from './SupervisorChat';
import SupervisorShiftHandover from './SupervisorShiftHandover';

const SECTIONS = [
  { id: 'shift', label: 'My Shift', description: 'Dashboard, clock, schedule and dispatch queue', icon: CalendarClock },
  { id: 'field', label: 'Field Tools', description: 'The same field tools available to officers', icon: Shield },
  { id: 'reports', label: 'Reports', description: 'Daily, incident and support reports', icon: ClipboardList },
  { id: 'schedule', label: 'Schedule & Availability', description: 'Availability, requests, open shifts and payroll dates', icon: Wrench },
  { id: 'command', label: 'Supervisor Operations', description: 'Live field oversight, welfare, requests and handoff', icon: ShieldCheck },
  { id: 'oversight', label: 'Officer Oversight', description: 'Inspections, reviews, write-ups, force and complaints', icon: ClipboardCheck },
  { id: 'people', label: 'Communication & Profile', description: 'Supervisor communication and personal officer tools', icon: MessageCircle },
  { id: 'profile', label: 'Profile & Training', description: 'Profile, performance, training and rank information', icon: UserRound },
];

const TOOLS = {
  shift: [
    { id: 'dashboard', label: 'Dashboard', component: Dashboard },
    { id: 'clock', label: 'Time Clock', component: TimeClock },
    { id: 'myschedule', label: 'My Schedule', component: Schedule },
    { id: 'queue', label: 'My Dispatch Queue', component: OfficerDispatchQueue },
  ],
  field: [
    { id: 'postorders', label: 'Post Orders', component: PostOrders },
    { id: 'qr', label: 'QR Patrol', component: QRPatrolScan },
    { id: 'handover', label: 'Shift Handover', component: ShiftHandover },
    { id: 'law', label: 'Virginia Law', component: VirginiaFieldLawAssistant },
    { id: 'trespass', label: 'VA Trespass', component: VATrespassNotices },
    { id: 'complaint', label: 'VA Complaint', component: VACriminalComplaints },
    { id: 'summons', label: 'VA Summons', component: Summons },
  ],
  reports: [
    { id: 'dar', label: 'Daily Activity', component: DailyActivityReports },
    { id: 'incident', label: 'Incident Report', component: IncidentReports },
    { id: 'maintenance', label: 'Maintenance', component: MaintenanceReports },
    { id: 'opendoor', label: 'Open Door', component: OpenDoorReports },
    { id: 'confidential', label: 'Confidential', component: ConfidentialReport },
    { id: 'expense', label: 'Expense Report', component: ExpenseReports },
  ],
  schedule: [
    { id: 'availability', label: 'Availability', component: OfficerAvailability },
    { id: 'time', label: 'Time Request', component: TimeRequests },
    { id: 'openshifts', label: 'Open Shifts', component: OpenShifts },
    { id: 'payroll', label: 'Payroll Dates', component: OfficerPayrollDates },
  ],
  command: [
    { id: 'fieldoversight', label: 'Live Field Oversight', component: SupervisorFieldOversight },
    { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
    { id: 'code', label: 'Daily Code', component: SupervisorDailyCode },
    { id: 'supervisorhandover', label: 'Duty Supervisor Handoff', component: SupervisorShiftHandover },
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
    { id: 'announcements', label: 'Announcements', component: Announcements },
    { id: 'rank', label: 'Rank Structure', component: RankStructure },
  ],
  profile: [
    { id: 'profile', label: 'My Profile', component: OfficerProfile },
    { id: 'performance', label: 'My Performance', component: MyPerformanceAnalytics },
    { id: 'reviews', label: 'My Reviews & Feedback', component: OfficerPerformanceReviews },
    { id: 'training', label: 'Training', component: OfficerTraining },
    { id: 'duties', label: 'Rank Duties', component: RankDuties },
  ],
};

export default function SupervisorCenter() {
  return (
    <UnifiedCenter
      eyebrow="Field Leadership"
      title="Supervisor Center"
      description="One supervisor workspace: officer field tools, your own shift tools, live welfare and supervisor requests, plus supervisor-only oversight."
      sections={SECTIONS}
      defaultSection="command"
    >
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
