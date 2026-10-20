import { Briefcase, CalendarClock, Building2, Clock3, LayoutDashboard } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import HRManageCompanyEmployees from './HRManageCompanyEmployees';
import ManageTimeEntries from './ManageTimeEntries';
import AdminDivisions from './AdminDivisions';
import AdminManualPTO from './AdminManualPTO';
import AdminPTOLossReport from './AdminPTOLossReport';
import AdminPerformanceReviews from './AdminPerformanceReviews';
import AdminSupportStaffClock from './AdminSupportStaffClock';
import HROverview from './HROverview';

const SECTIONS = [
  { id: 'overview', label: 'Overview & Work Queue', description: 'HR alerts, approvals and workforce status', icon: LayoutDashboard },
  { id: 'employees', label: 'Workforce & Structure', description: 'Employee records and operating divisions', icon: Building2 },
  { id: 'support', label: 'Time & Attendance', description: 'Employee time records and support clock-in', icon: Clock3 },
  { id: 'leave', label: 'PTO & Leave', description: 'Employee PTO balances, adjustments and loss history', icon: CalendarClock },
  { id: 'clients', label: 'Performance Reviews', description: 'Annual and manual employee review workflow', icon: Briefcase },
];

const TOOLS = {
  overview: [{ id: 'overview', label: 'HR Overview', component: HROverview }],
  employees: [
    { id: 'employees', label: 'Company Employees', component: HRManageCompanyEmployees },
    { id: 'divisions', label: 'Divisions & Operating Areas', component: AdminDivisions },
  ],
  support: [
    { id: 'timeentries', label: 'Employee Time Entries', component: ManageTimeEntries },
    { id: 'supportclock', label: 'Support Staff Clock', component: AdminSupportStaffClock },
  ],
  leave: [
    { id: 'manualpto', label: 'Manual PTO', component: AdminManualPTO },
    { id: 'ptoloss', label: 'PTO Loss Report', component: AdminPTOLossReport },
  ],
  clients: [{ id: 'reviews', label: 'Performance Reviews', component: AdminPerformanceReviews }],
};

export default function HRCenter({ embedded = false }) {
  return (
    <UnifiedCenter eyebrow="Human Resources" title="HR Center" description="One desktop workspace for employees, time records, PTO balances, performance, and support clock-in." sections={SECTIONS} defaultSection="overview" queryParam={embedded ? 'hr_section' : 'section'} embedded={embedded}>
      {section => <CenterToolSection tools={TOOLS[section]} queryParam={embedded ? 'hr_tool' : 'tool'} />}
    </UnifiedCenter>
  );
}
