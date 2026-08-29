import { Briefcase, CalendarClock, Building2, Clock3, LayoutDashboard } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import HRManageCompanyEmployees from './HRManageCompanyEmployees';
import ManageTimeEntries from './ManageTimeEntries';
import AdminDivisions from './AdminDivisions';
import AdminPTOApproval from './AdminPTOApproval';
import AdminManualPTO from './AdminManualPTO';
import AdminPTOLossReport from './AdminPTOLossReport';
import AdminPerformanceReviews from './AdminPerformanceReviews';
import ManageClients from './ManageClients';
import AdminSupportStaffClock from './AdminSupportStaffClock';
import HROverview from './HROverview';

const SECTIONS = [
  { id: 'overview', label: 'Overview', description: 'HR command dashboard and priority actions', icon: LayoutDashboard },
  { id: 'employees', label: 'Employees', description: 'Employee records, time entries and divisions', icon: Briefcase },
  { id: 'leave', label: 'Leave & Performance', description: 'PTO and employee performance workflow', icon: CalendarClock },
  { id: 'clients', label: 'Client Assignments', description: 'Client accounts and assignments', icon: Building2 },
  { id: 'support', label: 'Support Clock In', description: 'Support staff clock-in workspace', icon: Clock3 },
];

const TOOLS = {
  overview: [{ id: 'overview', label: 'HR Overview', component: HROverview }],
  employees: [
    { id: 'employees', label: 'Company Employees', component: HRManageCompanyEmployees },
    { id: 'timeentries', label: 'Time Entries', component: ManageTimeEntries },
    { id: 'divisions', label: 'Divisions', component: AdminDivisions },
  ],
  leave: [
    { id: 'pto', label: 'PTO Approval & History', component: AdminPTOApproval },
    { id: 'manualpto', label: 'Manual PTO', component: AdminManualPTO },
    { id: 'ptoloss', label: 'PTO Loss Report', component: AdminPTOLossReport },
    { id: 'reviews', label: 'Performance Reviews', component: AdminPerformanceReviews },
  ],
  clients: [{ id: 'clients', label: 'Client Accounts & Assignments', component: ManageClients }],
  support: [{ id: 'supportclock', label: 'Support Staff Clock', component: AdminSupportStaffClock }],
};

export default function HRCenter({ embedded = false }) {
  return (
    <UnifiedCenter eyebrow="Human Resources" title="HR Center" description="One desktop workspace for employees, time records, leave, performance, client assignments, and support clock-in." sections={SECTIONS} defaultSection="overview" queryParam={embedded ? 'hr_section' : 'section'} embedded={embedded}>
      {section => <CenterToolSection key={section} tools={TOOLS[section]} queryParam={embedded ? 'hr_tool' : 'tool'} />}
    </UnifiedCenter>
  );
}
