import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, Briefcase, Building2, Calendar, ClipboardCheck, ClipboardList, Eye, GraduationCap, MessageCircle, Radio, Settings, Shield, Users, X } from 'lucide-react';
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
import TrainerCenter from './TrainerCenter';
import StudentPortal from './StudentPortal';
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
  { id: 'training', label: 'Trainer', description: 'Training operations and compliance', icon: GraduationCap },
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
      <div className="min-w-0 overflow-visible">{Component ? <Component /> : null}</div>
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
  return <AdminInlineFunctions queryParam="admin_location_dispatch_tool" tools={[
    { id: 'tracker', label: 'Live Tracker', component: AdminLocationTracker },
    { id: 'geofence', label: 'Geofence Alerts', component: AdminGeofenceAlerts },
    { id: 'autodispatch', label: 'Auto Dispatch', component: AdminAutoDispatchControls },
    { id: 'locations', label: 'Manage Locations', component: AdminLocations },
  ]} />;
}

function AdminSiteOperationsHub() {
  return <AdminInlineFunctions queryParam="admin_site_ops_tool" tools={[
    { id: 'location', label: 'Location & Dispatch', component: AdminLocationDispatchHub },
    { id: 'qr', label: 'Patrol & Duty Rules', component: AdminQRCenter },
    { id: 'equipment', label: 'Equipment', component: AdminEquipment },
    { id: 'postorders', label: 'Post Orders', component: AdminPostOrders },
    { id: 'control', label: 'Admin Control', component: AdminPortal },
    { id: 'visibility', label: 'Portal Visibility', component: AdminPortalSettings },
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
        if (section === 'sites') return <AdminSiteOperationsHub />;
        if (section === 'reports') return <AdminReportsQualityHub />;
        if (section === 'communications') return <AdminCommunicationsHub />;
        return <AdminDashboard />;
      }}
    </UnifiedCenter>
  );
}

