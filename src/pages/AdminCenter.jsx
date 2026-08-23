import { Activity, Calendar, ClipboardList, MessageCircle, Settings, Users } from 'lucide-react';
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

const SECTIONS = [
  { id: 'command', label: 'Command', description: 'Dashboard, analytics and live oversight', icon: Activity },
  { id: 'schedule', label: 'Scheduling & Fleet', description: 'Scheduling, bids, fleet and availability', icon: Calendar },
  { id: 'people', label: 'Personnel & Sites', description: 'Users, locations, equipment and chain', icon: Users },
  { id: 'reports', label: 'Reports & Quality', description: 'All operational review and quality tools', icon: ClipboardList },
  { id: 'communications', label: 'Communications', description: 'Announcements, requests and documents', icon: MessageCircle },
  { id: 'system', label: 'System & Support', description: 'QR patrol, portal settings and support clock', icon: Settings },
];

const TOOLS = {
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

export default function AdminCenter() {
  const desktop = useDesktopViewport();
  if (!desktop) return <AdminDashboard />;
  return (
    <UnifiedCenter eyebrow="Administration" title="Admin Center" description="A single desktop workspace for command, scheduling, personnel, reports, communications, system controls, and support clock-in." sections={SECTIONS} defaultSection="command">
      {section => <CenterToolSection key={section} tools={TOOLS[section]} />}
    </UnifiedCenter>
  );
}
