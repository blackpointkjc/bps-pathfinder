import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, Briefcase, Building2, Calendar, ClipboardCheck, ClipboardList, Eye, MessageCircle, Radio, Settings, Shield, Users, X } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
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
import SupervisorOverview from './SupervisorOverview';
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



const ADMIN_SUPERVISOR_SECTIONS = [
  { id: 'overview', label: 'Overview & Alerts', description: 'Priority alerts, work queue and supervisor command status', icon: Activity },
  { id: 'operations', label: 'Supervisor Operations', description: 'Live oversight, welfare, requests, handoff and command tasks', icon: ClipboardCheck },
  { id: 'oversight', label: 'Officer Oversight', description: 'Inspections, reviews, write-ups, force and complaints', icon: Users },
];

const ADMIN_SUPERVISOR_TOOLS = {
  operations: [
    { id: 'field', label: 'Live Field Oversight', component: SupervisorFieldOversight },
    { id: 'handover', label: 'Duty Supervisor Handoff', component: SupervisorShiftHandover },
    { id: 'tasks', label: 'Action Items', component: SupervisorTasks },
    { id: 'dutytimeline', label: 'Daily Duty Timeline', page: 'SupervisorDutyTimeline' },
    { id: 'dutyschedule', label: 'Duty Supervisor Schedule', page: 'DutySupervisorScheduling' },
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

function AdminInlineFunctions({ tools, queryParam, defaultTool }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const requested = params.get(queryParam);
  const initial = requested && tools.some(item => item.id === requested) ? requested : (defaultTool || tools[0]?.id);
  const [activeId, setActiveId] = useState(initial);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get(queryParam);
    if (current && tools.some(item => item.id === current) && current !== activeId) setActiveId(current);
  }, [queryParam, tools, activeId]);

  const select = id => {
    setActiveId(id);
    const next = new URLSearchParams(window.location.search);
    next.set(queryParam, id);
    navigate({ pathname: window.location.pathname, search: `?${next.toString()}` }, { replace: true });
  };

  const active = tools.find(item => item.id === activeId) || tools[0];
  const Component = active?.component;

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-30 flex flex-wrap gap-1.5 border-b border-slate-800 bg-[#08111e]/95 px-2 py-2 backdrop-blur">
        {tools.map(item => (
          <button key={item.id} type="button" onClick={() => select(item.id)}
            className={`rounded-md border px-2.5 py-1.5 text-[10px] font-black transition ${activeId === item.id ? 'border-cyan-500 bg-cyan-500/15 text-cyan-100 shadow-sm' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white'}`}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 overflow-x-clip">{Component ? <Component embedded /> : null}</div>
    </div>
  );
}

function AdminPersonnelAccessHub() {
  return <AdminInlineFunctions queryParam="admin_people_tool" tools={[
    { id: 'users', label: 'Users & Accounts', component: AdminUsers },
    { id: 'chain', label: 'Platoon & Chain', component: AdminPlatoonAssignments },
    { id: 'availability', label: 'Availability Approvals', component: AdminOfficerManagement },
    { id: 'cadpersonnel', label: 'CAD Personnel', component: Personnel },
  ]} />;
}

function AdminSchedulingCoverageHub() {
  return <AdminInlineFunctions queryParam="admin_schedule_tool" tools={[
    { id: 'scheduling', label: 'Scheduling', component: AdminScheduling },
    { id: 'fleet', label: 'Fleet Assignments', component: FleetVehicleAssignments },
    { id: 'duty', label: 'Duty Supervisor', component: DutySupervisorScheduling },
    { id: 'planned', label: 'Planned Shifts', component: AdminPlannedShifts },
    { id: 'bids', label: 'Shift Bids', component: AdminShiftBids },
    { id: 'supportclock', label: 'Support Clock In', component: AdminSupportStaffClock },
  ]} />;
}

function AdminLocationDispatchHub() {
  const requestedUtility = new URLSearchParams(window.location.search).get('admin_location_dispatch_tool');
  const [utility, setUtility] = useState(() => requestedUtility === 'geofence' || requestedUtility === 'locations' ? requestedUtility : '');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('admin_location_dispatch_tool');
    if ((requested === 'geofence' || requested === 'locations') && requested !== utility) setUtility(requested);
  }, [utility]);
  return (
    <div className="min-w-0 bg-[#07101a] p-2 md:p-3">
      <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[.14em] text-cyan-400">Location & Unit Awareness</div>
          </div>
          <AdminLocationTracker embedded />
        </section>
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[.14em] text-emerald-400">Automatic Dispatch</div>
          </div>
          <AdminAutoDispatchControls embedded />
        </section>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setUtility(utility === 'geofence' ? '' : 'geofence')} className={`rounded-lg border px-3 py-2 text-[10px] font-black ${utility === 'geofence' ? 'border-amber-500 bg-amber-500/15 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>GEOFENCE ALERTS</button>
        <button type="button" onClick={() => setUtility(utility === 'locations' ? '' : 'locations')} className={`rounded-lg border px-3 py-2 text-[10px] font-black ${utility === 'locations' ? 'border-blue-500 bg-blue-500/15 text-blue-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>LOCATION MANAGEMENT</button>
      </div>
      {utility && <section className="mt-2 overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]">{utility === 'geofence' ? <AdminGeofenceAlerts embedded /> : <AdminLocations embedded />}</section>}
    </div>
  );
}

function AdminSiteAssetsHub() {
  return <AdminInlineFunctions queryParam="admin_site_assets_tool" tools={[
    { id: 'qr', label: 'Patrol & Duty Rules', component: AdminQRCenter },
    { id: 'equipment', label: 'Equipment', component: AdminEquipment },
    { id: 'postorders', label: 'Post Orders', component: AdminPostOrders },
  ]} />;
}

function AdminSystemPortalHub() {
  return <AdminInlineFunctions queryParam="admin_system_portal_tool" tools={[
    { id: 'cadcontrol', label: 'Admin Control', component: AdminPortal },
    { id: 'settings', label: 'Portal Visibility', component: AdminPortalSettings },
  ]} />;
}

function AdminReportsQualityHub() {
  return <AdminInlineFunctions queryParam="admin_reports_quality_tool" tools={[
    { id: 'allreports', label: 'Report Review', component: AdminReports },
    { id: 'clientreports', label: 'Client Reports', component: AdminClientReports },
    { id: 'supervisorreports', label: 'Supervisor Reports', component: AdminSupervisorReports },
    { id: 'confidential', label: 'Confidential Reports', component: AdminConfidentialReports },
    { id: 'complaints', label: 'Complaints', component: AdminComplaints },
    { id: 'commendations', label: 'Commendations', component: AdminCommendations },
    { id: 'feedback', label: 'Client Feedback', component: AdminClientFeedback },
    { id: 'cadreports', label: 'CAD Reports', component: PathfinderReports },
  ]} />;
}

function AdminCommunicationsHub() {
  return <AdminInlineFunctions queryParam="admin_communications_tool" tools={[
    { id: 'announcements', label: 'Announcements', component: AdminAnnouncements },
    { id: 'requests', label: 'Special Requests', component: AdminSpecialRequests },
  ]} />;
}

function AdminSupervisorToolsOnly() {
  return <UnifiedCenter eyebrow="Supervisor" title="Supervisor" description="Complete supervisor tools for administrators, without the personal Officer Workspace." sections={ADMIN_SUPERVISOR_SECTIONS} defaultSection="overview" queryParam="admin_supervisor_section" embedded>
    {section => {
      if (section === 'overview') return <SupervisorOverview />;
      return <CenterToolSection tools={ADMIN_SUPERVISOR_TOOLS[section]} queryParam="admin_supervisor_tool" />;
    }}
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
      {section => {
        if (section === 'command') return <AdminInlineFunctions queryParam="admin_command_tool" tools={[
          { id: 'dashboard', label: 'Dashboard', component: AdminDashboard },
          { id: 'analytics', label: 'Company Analytics', component: AdminAnalytics },
        ]} />;
        if (section === 'people') return <AdminPersonnelAccessHub />;
        if (section === 'schedule') return <AdminSchedulingCoverageHub />;
        if (section === 'sites') return <div className="min-w-0"><AdminLocationDispatchHub /><div className="mt-3 grid gap-3 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]"><div className="border-b border-slate-800 px-3 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400">Site Assets</div><AdminSiteAssetsHub /></section><section className="overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]"><div className="border-b border-slate-800 px-3 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400">System & Portal</div><AdminSystemPortalHub /></section></div></div>;
        if (section === 'reports') return <AdminReportsQualityHub />;
        if (section === 'communications') return <AdminCommunicationsHub />;
        return <AdminDashboard />;
      }}
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const chooseOfficer = id => {
    const profile = officers.find(officer => String(officer.id) === String(id));
    if (!id || !profile) {
      setOfficerPreviewId('');
      setSelectedOfficer('');
      queryClient.removeQueries({ queryKey: ['currentUser'] });
      return;
    }

    // Persist the selected officer BEFORE mounting Officer Center. Previously the
    // selectedOfficer state rendered Officer Center first, so its queries ran as
    // the signed-in administrator and never changed when localStorage was updated.
    setOfficerPreviewId(id, { ...profile, __officer_preview: true });

    // Clear identity-dependent officer caches so every tool (dashboard, time,
    // schedule, reports, performance, training, etc.) resolves the selected
    // officer on its first render instead of reusing the administrator's cache.
    queryClient.removeQueries({ queryKey: ['currentUser'] });
    queryClient.removeQueries({ queryKey: ['dashboardDirectoryProfile'] });
    queryClient.removeQueries({ queryKey: ['dashboardPerformanceReviews'] });
    queryClient.removeQueries({ queryKey: ['activeTimeEntry'] });
    queryClient.removeQueries({ queryKey: ['myScheduleData'] });
    queryClient.removeQueries({ queryKey: ['myTimeEntries'] });
    queryClient.removeQueries({ queryKey: ['myPerformanceData'] });
    queryClient.removeQueries({ queryKey: ['officerPerformanceReviews'] });

    setSelectedOfficer(id);
  };
  const exitShadow = () => {
    setClientPreviewId('');
    setSelectedClient('');
    setOfficerPreviewId('');
    setSelectedOfficer('');
    queryClient.removeQueries({ queryKey: ['currentUser'] });
    queryClient.removeQueries({ queryKey: ['myScheduleData'] });
    queryClient.removeQueries({ queryKey: ['myTimeEntries'] });
    queryClient.removeQueries({ queryKey: ['myPerformanceData'] });
    setShadowMode('');
    navigate({ pathname: window.location.pathname, search: '?admin_center=admin' }, { replace: true });
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

  if (shadowMode) return <div className="min-h-full bg-[#070d17]"><AdminShadowBar mode={shadowMode} clients={clients} selectedClient={selectedClient} officers={officers} selectedOfficer={selectedOfficer} onMode={enterShadow} onClient={chooseClient} onOfficer={chooseOfficer} onExit={exitShadow}/>{shadowContent}</div>;

  return (
    <UnifiedCenter
      eyebrow="Master Administration"
      title="Admin Center"
      description="Administration and role-specific tools in one workspace. Preview any role when you need to verify exactly what that user experience looks like."
      sections={MASTER_SECTIONS}
      defaultSection="admin"
      queryParam="admin_center"
      headerAction={section => (
        <details className="relative">
          <summary className="flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-cyan-700/70 bg-cyan-950/30 px-2.5 text-[9px] font-black text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-900/40">
            <Eye className="h-3 w-3"/>PREVIEW AS
          </summary>
          <div className="absolute right-0 top-9 z-[2000] w-44 overflow-hidden rounded-lg border border-slate-600 bg-[#0b1725] p-1.5 shadow-2xl">
            {MASTER_SECTIONS.filter(item => item.id !== 'admin').map(item => (
              <button key={item.id} type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); enterShadow(item.id); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[10px] font-black transition hover:bg-cyan-950/60 hover:text-cyan-200 ${section === item.id ? 'bg-slate-800 text-white' : 'text-slate-300'}`}>
                <item.icon className="h-3.5 w-3.5"/>{item.label}
              </button>
            ))}
          </div>
        </details>
      )}
    >
      {section => {
        const mirror = section === 'cad' ? <CADCenter embedded /> : section === 'officer' ? <OfficerCenter embedded /> : section === 'supervisor' ? <AdminSupervisorToolsOnly /> : section === 'hr' ? <HRCenter embedded /> : section === 'client' ? <ClientCenter embedded /> : <AdministrationToolsOnly />;
        return <div className="min-w-0">{mirror}</div>;
      }}
    </UnifiedCenter>
  );
}
