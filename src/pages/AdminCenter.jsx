import SupervisorScheduleWorkspace from '@/components/SupervisorScheduleWorkspace';
import AdminSupportStaffClock from './AdminSupportStaffClock';
import SchedulingWorkspace from '@/components/admin/workspaces/SchedulingWorkspace';
import AssetsWorkspace from '@/components/admin/workspaces/AssetsWorkspace';
import ManageClients from './ManageClients';
import AdminOperationsWorkbench from '@/components/AdminOperationsWorkbench';
import { previewAccountType, previewDisplayName } from '@/utils/previewIdentity';
import { comparePersonnel } from '@/utils/rankPolicy';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, Briefcase, Building2, Calendar, ClipboardCheck, ClipboardList, Eye, GraduationCap, MessageCircle, Radio, Settings, Shield, Users } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import AdminUserPreviewPicker from '@/components/AdminUserPreviewPicker';
import CenterToolSection from '@/components/CenterToolSection';
import AdminDashboard from './AdminDashboard';
import AdminAnalytics from './AdminAnalytics';
import AdminLocationTracker from './AdminLocationTracker';
import AdminGeofenceAlerts from './AdminGeofenceAlerts';
import AdminAutoDispatchControls from './AdminAutoDispatchControls';
import AdminOfficerManagement from './AdminOfficerManagement';
import AdminUsers from './AdminUsers';
import AdminLocations from './AdminLocations';
import AdminReports from './AdminReports';
import AdminClientReports from './AdminClientReports';
import AdminSupervisorReports from './AdminSupervisorReports';
import AdminConfidentialReports from './AdminConfidentialReports';
import AdminComplaints from './AdminComplaints';
import AdminCommendations from './AdminCommendations';
import AdminClientFeedback from './AdminClientFeedback';
import AdminAnnouncements from './AdminAnnouncements';
import AdminPortalSettings from './AdminPortalSettings';
import PathfinderReports from './Reports';
import CADCenter from './CADCenter';
import OfficerCenter from './OfficerCenter';
import SupervisorCenter from './SupervisorCenter';
import SupervisorFieldOversight from './SupervisorFieldOversight';
import SupervisorOverview from './SupervisorOverview';
import SupervisorShiftHandover from './SupervisorShiftHandover';
import SupervisorTasks from './SupervisorTasks';
import SupervisorCallOuts from './SupervisorCallOuts';
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
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { isClientAccount } from '@/lib/directoryUtils';
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
  { id: 'people', label: 'Personnel & Accounts', description: 'Officer command, availability, CAD controls and account access', icon: Users },
  { id: 'schedule', label: 'Scheduling & Coverage', description: 'Officer shifts, fleet assignments, duty supervisors, staffing plans and bids', icon: Calendar },
  { id: 'supporttime', label: 'Support Clock In', description: 'Support and administrative staff time', icon: Calendar },
  { id: 'assets', label: 'Company Assets', description: 'Vehicles, equipment and maintenance', icon: Briefcase },
  { id: 'sites', label: 'Sites & Patrol', description: 'Locations, boundaries, dispatch rules, post orders and patrol requirements', icon: Building2 },
  { id: 'reports', label: 'Reports & Quality', description: 'Operational reports, complaints, commendations and feedback', icon: ClipboardList },
  { id: 'communications', label: 'Announcements', description: 'Company announcements and staff communications', icon: MessageCircle },
  { id: 'system', label: 'System Settings', description: 'Portal access and application settings', icon: Settings },
];



