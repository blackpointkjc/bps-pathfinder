import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Briefcase, Building2, Calendar, ClipboardCheck, ClipboardList, Eye, MessageCircle, Radio, Settings, Shield, Users, X } from 'lucide-react';
import UnifiedCenter, { useDesktopViewport } from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import AdminDashboard from './AdminDashboard';
import AdminAnalytics from './AdminAnalytics';
import AdminLocationTracker from './AdminLocationTracker';
import AdminGeofenceAlerts from './AdminGeofenceAlerts';
import AdminAutoDispatchControls from './AdminAutoDispatchControls';
import AdminScheduling from './AdminScheduling';
import FleetVehicleAssignments from './FleetVehicleAssignments';
import DutySupervisorScheduling from './DutySupervisorScheduling';
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
import AdminQRCenter from './AdminQRCenter';
import AdminPortalSettings from './AdminPortalSettings';
import AdminSupportStaffClock from './AdminSupportStaffClock';
import Personnel from './Personnel';
import PathfinderReports from './Reports';
import AdminPortal from './AdminPortal';
import CADCenter from './CADCenter';
import OfficerCenter from './OfficerCenter';
import SupervisorCenter from './SupervisorCenter';
import SupervisorFieldOversight from './SupervisorFieldOversight';
import SupervisorShiftHandover from './SupervisorShiftHandover';
import SupervisorTasks from './SupervisorTasks';
import SupervisorDailyCode from './SupervisorDailyCode';
import SupervisorInspections from './SupervisorInspections';
import SupervisorPerformanceReview from './SupervisorPerformanceReview';
import SupervisorWriteUps from './SupervisorWriteUps';
import SupervisorUseOfForce from './SupervisorUseOfForce';
import SupervisorComplaints from './SupervisorComplaints';
import SupervisorChat from './SupervisorChat';
import RankStructure from './RankStructure';
import HRCenter from './HRCenter';
import ClientCenter from './ClientCenter';
import { base44 } from '@/api/base44Client';
import { listDirectoryLocations, listDirectoryUsers, listOfficerDirectory } from '@/lib/appDirectory';
import { isClientAccount, isOperationalOfficer } from '@/lib/directoryUtils';
import { setClientPreviewId } from '@/utils/clientPreview';
import { setOfficerPreviewId } from '@/utils/officerPreview';

const MASTER_SECTIONS = [
  { id: 'admin', label: 'Administration', description: 'Administration-only command, scheduling, personnel, reports and system controls', icon: Settings },
  { id: 'cad', label: 'CAD', description: 'CAD tools only', icon: Radio },
  { id: 'officer', label: 'Officer', description: 'Officer tools only', icon: Shield },
  { id: 'supervisor', label: 'Supervisor', description: 'Supervisor and inherited officer tools', icon: ClipboardCheck },
  { id: 'hr', label: 'HR', description: 'HR tools only', icon: Briefcase },
  { id: 'client', label: 'Client', description: 'Client portal tools only', icon: Building2 },
];

const ADMIN_SECTIONS = [
  { id: 'command', label: 'Overview & Analytics', description: 'Dashboard and company performance visibility', icon: Activity },
  { id: 'people', label: 'People & Access', description: 'Users, access, platoons and availability decisions', icon: Users },
  { id: 'schedule', label: 'Scheduling & Time', description: 'Officer schedules, fleet assignments, duty supervisors, planned shifts, bids and support time', icon: Calendar },
  { id: 'sites', label: 'Sites & Assets', description: 'Locations, geofences, automatic dispatch, CAD controls, portal visibility, equipment, post orders and patrol rules', icon: Building2 },
  { id: 'reports', label: 'Reports & Quality', description: 'Operational reports, complaints, commendations and feedback', icon: ClipboardList },
  { id: 'communications', label: 'Requests & Documents', description: 'Announcements and special requests', icon: MessageCircle },
];

