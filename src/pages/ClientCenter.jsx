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
  { id: 'site', label: 'Site Operations', description: 'Unified schedule, supervisors, property details and trespass activity across every assigned site', icon: Building2 },
  { id: 'records', label: 'Reports & Records', description: 'Approved reports, patrol verification and site documents', icon: FileText },
  { id: 'requests', label: 'Service & Billing', description: 'Coverage requests, billing, invoices and service feedback', icon: CalendarClock },
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
    { id: 'payroll', label: 'Billing & Invoices', component: ClientPayrollReport },
    { id: 'feedback', label: 'Feedback', component: ClientFeedback },
  ],
};

export default function ClientCenter() {
  return (
    <UnifiedCenter eyebrow="Client Services" title="Client Center" description="Your secure portfolio view for site operations, verified reporting, service requests, billing, and communication across every assigned property." sections={SECTIONS} defaultSection="overview" contentClassName="client-portal-shell bg-[#070d17] text-slate-100">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
