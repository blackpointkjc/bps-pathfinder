import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Briefcase, Building2, Calendar, ClipboardCheck, ClipboardList, Eye, MessageCircle, Radio, Settings, Shield, Users, X } from 'lucide-react';
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
import { base44 } from '@/api/base44Client';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { isClientAccount } from '@/lib/directoryUtils';
import { setClientPreviewId } from '@/utils/clientPreview';

const MASTER_SECTIONS = [
  { id: 'admin', label: 'Administration', description: 'Administration-only command, scheduling, personnel, reports and system controls', icon: Settings },
  { id: 'cad', label: 'CAD', description: 'CAD tools only', icon: Radio },
  { id: 'officer', label: 'Officer', description: 'Officer tools only', icon: Shield },
  { id: 'supervisor', label: 'Supervisor', description: 'Supervisor and inherited officer tools', icon: ClipboardCheck },
  { id: 'hr', label: 'HR', description: 'HR tools only', icon: Briefcase },
  { id: 'client', label: 'Client', description: 'Client portal tools only', icon: Building2 },
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

function AdministrationToolsOnly() {
  return (
    <UnifiedCenter
      eyebrow="Administration"
      title="Administration"
      description="Administration tools"
      sections={ADMIN_SECTIONS}
      defaultSection="command"
      queryParam="admin_ops_section"
      embedded
    >
      {section => <CenterToolSection key={section} tools={ADMIN_TOOLS[section]} queryParam="admin_ops_tool" />}
    </UnifiedCenter>
  );
}

function AdminShadowBar({ mode, clients, selectedClient, onMode, onClient, onExit }) {
  const labels = { cad:'CAD', officer:'Officer', supervisor:'Supervisor', hr:'HR', client:'Client' };
  return (
    <div className="sticky top-0 z-[70] border-b border-slate-700 bg-[#09111d]/98 px-3 py-2 text-white shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 pr-2 text-xs font-black text-cyan-200">
          <Eye className="h-4 w-4" />
          <span>Previewing as {labels[mode] || 'Role'}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {['cad','officer','supervisor','hr','client'].map(item => <button key={item} type="button" onClick={() => onMode(item)} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold ${mode===item?'border-cyan-400 bg-cyan-500/15 text-cyan-100':'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white'}`}>{labels[item]}</button>)}
        </div>
        {mode === 'client' && <select value={selectedClient} onChange={e=>onClient(e.target.value)} className="min-w-[280px] flex-1 rounded-md border border-blue-500/40 bg-[#07111f] px-3 py-1.5 text-xs text-white sm:max-w-xl"><option value="">Choose client account</option>{clients.map(client=><option key={client.id} value={client.id}>{client.__label}</option>)}</select>}
        <button type="button" onClick={onExit} className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-slate-200 hover:border-red-500 hover:text-red-200"><X className="h-3.5 w-3.5"/>Exit Preview</button>
      </div>
    </div>
  );
}

export default function AdminCenter() {
  const desktop = useDesktopViewport();
  const [shadowMode, setShadowMode] = useState('');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');

  useEffect(() => {
    if (shadowMode !== 'client' || clients.length) return;
    Promise.all([listDirectoryUsers('-last_updated',1000), listDirectoryLocations('site_name',1000)]).then(([users,locations]) => {
      const rows = (users || []).filter(isClientAccount).map(person => {
        const email = String(person.email || '').toLowerCase();
        const assignedLocations = [...new Set([...(Array.isArray(person.assigned_locations)?person.assigned_locations:[]), ...(person.assigned_location?[person.assigned_location]:[]), ...(locations||[]).filter(location=>String(location.assigned_client_email||'').toLowerCase()===email).map(location=>location.site_name)].filter(Boolean))];
        const name = [person.first_name,person.last_name].filter(Boolean).join(' ').trim() || person.email || 'Unnamed Client';
        return {...person,assigned_locations:assignedLocations,assigned_location:person.assigned_location||assignedLocations[0]||'',__client_preview:true,__label:`${name} — ${assignedLocations.join(', ') || 'No property assigned'}`};
      });
      setClients(rows);
    }).catch(()=>setClients([]));
  }, [shadowMode, clients.length]);

  const enterShadow = mode => {
    if (mode !== 'client') {
      setClientPreviewId('');
      setSelectedClient('');
    }
    setShadowMode(mode);
  };
  const chooseClient = async id => {
    setSelectedClient(id);
    const auth = await base44.auth.me().catch(()=>null);
    const profile = clients.find(client=>client.id===id);
    setClientPreviewId(id, profile ? {...profile,__auth_admin_id:auth?.id} : null);
  };
  const exitShadow = () => {
    setClientPreviewId('');
    setSelectedClient('');
    setShadowMode('');
  };

  const shadowContent = useMemo(() => {
    if (shadowMode === 'cad') return <CADCenter key="shadow-cad" />;
    if (shadowMode === 'officer') return <OfficerCenter key="shadow-officer" />;
    if (shadowMode === 'supervisor') return <SupervisorCenter key="shadow-supervisor" />;
    if (shadowMode === 'hr') return <HRCenter key="shadow-hr" />;
    if (shadowMode === 'client' && selectedClient) return <ClientCenter key={`shadow-client-${selectedClient}`} />;
    if (shadowMode === 'client') return <div className="flex min-h-[70vh] items-center justify-center bg-[#070d17] p-6 text-center text-slate-400"><div><Building2 className="mx-auto mb-3 h-10 w-10 text-blue-300"/><div className="text-lg font-black text-white">Select a client account above</div><div className="mt-1 text-sm">The full client portal will replace this workspace for shadow testing.</div></div></div>;
    return null;
  }, [shadowMode, selectedClient]);

  if (!desktop) return <AdminDashboard />;
  if (shadowMode) return <div className="min-h-full bg-[#070d17]"><AdminShadowBar mode={shadowMode} clients={clients} selectedClient={selectedClient} onMode={enterShadow} onClient={chooseClient} onExit={exitShadow}/>{shadowContent}</div>;

  return (
    <UnifiedCenter
      eyebrow="Master Administration"
      title="Admin Center"
      description="Administration and role-specific tools in one workspace. Preview any role when you need to verify exactly what that user experience looks like."
      sections={MASTER_SECTIONS}
      defaultSection="admin"
      queryParam="admin_center"
    >
      {section => {
        const mirror = section === 'cad' ? <CADCenter embedded /> : section === 'officer' ? <OfficerCenter embedded /> : section === 'supervisor' ? <SupervisorCenter embedded /> : section === 'hr' ? <HRCenter embedded /> : section === 'client' ? <ClientCenter embedded /> : <AdministrationToolsOnly />;
        return <div className="min-w-0">{section !== 'admin' && <div className="flex justify-end border-b border-slate-800 bg-[#08111e] px-4 py-2"><button type="button" onClick={()=>enterShadow(section)} className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-[11px] font-black text-slate-200 hover:border-cyan-500 hover:text-cyan-200"><Eye className="h-3.5 w-3.5"/>Preview as {section.charAt(0).toUpperCase()+section.slice(1)}</button></div>}{mirror}</div>;
      }}
    </UnifiedCenter>
  );
}