const ADMIN_TOOLS = {
  command: [
    { id: 'dashboard', label: 'Dashboard', component: AdminDashboard },
    { id: 'analytics', label: 'Company Analytics', component: AdminAnalytics },
  ],
  people: [
    { id: 'users', label: 'Users & Accounts', component: AdminUsers },
    { id: 'chain', label: 'Platoon & Chain', component: AdminPlatoonAssignments },
    { id: 'availability', label: 'Availability Approvals', component: AdminOfficerManagement },
    { id: 'cadpersonnel', label: 'CAD Personnel', component: Personnel },
  ],
  schedule: [
    { id: 'scheduling', label: 'Scheduling', component: AdminScheduling },
    { id: 'fleet', label: 'Fleet Assignments', component: FleetVehicleAssignments },
    { id: 'duty', label: 'Duty Supervisor', component: DutySupervisorScheduling },
    { id: 'planned', label: 'Planned Shifts', component: AdminPlannedShifts },
    { id: 'bids', label: 'Shift Bids', component: AdminShiftBids },
    { id: 'supportclock', label: 'Support Clock In', component: AdminSupportStaffClock },
  ],
  sites: [
    { id: 'tracker', label: 'Location Tracker', component: AdminLocationTracker },
    { id: 'geofence', label: 'Geofence Alerts', component: AdminGeofenceAlerts },
    { id: 'autodispatch', label: 'Automatic Dispatch', component: AdminAutoDispatchControls },
    { id: 'locations', label: 'Locations', component: AdminLocations },
    { id: 'cadcontrol', label: 'CAD Admin Controls', component: AdminPortal },
    { id: 'settings', label: 'Portal Visibility', component: AdminPortalSettings },
    { id: 'qr', label: 'Patrol & Duty Rules', component: AdminQRCenter },
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
    { id: 'cadreports', label: 'CAD Reports', component: PathfinderReports },
  ],
  communications: [
    { id: 'announcements', label: 'Announcements', component: AdminAnnouncements },
    { id: 'requests', label: 'Special Requests', component: AdminSpecialRequests },
  ],
};

const ADMIN_SUPERVISOR_SECTIONS = [
  { id: 'operations', label: 'Supervisor Operations', description: 'Live oversight, welfare, requests, handoff and command tasks', icon: ClipboardCheck },
  { id: 'oversight', label: 'Officer Oversight', description: 'Inspections, reviews, write-ups, force and complaints', icon: Users },
];

const ADMIN_SUPERVISOR_TOOLS = {
  operations: [
    { id: 'field', label: 'Live Field Oversight', component: SupervisorFieldOversight },
    { id: 'handover', label: 'Duty Supervisor Handoff', component: SupervisorShiftHandover },
    { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
    { id: 'code', label: 'Daily Code', component: SupervisorDailyCode },
    { id: 'chat', label: 'Supervisor Chat', component: SupervisorChat },
    { id: 'rank', label: 'Rank Structure', component: RankStructure },
  ],
  oversight: [
    { id: 'inspections', label: 'Officer Inspections', component: SupervisorInspections },
    { id: 'reviews', label: 'Performance Reviews', component: SupervisorPerformanceReview },
    { id: 'writeups', label: 'Write-Ups', component: SupervisorWriteUps },
    { id: 'force', label: 'Use of Force', component: SupervisorUseOfForce },
    { id: 'complaints', label: 'Complaints', component: SupervisorComplaints },
  ],
};

function AdminSupervisorToolsOnly() {
  return <UnifiedCenter eyebrow="Supervisor" title="Supervisor" description="Supervisor tools" sections={ADMIN_SUPERVISOR_SECTIONS} defaultSection="operations" queryParam="admin_supervisor_section" embedded>
    {section => <CenterToolSection tools={ADMIN_SUPERVISOR_TOOLS[section]} queryParam="admin_supervisor_tool" />}
  </UnifiedCenter>;
}

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
      {section => <CenterToolSection tools={ADMIN_TOOLS[section]} queryParam="admin_ops_tool" />}
    </UnifiedCenter>
  );
}