function AdminShadowBar({ mode, clients, selectedClient, officers, selectedOfficer, roleAccounts, selectedRoleUser, onMode, onClient, onOfficer, onRoleUser, onExit }) {
  const labels = { cad:'CAD', officer:'Officer', supervisor:'Supervisor', hr:'HR', training:'Trainer', student:'Student', client:'Client' };
  const needsRoleAccount = ['supervisor','hr','training','student'].includes(mode);
  const currentAccount = mode === 'officer'
    ? officers.find(item => String(item.id) === String(selectedOfficer))
    : mode === 'client'
      ? clients.find(item => String(item.id) === String(selectedClient))
      : roleAccounts.find(item => String(item.id) === String(selectedRoleUser));
  return (
    <div className="sticky top-0 z-[70] bg-[#050a12]/96 p-2 text-white backdrop-blur-xl">
      <div className="mx-auto max-w-[1700px] overflow-hidden rounded-xl border border-[#29445e] bg-[#081522] shadow-[0_14px_40px_rgba(0,0,0,.38)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1d3349] px-3 py-2">
          <div className="flex items-center gap-2 pr-1 text-[10px] font-black uppercase tracking-[.14em] text-cyan-300">
            <Eye className="h-4 w-4" />
            Account Preview
          </div>
          <div className="flex flex-1 flex-wrap gap-1">
            {['cad','officer','supervisor','hr','training','student','client'].map(item => <button key={item} type="button" onClick={() => onMode(item)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition ${mode===item?'border-cyan-400 bg-cyan-500/20 text-cyan-50 shadow-sm':'border-slate-700 bg-[#0b1928] text-slate-400 hover:border-slate-500 hover:text-white'}`}>{labels[item]}</button>)}
          </div>
          <button type="button" onClick={onExit} className="flex items-center gap-1.5 rounded-lg border border-red-800/70 bg-red-950/30 px-2.5 py-1.5 text-[10px] font-black text-red-200 hover:border-red-500 hover:bg-red-900/40"><X className="h-3.5 w-3.5"/>EXIT PREVIEW</button>
        </div>
        {(mode !== 'cad') && (
          <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-slate-500">{labels[mode]} account</div>
              <div className="mt-0.5 truncate text-xs font-bold text-white">{currentAccount?.__label || 'Select an account to load the real user view'}</div>
            </div>
            {mode === 'officer' && <select value={selectedOfficer} onChange={e=>onOfficer(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-cyan-500/40 bg-[#07111f] px-3 text-xs text-white sm:max-w-xl"><option value="">Choose officer account…</option>{officers.map(officer=><option key={officer.id} value={officer.id}>{officer.__label}</option>)}</select>}
            {mode === 'client' && <select value={selectedClient} onChange={e=>onClient(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-blue-500/40 bg-[#07111f] px-3 text-xs text-white sm:max-w-xl"><option value="">Choose client account…</option>{clients.map(client=><option key={client.id} value={client.id}>{client.__label}</option>)}</select>}
            {needsRoleAccount && <select value={selectedRoleUser} onChange={e=>onRoleUser(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-violet-500/40 bg-[#07111f] px-3 text-xs text-white sm:max-w-xl"><option value="">Choose {labels[mode].toLowerCase()} account…</option>{roleAccounts.map(person=><option key={person.id} value={person.id}>{person.__label}</option>)}</select>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminCenter() {
  const queryClient = useQueryClient();
  const { data: signedInUser } = useQuery({ queryKey: ['adminCenterSignedInUser'], queryFn: () => base44.auth.me(), staleTime: 60000 });
  const navigate = useNavigate();
  const [shadowMode, setShadowMode] = useState('');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [officers, setOfficers] = useState([]);
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [previewPeople, setPreviewPeople] = useState([]);
  const [selectedRoleUser, setSelectedRoleUser] = useState('');
  const signedInRoles = new Set([signedInUser?.role, ...(signedInUser?.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));
  const masterSections = MASTER_SECTIONS.filter(item => item.id !== 'training' || signedInRoles.has('trainer') || signedInRoles.has('full_access'));

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
    if (!['supervisor','hr','training','student'].includes(shadowMode)) return;
    let active = true;
    Promise.allSettled([
      listDirectoryUsers('-last_updated', 1000),
      base44.entities.User.list(undefined, 1000),
    ]).then(results => {
      if (!active) return;
      const directoryRows = results[0].status === 'fulfilled' ? (results[0].value || []) : [];
      const directRows = results[1].status === 'fulfilled' ? (results[1].value || []) : [];
      const byIdentity = new Map();
      for (const person of [...directoryRows, ...directRows]) {
        const key = String(person?.id || person?.email || '').trim().toLowerCase();
        if (!key) continue;
        byIdentity.set(key, { ...(byIdentity.get(key) || {}), ...person });
      }
      setPreviewPeople([...byIdentity.values()].map(person => {
        const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || person.full_name || person.email || 'Unnamed User';
        return { ...person, __label: `${person.rank || 'User'} ${name} — ${person.email || 'No email'}` };
      }));
    }).catch(() => { if (active) setPreviewPeople([]); });
    return () => { active = false; };
  }, [shadowMode]);

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
    if (mode !== 'officer') setSelectedOfficer('');
    if (!['officer','supervisor','hr','training','student'].includes(mode)) {
      setOfficerPreviewId('');
      setSelectedRoleUser('');
    } else {
      setOfficerPreviewId('');
      setSelectedRoleUser('');
    }
    queryClient.removeQueries({ queryKey: ['currentUser'] });
    setShadowMode(mode);
  };
  const chooseClient = async id => {
    setSelectedClient(id);
    const auth = await base44.auth.me().catch(()=>null);
    const profile = clients.find(client=>client.id===id);
    setClientPreviewId(id, profile ? {...profile,__auth_admin_id:auth?.id} : null);
  };
  const roleAccounts = useMemo(() => {
    const mode = shadowMode;
    const rankSupervisors = new Set(['corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel']);
    return previewPeople.filter(person => {
      // Role fields have arrived as both arrays and plain strings across accounts;
      // normalize either form so an account is never hidden from its own preview.
      const rawRoles = Array.isArray(person.additional_roles) ? person.additional_roles
        : person.additional_roles ? [person.additional_roles] : [];
      const roles = new Set([person.role, ...rawRoles].filter(Boolean).map(value => String(value).toLowerCase()));
      const rank = String(person.rank || '').toLowerCase();
      if (mode === 'supervisor') return person.is_supervisor === true || person.role === 'admin' || roles.has('supervisor') || roles.has('full_access') || rankSupervisors.has(rank);
      if (mode === 'hr') return roles.has('hr') || rank === 'human resources';
      if (mode === 'training') return roles.has('trainer') || roles.has('training');
      if (mode === 'student') return roles.has('student') || String(person.user_type || '').toLowerCase() === 'student';
      return false;
    });
  }, [previewPeople, shadowMode]);

  const chooseRoleUser = id => {
    const profile = roleAccounts.find(person => String(person.id) === String(id));
    if (!id || !profile) {
      setOfficerPreviewId('');
      setSelectedRoleUser('');
      queryClient.removeQueries({ queryKey: ['currentUser'] });
      return;
    }
    setOfficerPreviewId(id, { ...profile, __officer_preview: true, __role_preview: shadowMode });
    setSelectedRoleUser(id);
    queryClient.removeQueries({ queryKey: ['currentUser'] });
    queryClient.removeQueries({ queryKey: ['myPerformanceData'] });
    queryClient.removeQueries({ queryKey: ['officerPerformanceReviews'] });
    queryClient.removeQueries({ queryKey: ['myTrainingCompletions'] });
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
    setSelectedRoleUser('');
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
    if (shadowMode === 'supervisor' && selectedRoleUser) return <SupervisorCenter key={`shadow-supervisor-${selectedRoleUser}`} />;
    if (shadowMode === 'hr' && selectedRoleUser) return <HRCenter key={`shadow-hr-${selectedRoleUser}`} />;
    if (shadowMode === 'training' && selectedRoleUser) return <TrainerCenter key={`shadow-training-${selectedRoleUser}`} />;
    if (shadowMode === 'student' && selectedRoleUser) return <StudentPortal key={`shadow-student-${selectedRoleUser}`} />;
    if (['supervisor','hr','training','student'].includes(shadowMode) && !selectedRoleUser) return <div className="flex min-h-[60vh] items-center justify-center bg-[#070d17] p-6 text-center text-slate-400"><div><Eye className="mx-auto mb-3 h-10 w-10 text-violet-300"/><div className="text-lg font-black text-white">Select a {shadowMode === 'training' ? 'trainer' : shadowMode} account above</div><div className="mt-1 text-sm">Pathfinder will load that user's actual account context inside the selected role workspace.</div></div></div>;
    if (shadowMode === 'client' && selectedClient) return <ClientCenter key={`shadow-client-${selectedClient}`} />;
    if (shadowMode === 'client') return <div className="flex min-h-[70vh] items-center justify-center bg-[#070d17] p-6 text-center text-slate-400"><div><Building2 className="mx-auto mb-3 h-10 w-10 text-blue-300"/><div className="text-lg font-black text-white">Select a client account above</div><div className="mt-1 text-sm">The full client portal will replace this workspace for shadow testing.</div></div></div>;
    return null;
  }, [shadowMode, selectedClient, selectedOfficer, selectedRoleUser]);

  if (shadowMode) return <div className="min-h-full bg-[#070d17]"><AdminShadowBar mode={shadowMode} clients={clients} selectedClient={selectedClient} officers={officers} selectedOfficer={selectedOfficer} roleAccounts={roleAccounts} selectedRoleUser={selectedRoleUser} onMode={enterShadow} onClient={chooseClient} onOfficer={chooseOfficer} onRoleUser={chooseRoleUser} onExit={exitShadow}/>{shadowContent}</div>;

  return (
    <UnifiedCenter
      eyebrow="Master Administration"
      title="Admin Center"
      description="Administration and role-specific tools in one workspace. Preview any role when you need to verify exactly what that user experience looks like."
      sections={masterSections}
      defaultSection="admin"
      queryParam="admin_center"
      headerAction={section => (
        <details className="relative">
          <summary className="flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-cyan-700/70 bg-cyan-950/30 px-2.5 text-[9px] font-black text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-900/40">
            <Eye className="h-3 w-3"/>PREVIEW AS
          </summary>
          <div className="absolute right-0 top-9 z-[2000] w-44 overflow-hidden rounded-lg border border-slate-600 bg-[#0b1725] p-1.5 shadow-2xl">
            {[...masterSections.filter(item => item.id !== 'admin'), { id: 'student', label: 'Student', icon: GraduationCap }].filter((item, index, rows) => rows.findIndex(row => row.id === item.id) === index).map(item => (
              <button key={item.id} type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); enterShadow(item.id); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[10px] font-black transition hover:bg-cyan-950/60 hover:text-cyan-200 ${section === item.id ? 'bg-slate-800 text-white' : 'text-slate-300'}`}>
                <item.icon className="h-3.5 w-3.5"/>{item.label}
              </button>
            ))}
          </div>
        </details>
      )}
    >
      {section => {
        const mirror = section === 'cad' ? <CADCenter embedded /> : section === 'officer' ? <OfficerCenter embedded /> : section === 'supervisor' ? <AdminSupervisorToolsOnly /> : section === 'hr' ? <HRCenter embedded /> : section === 'training' ? <TrainerCenter embedded /> : section === 'client' ? <ClientCenter embedded /> : <AdministrationToolsOnly />;
        return <div className="min-w-0">{mirror}</div>;
      }}
    </UnifiedCenter>
  );
}