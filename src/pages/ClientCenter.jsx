import { AlertTriangle, Building2, FileText, CalendarClock } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import ClientDashboard from './ClientDashboard';
import ClientAlerts from './ClientAlerts';
import ClientCallHistory from './ClientCallHistory';
import ClientSchedule from './ClientSchedule';
import ClientSupervisors from './ClientSupervisors';
import ClientLocation from './ClientLocation';
import ClientTrespass from './ClientTrespass';
import ClientReports from './ClientReports';
import ClientQRReports from './ClientQRReports';
import ClientDocuments from './ClientDocuments';
import ClientSpecialRequests from './ClientSpecialRequests';
import ClientPayrollReport from './ClientPayrollReport';
import ClientFeedback from './ClientFeedback';

const SECTIONS = [
  { id: 'overview', label: 'Overview', description: 'Dashboard, alerts and calls for service', icon: AlertTriangle },
  { id: 'site', label: 'Site Operations', description: 'Schedule, supervisors, location and trespass', icon: Building2 },
  { id: 'records', label: 'Reports & Documents', description: 'Reports, QR patrol and documents', icon: FileText },
  { id: 'requests', label: 'Requests & Billing', description: 'Requests, payroll/invoicing and feedback', icon: CalendarClock },
];

const TOOLS = {
  overview: [
    { id: 'dashboard', label: 'Dashboard', component: ClientDashboard },
    { id: 'alerts', label: 'Security Alerts', component: ClientAlerts },
    { id: 'calls', label: 'Calls for Service', component: ClientCallHistory },
  ],
  site: [
    { id: 'schedule', label: 'Site Schedule', component: ClientSchedule },
    { id: 'supervisors', label: 'Site Supervisors', component: ClientSupervisors },
    { id: 'location', label: 'Location Info', component: ClientLocation },
    { id: 'trespass', label: 'Trespass Management', component: ClientTrespass },
  ],
  records: [
    { id: 'reports', label: 'All Reports', component: ClientReports },
    { id: 'qr', label: 'QR Patrol Reports', component: ClientQRReports },
    { id: 'documents', label: 'Training Documents', component: ClientDocuments },
  ],
  requests: [
    { id: 'special', label: 'Special Requests', component: ClientSpecialRequests },
    { id: 'payroll', label: 'Payroll & Invoicing', component: ClientPayrollReport },
    { id: 'feedback', label: 'Feedback', component: ClientFeedback },
  ],
};

export default function ClientCenter() {
  return (
    <UnifiedCenter eyebrow="Client Services" title="Client Center" description="One desktop workspace for site activity, reports, requests, billing, and client communication." sections={SECTIONS} defaultSection="overview">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
