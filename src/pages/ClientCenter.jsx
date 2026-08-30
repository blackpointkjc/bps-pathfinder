import { AlertTriangle, Building2, FileText, CalendarClock, DollarSign } from 'lucide-react';
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
  { id: 'overview', label: 'Overview & Alerts', description: 'Dashboard, security alerts and calls for service', icon: AlertTriangle },
  { id: 'site', label: 'Site Operations', description: 'Schedules, supervisors, property details and trespass activity across assigned sites', icon: Building2 },
  { id: 'records', label: 'Reports & Documents', description: 'Approved reports, patrol verification and site documents', icon: FileText },
  { id: 'requests', label: 'Requests & Feedback', description: 'Special coverage requests and service feedback', icon: CalendarClock },
  { id: 'billing', label: 'Billing & Invoices', description: 'Billing records, invoices and approved service hours', icon: DollarSign },
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
    { id: 'feedback', label: 'Service Feedback', component: ClientFeedback },
  ],
  billing: [
    { id: 'payroll', label: 'Billing & Invoices', component: ClientPayrollReport },
  ],
};

export default function ClientCenter({ embedded = false }) {
  return (
    <UnifiedCenter eyebrow="Client Services" title="Client Center" description="Your secure portfolio view for site operations, verified reporting, service requests, billing, and communication across every assigned property." sections={SECTIONS} defaultSection="overview" contentClassName="client-portal-shell bg-[#070d17] text-slate-100" queryParam={embedded ? 'client_section' : 'section'} embedded={embedded}>
      {section => <CenterToolSection tools={TOOLS[section]} queryParam={embedded ? 'client_tool' : 'tool'} />}
    </UnifiedCenter>
  );
}