function AdminShadowBar({ mode, clients, selectedClient, officers, selectedOfficer, onMode, onClient, onOfficer, onExit }) {
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
        {mode === 'officer' && <select value={selectedOfficer} onChange={e=>onOfficer(e.target.value)} className="min-w-[280px] flex-1 rounded-md border border-cyan-500/40 bg-[#07111f] px-3 py-1.5 text-xs text-white sm:max-w-xl"><option value="">Choose officer to preview</option>{officers.map(officer=><option key={officer.id} value={officer.id}>{officer.__label}</option>)}</select>}
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
  const [officers, setOfficers] = useState([]);
  const [selectedOfficer, setSelectedOfficer] = useState('');

  useEffect(() => {
    if (shadowMode !== 'officer' || officers.length) return;
    listOfficerDirectory('last_name', 1000).then(rows => {
      setOfficers((rows || []).filter(isOperationalOfficer).map(person => {
        const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || person.full_name || person.email || 'Unnamed Officer';
        return { ...person, __label: `${person.rank || 'Officer'} ${name} — ${person.email || 'No email'}` };
      }));
    }).catch(() => setOfficers([]));
  }, [shadowMode, officers.length]);

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
    if (mode !== 'officer') {
      setOfficerPreviewId('');
      setSelectedOfficer('');
    }
    setShadowMode(mode);
  };
  const chooseClient = async id => {
    setSelectedClient(id);
    const auth = await base44.auth.me().catch(()=>null);
    const profile = clients.find(client=>client.id===id);
    setClientPreviewId(id, profile ? {...profile,__auth_admin_id:auth?.id} : null);
  };
  const chooseOfficer = async id => {
    setSelectedOfficer(id);
    const auth = await base44.auth.me().catch(() => null);
    const profile = officers.find(officer => String(officer.id) === String(id));
    setOfficerPreviewId(id, profile ? { ...profile, __officer_preview: true, __auth_admin_id: auth?.id } : null);
  };
  const exitShadow = () => {
    setClientPreviewId('');
    setSelectedClient('');
    setOfficerPreviewId('');
    setSelectedOfficer('');
    setShadowMode('');
  };

  const shadowContent = useMemo(() => {
    if (shadowMode === 'cad') return <CADCenter key="shadow-cad" />;
    if (shadowMode === 'officer' && selectedOfficer) return <OfficerCenter key={`shadow-officer-${selectedOfficer}`} />;
    if (shadowMode === 'officer') return <div className="flex min-h-[70vh] items-center justify-center bg-[#070d17] p-6 text-center text-slate-400"><div><Shield className="mx-auto mb-3 h-10 w-10 text-cyan-300"/><div className="text-lg font-black text-white">Select an officer account above</div><div className="mt-1 text-sm">The Officer Center will load that officer's schedule, time, reports, and performance view.</div></div></div>;
    if (shadowMode === 'supervisor') return <SupervisorCenter key="shadow-supervisor" />;
    if (shadowMode === 'hr') return <HRCenter key="shadow-hr" />;
    if (shadowMode === 'client' && selectedClient) return <ClientCenter key={`shadow-client-${selectedClient}`} />;
    if (shadowMode === 'client') return <div className="flex min-h-[70vh] items-center justify-center bg-[#070d17] p-6 text-center text-slate-400"><div><Building2 className="mx-auto mb-3 h-10 w-10 text-blue-300"/><div className="text-lg font-black text-white">Select a client account above</div><div className="mt-1 text-sm">The full client portal will replace this workspace for shadow testing.</div></div></div>;
    return null;
  }, [shadowMode, selectedClient, selectedOfficer]);

  if (!desktop) return <AdminDashboard />;
  if (shadowMode) return <div className="min-h-full bg-[#070d17]"><AdminShadowBar mode={shadowMode} clients={clients} selectedClient={selectedClient} officers={officers} selectedOfficer={selectedOfficer} onMode={enterShadow} onClient={chooseClient} onOfficer={chooseOfficer} onExit={exitShadow}/>{shadowContent}</div>;

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
        const mirror = section === 'cad' ? <CADCenter embedded /> : section === 'officer' ? <OfficerCenter embedded /> : section === 'supervisor' ? <AdminSupervisorToolsOnly /> : section === 'hr' ? <HRCenter embedded /> : section === 'client' ? <ClientCenter embedded /> : <AdministrationToolsOnly />;
        return <div className="min-w-0">{section !== 'admin' && <div className="flex justify-end border-b border-slate-800 bg-[#08111e] px-4 py-2"><button type="button" onClick={()=>enterShadow(section)} className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-[11px] font-black text-slate-200 hover:border-cyan-500 hover:text-cyan-200"><Eye className="h-3.5 w-3.5"/>Preview as {section.charAt(0).toUpperCase()+section.slice(1)}</button></div>}{mirror}</div>;
      }}
    </UnifiedCenter>
  );
}
