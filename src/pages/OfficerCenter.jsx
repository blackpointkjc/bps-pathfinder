import { CalendarClock, ClipboardList, MessageCircle, Shield, UserRound, Wrench } from 'lucide-react';
import UnifiedCenter, { useDesktopViewport } from '@/components/UnifiedCenter';
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

const SECTIONS = [
  { id: 'today', label: 'Today', description: 'Dashboard, clock and schedule', icon: CalendarClock },
  { id: 'field', label: 'Field Tools', description: 'Dispatch queue, post orders, patrol, handover and enforcement forms', icon: Shield },
  { id: 'reports', label: 'Reports', description: 'Daily, incident and support reports', icon: ClipboardList },
  { id: 'schedule', label: 'Schedule & Availability', description: 'Availability, open shifts and payroll dates', icon: Wrench },
  { id: 'messages', label: 'Messages', description: 'Announcements and communication shortcuts', icon: MessageCircle },
  { id: 'profile', label: 'Profile & Training', description: 'Profile, performance, training and rank information', icon: UserRound },
];

const TOOLS = {
  today: [
    { id: 'dashboard', label: 'Dashboard', component: Dashboard },
    { id: 'clock', label: 'Time Clock', component: TimeClock },
    { id: 'myschedule', label: 'My Schedule', component: Schedule },
  ],
  field: [
    { id: 'dispatchqueue', label: 'Dispatch Queue', component: OfficerDispatchQueue },
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
  messages: [
    { id: 'announcements', label: 'Announcements', component: Announcements },
  ],
  profile: [
    { id: 'profile', label: 'My Profile', component: OfficerProfile },
    { id: 'performance', label: 'My Performance', component: MyPerformanceAnalytics },
    { id: 'reviews', label: 'My Reviews & Feedback', component: OfficerPerformanceReviews },
    { id: 'training', label: 'Training', component: OfficerTraining },
    { id: 'rank', label: 'Rank Structure', component: RankStructure },
    { id: 'duties', label: 'Rank Duties', component: RankDuties },
  ],
};

export default function OfficerCenter() {
  const desktop = useDesktopViewport();
  if (!desktop) return <Dashboard />;
  return (
    <UnifiedCenter
      eyebrow="Officer Operations"
      title="Officer Center"
      description="A cleaner desktop workspace for the officer's shift, field tools, reports, schedule, messages, profile, and training."
      sections={SECTIONS}
      defaultSection="today"
    >
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