const ADMIN_SUPERVISOR_SECTIONS = [
  { id: 'overview', label: 'Overview & Alerts', description: 'Priority alerts, work queue and supervisor command status', icon: Activity },
  { id: 'calendar', label: 'Duty Supervisor Coverage', description: 'Company duty supervisors and coverage areas', icon: Calendar },
  { id: 'callouts', label: 'Officer Call-Outs', description: 'Record an officer absence and update the schedule', icon: ClipboardCheck },
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

function AdminInlineFunctions({ tools, queryParam, defaultTool }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(queryParam);
  const rawRequested=queryParam==='admin_people_tool'&&['chain','cadpersonnel'].includes(raw)?'availability':raw;
  const requested = queryParam === 'admin_site_ops_tool' && ['qr','postorders','control'].includes(rawRequested) ? 'operations' : queryParam === 'admin_location_dispatch_tool' && rawRequested === 'geofence' ? 'locations' : rawRequested;
  const initial = requested && tools.some(item => item.id === requested) ? requested : (defaultTool || tools[0]?.id);
  const [activeId, setActiveId] = useState(initial);

  useEffect(() => {
    const rawValue = new URLSearchParams(window.location.search).get(queryParam);
    const rawCurrent=queryParam==='admin_people_tool'&&['chain','cadpersonnel'].includes(rawValue)?'availability':rawValue;
    const current = queryParam === 'admin_site_ops_tool' && ['qr','postorders','control'].includes(rawCurrent) ? 'operations' : queryParam === 'admin_location_dispatch_tool' && rawCurrent === 'geofence' ? 'locations' : rawCurrent;
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
 return <AdminInlineFunctions queryParam="admin_people_tool" defaultTool="availability" tools={[
  {id:'availability',label:'Personnel & Command',component:AdminOfficerManagement},
  {id:'users',label:'Accounts & Access',component:AdminUsers},
  {id:'clients',label:'Client Accounts',component:ManageClients},
 ]}/>;
}
function AdminSchedulingCoverageHub(){return <SchedulingWorkspace/>;}

function AdminLocationWorkspace() {
 const [showAlerts, setShowAlerts] = useState(() => new URLSearchParams(window.location.search).get('admin_location_dispatch_tool') === 'geofence');
 return <div className="space-y-3">
  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
   <button type="button" aria-expanded={showAlerts} onClick={() => setShowAlerts(value => !value)} className="min-h-10 rounded-lg border border-cyan-700 px-3 text-sm font-bold text-cyan-200">{showAlerts ? 'Hide boundary alerts' : 'Review boundary alerts'}</button>
   <p className="mt-2 text-xs text-slate-400">Edit site boundaries in the location record. Review active and acknowledged boundary alerts here.</p>
   {showAlerts && <AdminGeofenceAlerts embedded />}
  </div>
  <AdminLocations />
 </div>;
}

function AdminLocationDispatchHub() {
  return <AdminInlineFunctions queryParam="admin_location_dispatch_tool" defaultTool="locations" tools={[
    { id: 'tracker', label: 'Live Tracker', component: AdminLocationTracker },
    { id: 'autodispatch', label: 'Auto Dispatch', component: AdminAutoDispatchControls },
    { id: 'locations', label: 'Manage Locations', component: AdminLocationWorkspace },
  ]} />;
}

function AdminSiteOperationsHub() {
  return <AdminInlineFunctions queryParam="admin_site_ops_tool" tools={[
    { id: 'location', label: 'Location & Dispatch', component: AdminLocationDispatchHub },
    { id: 'operations', label: 'Site Operations', component: AdminOperationsWorkbench },
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

function AdminCommunicationsHub(){return <AdminAnnouncements embedded/>;}

function AdminSupervisorToolsOnly() {
  return <UnifiedCenter eyebrow="Supervisor" title="Supervisor" description="Complete supervisor tools for administrators, without the personal Officer Workspace." sections={ADMIN_SUPERVISOR_SECTIONS} defaultSection="overview" queryParam="admin_supervisor_section" embedded>
    {section => {
      if (section === 'overview') return <SupervisorOverview />;
      if (section === 'callouts') return <SupervisorCallOuts />;
      if (section === 'calendar') return <SupervisorScheduleWorkspace/>;
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
        if (section === 'supporttime') return <AdminSupportStaffClock/>;
        if (section === 'schedule') return <AdminSchedulingCoverageHub />;
        if (section === 'assets') return <AssetsWorkspace/>;
        if (section === 'system') return <AdminPortalSettings/>;
        if (section === 'sites') return <AdminSiteOperationsHub />;
        if (section === 'reports') return <AdminReportsQualityHub />;
        if (section === 'communications') return <AdminCommunicationsHub />;
        return <AdminDashboard />;
      }}
    </UnifiedCenter>
  );
}

export default function AdminCenter() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oldTool=params.get('admin_site_ops_tool')||params.get('admin_site_assets_tool');
    if(params.get('admin_schedule_tool')==='supportclock'){params.set('admin_ops_section','supporttime');params.delete('admin_schedule_tool');}
    const oldCalendar=params.get('admin_supervisor_tool');
    if(params.get('admin_supervisor_section')==='myschedule'||['myschedule','dutytimeline','dutyschedule'].includes(oldCalendar)){params.set('admin_supervisor_section','calendar');params.set('duty_view',oldCalendar==='myschedule'?'personal':'coverage');params.delete('admin_supervisor_tool');}

    if(oldTool==='equipment'){params.set('admin_ops_section','assets');params.set('admin_asset_tool','equipment');}
    if(params.get('admin_ops_section')==='communications'&&params.get('admin_communications_tool')==='requests'){params.set('admin_ops_section','schedule');params.set('admin_schedule_tool','requests');}
    if(params.get('admin_ops_section')!=='coverage'){
      const next=window.location.pathname+'?'+params.toString();
      if(next!==window.location.pathname+window.location.search){window.history.replaceState({},'',next);window.dispatchEvent(new PopStateEvent('popstate'));}
      return;
    }
    params.set('admin_center','admin');
    params.set('admin_ops_section','people');
    params.set('admin_people_tool','availability');
    window.history.replaceState({},'',window.location.pathname+'?'+params.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const queryClient = useQueryClient();
  const { data: signedInUser } = useQuery({ queryKey: ['adminCenterSignedInUser'], queryFn: () => base44.auth.me(), staleTime: 60000 });
  const navigate = useNavigate();
  const [shadowMode, setShadowMode] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [previewPeople, setPreviewPeople] = useState([]);
  const [selectedRoleUser, setSelectedRoleUser] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const signedInRoles = new Set([signedInUser?.role, ...(Array.isArray(signedInUser?.additional_roles) ? signedInUser.additional_roles : signedInUser?.additional_roles ? [signedInUser.additional_roles] : [])].filter(Boolean).map(value => String(value).toLowerCase()));
  const masterSections = MASTER_SECTIONS.filter(item => item.id !== 'training' || signedInRoles.has('admin') || signedInRoles.has('trainer') || signedInRoles.has('full_access'));

  const canPreview = signedInRoles.has('admin') || signedInRoles.has('full_access');
  useEffect(() => {
    // Account preview is scoped to Admin Center; do not leak it into normal navigation.
    return () => {
      setClientPreviewId('');
      setOfficerPreviewId('');
      queryClient.removeQueries({ predicate: query => !['adminCenterSignedInUser', 'adminPreviewPeople'].includes(String(query.queryKey[0] || '')) });
    };
  }, [queryClient]);
  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    setPreviewLoading(true);
    setPreviewError('');
    Promise.all([listDirectoryUsers('-last_updated', 1000), listDirectoryLocations('site_name', 1000)])
      .then(([people, locations]) => {
        if (!active) return;
        const unique = new Map();
        for (const person of people || []) {
          if (!person?.id) continue;
          const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || person.full_name || person.email || 'Unnamed User';
          const assignedLocations = [...new Set([
            ...(Array.isArray(person.assigned_locations) ? person.assigned_locations : []),
            ...(person.assigned_location ? [person.assigned_location] : []),
            ...(locations || []).filter(location => String(location.assigned_client_email || '').toLowerCase() === String(person.email || '').toLowerCase()).map(location => location.site_name),
          ].filter(Boolean))];
          unique.set(String(person.id), { ...person, assigned_locations: assignedLocations, assigned_location: person.assigned_location || assignedLocations[0] || '', __label: name + ' — ' + (person.email || '') });
        }
        const rows = [...unique.values()].sort(comparePersonnel);
        setPreviewPeople(rows);
      }).catch(() => { if (active) setPreviewError('Could not load users. Please retry.'); })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [canPreview, previewRetry]);

  const choosePreviewUser = id => {
    if (!canPreview) return;
    const profile = previewPeople.find(person => String(person.id) === String(id));
    if (!profile) return;
    const roles = new Set([profile.role, ...(Array.isArray(profile.additional_roles) ? profile.additional_roles : profile.additional_roles ? [profile.additional_roles] : [])].filter(Boolean).map(value=>String(value).toLowerCase()));
    const supervisorRanks = new Set(['corporal','sergeant','first sergeant','lieutenant','lt','captain','major','lt colonel','lieutenant colonel','lt col','colonel']);
    const rank = String(profile.rank || '').trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');
    const mode = isClientAccount(profile) ? 'client' : roles.has('admin') || roles.has('full_access') ? 'admin'
      : roles.has('student') || String(profile.user_type || '').toLowerCase() === 'student' ? 'student'
      : profile.is_supervisor || roles.has('supervisor') || supervisorRanks.has(rank) ? 'supervisor'
      : roles.has('dispatch') || roles.has('dispatcher') ? 'cad'
      : roles.has('hr') ? 'hr'
      : roles.has('trainer') || roles.has('training') ? 'training' : 'officer';
    setClientPreviewId('');
    setOfficerPreviewId('');
    if (mode === 'client') setClientPreviewId(profile.id, { ...profile, __client_preview: true, __auth_admin_id: signedInUser.id });
    else setOfficerPreviewId(profile.id, { ...profile, __officer_preview: true, __role_preview: mode, __auth_admin_id: signedInUser.id });
    setSelectedClient(mode === 'client' ? profile.id : '');
    setSelectedOfficer(mode === 'officer' ? profile.id : '');
    setSelectedRoleUser(!['client','officer'].includes(mode) ? profile.id : '');
    // Reset identity-dependent cached results before mounting the selected account.
    queryClient.removeQueries({ predicate: query => !['adminCenterSignedInUser', 'adminPreviewPeople'].includes(String(query.queryKey[0] || '')) });
    setShadowMode(mode);
  };

  const exitShadow = () => {
    setClientPreviewId('');
    setSelectedClient('');
    setOfficerPreviewId('');
    setSelectedOfficer('');
    setSelectedRoleUser('');
    queryClient.removeQueries({ predicate: query => !['adminCenterSignedInUser', 'adminPreviewPeople'].includes(String(query.queryKey[0] || '')) });
    setShadowMode('');
    navigate({ pathname: window.location.pathname, search: '?admin_center=admin' }, { replace: true });
  };

  const shadowContent = useMemo(() => {
    if (shadowMode === 'admin' && selectedRoleUser) return <AdminDashboard key={`shadow-admin-${selectedRoleUser}`} />;
    if (shadowMode === 'cad' && selectedRoleUser) return <CADCenter key={`shadow-cad-${selectedRoleUser}`} />;
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

  const selectedPreviewId = selectedClient || selectedOfficer || selectedRoleUser;
  const currentPreview = previewPeople.find(person => String(person.id) === String(selectedPreviewId));
  const previewRoles = new Set([currentPreview?.role, ...(Array.isArray(currentPreview?.additional_roles) ? currentPreview.additional_roles : [])].filter(Boolean).map(value => String(value).toLowerCase()));
  const previewRank = String(currentPreview?.rank || '').trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');
  const previewModes = currentPreview ? (isClientAccount(currentPreview) ? ['client'] : previewRoles.has('student') || currentPreview.user_type === 'student' ? ['student'] : [
    ...(previewRoles.has('admin') || previewRoles.has('full_access') ? ['admin'] : []),
    ...(currentPreview.is_supervisor || previewRoles.has('supervisor') || ['corporal','sergeant','first sergeant','lieutenant','lt','captain','major','lt colonel','lieutenant colonel','lt col','colonel'].includes(previewRank) ? ['supervisor','officer','cad'] : []),
    ...(previewRoles.has('officer') ? ['officer','cad'] : []),
    ...(previewRoles.has('dispatch') || previewRoles.has('dispatcher') || previewRoles.has('cad_access') ? ['cad'] : []),
    ...(previewRoles.has('hr') ? ['hr'] : []),
    ...(previewRoles.has('trainer') || previewRoles.has('training') ? ['training'] : []),
  ]) : [];
  const availablePreviewModes = [...new Set(previewModes.length ? previewModes : ['officer'])];
  const switchPreviewMode = mode => {
    if (!currentPreview || !availablePreviewModes.includes(mode)) return;
    setShadowMode(mode);
    setSelectedClient(mode === 'client' ? currentPreview.id : '');
    setSelectedOfficer(mode === 'officer' ? currentPreview.id : '');
    setSelectedRoleUser(!['client','officer'].includes(mode) ? currentPreview.id : '');
    setClientPreviewId('');
    setOfficerPreviewId('');
    if (mode === 'client') setClientPreviewId(currentPreview.id, { ...currentPreview, __client_preview: true, __auth_admin_id: signedInUser?.id });
    else setOfficerPreviewId(currentPreview.id, { ...currentPreview, __officer_preview: true, __role_preview: mode, __auth_admin_id: signedInUser?.id });
    queryClient.removeQueries({ predicate: query => !['adminCenterSignedInUser', 'adminPreviewPeople'].includes(String(query.queryKey[0] || '')) });
  };
  const previewPicker = <AdminUserPreviewPicker users={previewPeople} selectedId={selectedPreviewId} loading={previewLoading} error={previewError} onSelect={choosePreviewUser} onRetry={()=>setPreviewRetry(value=>value+1)} />;
  if (shadowMode) return <div className="min-h-full bg-[#070d17]">
    <div className="sticky top-0 z-[70] flex flex-wrap items-center gap-3 border-b border-cyan-800 bg-[#081522] p-3 text-white">
      <Eye className="h-4 w-4 text-cyan-300"/>
      <div className="min-w-0 flex-1"><div className="text-xs text-cyan-300">Account preview</div><div className="break-words text-sm font-bold">{previewAccountType(currentPreview)} Account — {previewDisplayName(currentPreview)}</div></div>
      {availablePreviewModes.length > 1 && <label className="flex items-center gap-2 text-xs text-slate-300">Assigned workspace <select aria-label="Preview assigned workspace" value={shadowMode} onChange={event => switchPreviewMode(event.target.value)} className="rounded border border-cyan-700 bg-[#07111f] px-2 py-2 text-white">{availablePreviewModes.map(mode => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select></label>}
      {previewPicker}
      <button type="button" onClick={exitShadow} className="min-h-10 rounded-lg border border-red-700 px-3 text-sm text-red-200">Exit preview</button>
    </div>{shadowContent}</div>;

  return (
    <UnifiedCenter
      eyebrow="Master Administration"
      title="Admin Center"
      description="Administration and role-specific tools in one workspace. Choose a user in Preview as user to inspect their account workspace."
      sections={masterSections}
      defaultSection="admin"
      queryParam="admin_center"
      headerAction={() => canPreview ? previewPicker : null}
    >
      {section => {
        const mirror = section === 'cad' ? <CADCenter embedded /> : section === 'officer' ? <OfficerCenter embedded /> : section === 'supervisor' ? <AdminSupervisorToolsOnly /> : section === 'hr' ? <HRCenter embedded /> : section === 'training' ? <TrainerCenter embedded /> : section === 'client' ? <ClientCenter embedded /> : <AdministrationToolsOnly />;
        return <div className="min-w-0">{mirror}</div>;
      }}
    </UnifiedCenter>
  );
}