import { Activity, BarChart3, Briefcase, Building2, Calendar, ClipboardCheck, ClipboardList, MessageCircle, Radio, Settings, Shield, Users } from 'lucide-react';
import UnifiedCenter, { useDesktopViewport } from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import AdminDashboard from './AdminDashboard';
import AdminAnalytics from './AdminAnalytics';
import AdminLocationTracker from './AdminLocationTracker';
import AdminGeofenceAlerts from './AdminGeofenceAlerts';
import AdminScheduling from './AdminScheduling';
import FleetVehicleAssignments from './FleetVehicleAssignments';
import AdminOfficerManagement from './AdminOfficerManagement';
import AdminPlannedShifts from './AdminPlannedShifts';
import AdminShiftBids from './AdminShiftBids';
import AdminUsers from './AdminUsers';
import AdminPlatoonAssignments from './AdminPlatoonAssignments';
import AdminLocations from './AdminLocations';
import AdminEquipment from './AdminEquipment';
import AdminPostOrders from './AdminPostOrders';
import AdminReports from './AdminReports';
import AdminClientReports from './AdminClientReports';
import AdminSupervisorReports from './AdminSupervisorReports';
import AdminConfidentialReports from './AdminConfidentialReports';
import AdminComplaints from './AdminComplaints';
import AdminCommendations from './AdminCommendations';
import AdminClientFeedback from './AdminClientFeedback';
import AdminAnnouncements from './AdminAnnouncements';
import AdminSpecialRequests from './AdminSpecialRequests';
import AdminDocuments from './AdminDocuments';
import AdminQRCheckpoints from './AdminQRCheckpoints';
import AdminQRPrintManager from './AdminQRPrintManager';
import AdminQRReports from './AdminQRReports';
import AdminPortalSettings from './AdminPortalSettings';
import AdminSupportStaffClock from './AdminSupportStaffClock';
import CADCenter from './CADCenter';
import OfficerCenter from './OfficerCenter';
import SupervisorCenter from './SupervisorCenter';
import HRCenter from './HRCenter';
import ClientCenter from './ClientCenter';

const MASTER_SECTIONS = [
  { id: 'admin', label: 'Administration', description: 'Administration, command, scheduling, personnel, reports and system controls', icon: Settings },
  { id: 'cad', label: 'CAD', description: 'Full computer-aided dispatch workspace', icon: Radio },
  { id: 'officer', label: 'Officer', description: 'Officer shift, field tools, reports and profile', icon: Shield },
  { id: 'supervisor', label: 'Supervisor', description: 'Supervisor operations, welfare, oversight and officer tools', icon: ClipboardCheck },
  { id: 'hr', label: 'HR', description: 'Employees, time, leave, performance and assignments', icon: Briefcase },
  { id: 'client', label: 'Client', description: 'Client-facing site, reporting, requests and billing view', icon: Building2 },
];

const ADMIN_SECTIONS = [
  { id: 'command', label: 'Command', description: 'Dashboard, analytics and live oversight', icon: Activity },
  { id: 'schedule', label: 'Scheduling & Fleet', description: 'Scheduling, bids, fleet and availability', icon: Calendar },
  { id: 'people', label: 'Personnel & Sites', description: 'Users, locations, equipment and chain', icon: Users },
  { id: 'reports', label: 'Reports & Quality', description: 'All operational review and quality tools', icon: ClipboardList },
  { id: 'communications', label: 'Communications', description: 'Announcements, requests and documents', icon: MessageCircle },
  { id: 'system', label: 'System & Support', description: 'QR patrol, portal settings and support clock', icon: BarChart3 },
];

const ADMIN_TOOLS = {
  command: [
    { id: 'dashboard', label: 'Dashboard', component: AdminDashboard },
    { id: 'analytics', label: 'Company Analytics', component: AdminAnalytics },
    { id: 'tracker', label: 'Location Tracker', component: AdminLocationTracker },
    { id: 'geofence', label: 'Geofence Alerts', component: AdminGeofenceAlerts },
  ],
  schedule: [
    { id: 'scheduling', label: 'Scheduling', component: AdminScheduling },
    { id: 'fleet', label: 'Fleet Assignments', component: FleetVehicleAssignments },
    { id: 'availability', label: 'Availability Approvals', component: AdminOfficerManagement },
    { id: 'planned', label: 'Planned Shifts', component: AdminPlannedShifts },
    { id: 'bids', label: 'Shift Bids', component: AdminShiftBids },
  ],
  people: [
    { id: 'users', label: 'Users & Accounts', component: AdminUsers },
    { id: 'chain', label: 'Platoon & Chain', component: AdminPlatoonAssignments },
    { id: 'locations', label: 'Locations', component: AdminLocations },
    { id: 'equipment', label: 'Equipment', component: AdminEquipment },
    { id: 'postorders', label: 'Post Orders', component: AdminPostOrders },
  ],
  reports: [
    { id: 'allreports', label: 'All Reports', component: AdminReports },
    { id: 'clientreports', label: 'Client Reports', component: AdminClientReports },
    { id: 'supervisorreports', label: 'Supervisor Reports', component: AdminSupervisorReports },
    { id: 'confidential', label: 'Confidential Reports', component: AdminConfidentialReports },
    { id: 'complaints', label: 'Complaints', component: AdminComplaints },
    { id: 'commendations', label: 'Commendations', component: AdminCommendations },
    { id: 'feedback', label: 'Client Feedback', component: AdminClientFeedback },
  ],
  communications: [
    { id: 'announcements', label: 'Announcements', component: AdminAnnouncements },
    { id: 'requests', label: 'Special Requests', component: AdminSpecialRequests },
    { id: 'documents', label: 'Documents', component: AdminDocuments },
  ],
  system: [
    { id: 'qrcheckpoints', label: 'QR Checkpoints', component: AdminQRCheckpoints },
    { id: 'qrprint', label: 'QR Print Manager', component: AdminQRPrintManager },
    { id: 'qrreports', label: 'QR Patrol Reports', component: AdminQRReports },
    { id: 'settings', label: 'Portal Settings', component: AdminPortalSettings },
    { id: 'supportclock', label: 'Support Clock In', component: AdminSupportStaffClock },
  ],
};

function AdministrationWorkspace() {
  return (
    <UnifiedCenter
      eyebrow="Administration"
      title="Administration"
      description="Command, scheduling, personnel, reports, communications, system controls, and support operations."
      sections={ADMIN_SECTIONS}
      defaultSection="command"
      queryParam="admin_ops_section"
    >
      {section => <CenterToolSection key={section} tools={ADMIN_TOOLS[section]} queryParam="admin_ops_tool" />}
    </UnifiedCenter>
  );
}

export default function AdminCenter() {
  const desktop = useDesktopViewport();
  if (!desktop) return <AdminDashboard />;
  return (
    <UnifiedCenter
      eyebrow="Master Administration"
      title="Admin Center"
      description="One master workspace with soft-mirrored Administration, CAD, Officer, Supervisor, HR, and Client centers. Each embedded center uses the original live tools and workflows."
      sections={MASTER_SECTIONS}
      defaultSection="admin"
      queryParam="admin_center"
    >
      {section => {
        if (section === 'cad') return <CADCenter embedded />;
        if (section === 'officer') return <OfficerCenter embedded />;
        if (section === 'supervisor') return <SupervisorCenter embedded />;
        if (section === 'hr') return <HRCenter embedded />;
        if (section === 'client') return <ClientCenter embedded />;
        return <AdministrationWorkspace />;
      }}
    </UnifiedCenter>
  );
}
