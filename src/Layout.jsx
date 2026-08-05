import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertTriangle, Award, BarChart3, Bell, BookOpen, Bot, Briefcase,
  Building2, Calendar, CalendarClock, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCheck, ClipboardList, Clock3, DollarSign, DoorOpen, FileText,
  FileWarning, Gauge, GraduationCap, Layers, LogOut, Map, MapPin, Menu,
  MessageCircle, Package, Radio, Search, Settings, Shield, ShieldCheck,
  Siren, UserCheck, UserX, Users, Wrench, X
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from './utils';
import { stopAllAlerts } from '@/utils/alertUtils';

const CENTER_CONFIG = {
  cad: {
    label: 'CAD Center',
    icon: Radio,
    groups: [
      { label: 'Operations', items: [
        ['Command Dashboard', 'CommandDashboard', Gauge],
        ['Dispatch Center', 'DispatchCenter', Radio],
        ['Live Map', 'Navigation', Map],
        ['Field Unit', 'FieldUnitView', Shield],
      ]},
      { label: 'Intelligence', items: [
        ['Call History', 'CallHistory', Clock3],
        ['BOLO / Alerts', 'BOLOAlerts', FileWarning],
        ['Records AI', 'RecordsAssistant', Bot],
      ]},
      { label: 'Administration', fullAccessOnly: true, items: [
        ['Personnel', 'Personnel', Users],
        ['CAD Reports', 'PathfinderReports', BarChart3],
        ['Admin Control', 'AdminPortal', Activity],
      ]},
    ],
  },
  officer: {
    label: 'Officer Center',
    icon: Shield,
    groups: [
      { label: 'Dashboard', items: [
        ['Dashboard', 'Dashboard', Gauge],
        ['My Profile', 'OfficerProfile', UserCheck],
        ['My Performance', 'MyPerformanceAnalytics', BarChart3],
        ['Officer Analytics', 'OfficerAnalytics', BarChart3],
        ['Officer Inbox', 'OfficerInbox', MessageCircle],
        ['Officer Mobile', 'OfficerMobile', Shield],
        ['Availability', 'OfficerAvailability', CalendarClock],
        ['Officer Payroll', 'OfficerPayroll', DollarSign],
      ]},
      { label: 'Schedule', items: [
        ['Time Clock', 'TimeClock', Clock3],
        ['My Schedule', 'Schedule', Calendar],
        ['Open Shifts', 'OpenShifts', Briefcase],
        ['Time Requests', 'TimeRequests', CalendarClock],
        ['Payroll Dates', 'PayrollDates', DollarSign],
      ]},
      { label: 'Reports', items: [
        ['Daily Activity Reports', 'DailyActivityReports', ClipboardList],
        ['Incident Reports', 'IncidentReports', AlertTriangle],
        ['Maintenance', 'MaintenanceReports', Wrench],
        ['Open Door Reports', 'OpenDoorReports', DoorOpen],
        ['Confidential Report', 'ConfidentialReport', ShieldCheck],
        ['QR Patrol Scan', 'QRPatrolScan', MapPin],
        ['VA Trespass Notices', 'VATrespassNotices', UserX],
        ['VA Criminal Complaint', 'VACriminalComplaints', Shield],
        ['MD Trespass Notices', 'MDTrespassNotices', UserX],
        ['MD Criminal Complaint', 'MDCriminalComplaints', Shield],
      ]},
      { label: 'Communication', items: [
        ['Team Chat', 'TeamChat', MessageCircle],
        ['Announcements', 'Announcements', Bell],
        ['Expense Reports', 'ExpenseReports', DollarSign],
      ]},
      { label: 'Resources', items: [
        ['Rank Duties', 'RankDuties', Shield],
        ['Post Orders', 'PostOrders', BookOpen],
        ['Training & Compliance', 'OfficerTraining', GraduationCap],
        ['Shift Handover', 'ShiftHandover', ClipboardCheck],
        ['Shift Reports', 'ShiftReports', ClipboardList],
        ['Summons', 'Summons', FileText],
        ['VA Contact Sheet', 'VAContactSheet', Users],
      ]},
    ],
  },
  supervisor: {
    label: 'Supervisor Center',
    icon: ClipboardCheck,
    groups: [
      { label: 'Supervisor Portal', items: [
        ['My Action Items', 'SupervisorTasks', ClipboardList],
        ['My Daily Code', 'SupervisorDailyCode', ShieldCheck],
        ['Rank Structure', 'RankStructure', Shield],
        ['Division Directory', 'DivisionDirectory', Users],
        ['Performance Review Tasks', 'SupervisorPerformanceReview', ClipboardCheck],
        ['Officer Inspections', 'SupervisorInspections', ClipboardCheck],
        ['Write-Up Reports', 'SupervisorWriteUps', FileWarning],
        ['Use-of-Force Reports', 'SupervisorUseOfForce', AlertTriangle],
        ['File Complaints', 'SupervisorComplaints', AlertTriangle],
        ['Call-Out Management', 'SupervisorCallOuts', UserCheck],
        ['Supervisor Chat', 'SupervisorChat', MessageCircle],
        ['Supervisor Directory', 'SupervisorDirectory', Users],
      ]},
    ],
  },
  admin: {
    label: 'Admin Center',
    icon: Settings,
    groups: [
      { label: 'Command & Analytics', items: [
        ['Admin Dashboard', 'AdminDashboard', Gauge],
        ['Company Analytics', 'AdminAnalytics', BarChart3],
        ['Location Tracker', 'AdminLocationTracker', MapPin],
        ['Geofence Alerts', 'AdminGeofenceAlerts', AlertTriangle],
        ['Active Tracker', 'ActiveTracker', Activity],
      ]},
      { label: 'Reports & Quality', items: [
        ['All Reports', 'AdminReports', ClipboardList],
        ['Client Reports', 'AdminClientReports', FileText],
        ['Supervisor Reports', 'AdminSupervisorReports', UserCheck],
        ['Confidential Reports', 'AdminConfidentialReports', ShieldCheck],
        ['Complaints', 'AdminComplaints', AlertTriangle],
        ['Commendations', 'AdminCommendations', Award],
      ]},
      { label: 'Scheduling', items: [
        ['Scheduling', 'AdminScheduling', Calendar],
        ['Planned Shifts', 'AdminPlannedShifts', Calendar],
        ['Shift Bids', 'AdminShiftBids', Briefcase],
      ]},
      { label: 'Operations Management', items: [
        ['Locations', 'AdminLocations', Building2],
        ['Equipment', 'AdminEquipment', Package],
        ['Documents', 'AdminDocuments', FileText],
        ['Post Orders', 'AdminPostOrders', BookOpen],
        ['Announcements', 'AdminAnnouncements', Bell],
        ['Messages', 'AdminMessages', MessageCircle],
        ['Notifications', 'AdminNotifications', Bell],
        ['Special Requests', 'AdminSpecialRequests', CalendarClock],
        ['Portal Settings', 'AdminPortalSettings', Settings],
        ['Client Feedback', 'AdminClientFeedback', Award],
      ]},
      { label: 'Vendor Management', items: [
        ['Vendor Dashboard', 'VendorDashboard', Gauge],
        ['Vendor Tenants', 'VendorTenants', Building2],
        ['Vendor Users', 'VendorUsers', Users],
        ['Vendor Audit', 'VendorAudit', ClipboardCheck],
      ]},
      { label: 'QR Patrol', items: [
        ['QR Checkpoints', 'AdminQRCheckpoints', MapPin],
        ['QR Print Manager', 'AdminQRPrintManager', FileText],
        ['QR Patrol Reports', 'AdminQRReports', BarChart3],
      ]},
    ],
  },
  training: {
    label: 'Trainer Center',
    icon: GraduationCap,
    groups: [
      { label: 'Training', items: [
        ['Training Creation', 'AdminTraining', GraduationCap],
        ['Training & Compliance', 'AdminTrainingCompliance', ShieldCheck],
        ['Compliance Tracker', 'TrainingComplianceTracker', BarChart3],
        ['Certification Alerts', 'AdminCertificationAlerts', Bell],
        ['Manage Students', 'ManageStudents', Users],
        ['Training Records', 'TrainingRecords', BookOpen],
      ]},
    ],
  },
  hr: {
    label: 'HR Center',
    icon: Users,
    groups: [
      { label: 'People Operations', items: [
        ['Manage Employees', 'ManageCompanyEmployees', Briefcase],
        ['Pending Users', 'AdminUsers', Users],
        ['Officer Roster & Management', 'AdminOfficerRoster', Users],
        ['Manage Time Entries', 'ManageTimeEntries', Clock3],
        ['Support Staff Clock', 'AdminSupportStaffClock', Clock3],
      ]},
      { label: 'Leave & Performance', items: [
        ['PTO Approval', 'AdminPTOApproval', ClipboardCheck],
        ['PTO Review', 'AdminPTOReview', ClipboardList],
        ['Manual PTO', 'AdminManualPTO', CalendarClock],
        ['PTO Loss Report', 'AdminPTOLossReport', AlertTriangle],
        ['Performance Reviews', 'AdminPerformanceReviews', ClipboardCheck],
        ['Divisions', 'AdminDivisions', Layers],
      ]},
    ],
  },
  accounting: {
    label: 'Accounting Center',
    icon: DollarSign,
    groups: [
      { label: 'Accounting', items: [
        ['Payroll Management', 'AccountingPayroll', DollarSign],
        ['Payroll Processing', 'AdminPayroll', DollarSign],
        ['Payroll Configuration', 'AdminPayrollConfig', Settings],
        ['Client Invoices', 'AccountingInvoices', FileText],
        ['Company Profit', 'AccountingProfit', BarChart3],
        ['Tax Liability', 'AccountingTaxLiability', ClipboardList],
        ['W-2 Generator', 'AccountingW2Generator', FileText],
        ['Expense Approval', 'AdminExpenseApproval', ClipboardCheck],
      ]},
    ],
  },
  student: {
    label: 'Student Portal',
    icon: GraduationCap,
    groups: [
      { label: 'Training Portal', items: [
        ['My Training', 'StudentPortal', GraduationCap],
      ]},
    ],
  },
  client: {
    label: 'Client Center',
    icon: Building2,
    groups: [
      { label: 'Client Portal', items: [
        ['Dashboard', 'ClientDashboard', Gauge],
        ['Security Alerts', 'ClientAlerts', AlertTriangle],
        ['Special Requests', 'ClientSpecialRequests', CalendarClock],
        ['Site Supervisors', 'ClientSupervisors', UserCheck],
        ['All Reports', 'ClientReports', FileText],
        ['QR Patrol Reports', 'ClientQRReports', MapPin],
        ['Payroll & Invoicing', 'ClientPayrollReport', DollarSign],
        ['Trespass Management', 'ClientTrespass', UserX],
        ['Site Schedule', 'ClientSchedule', Calendar],
        ['Training Documents', 'ClientDocuments', BookOpen],
        ['Feedback', 'ClientFeedback', Award],
        ['Location Info', 'ClientLocation', MapPin],
      ]},
    ],
  },
};

const PAGE_TO_CENTERS = Object.entries(CENTER_CONFIG).reduce((map, [center, config]) => {
  config.groups.forEach(group => group.items.forEach(([, page]) => {
    map[page] = [...new Set([...(map[page] || []), center])];
  }));
  return map;
}, {});

const FULL_ACCESS_PAGES = new Set(['Personnel', 'PathfinderReports', 'AdminPortal']);

function hasFullAccess(user) {
  return user?.role === 'admin' || normalizedRoles(user).has('full_access');
}

const FULLSCREEN_PAGES = new Set(['Navigation']);

function normalizedRoles(user) {
  return new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
}

function hasRole(user, role) {
  return normalizedRoles(user).has(role);
}

function roleName(user) {
  if (user?.role === 'admin') return 'SYSTEM ADMIN';
  if (user?.role === 'dispatch') return 'DISPATCH';
  if (hasRole(user, 'supervisor')) return 'SUPERVISOR';
  if (hasRole(user, 'hr')) return 'HUMAN RESOURCES';
  if (hasRole(user, 'accounting')) return 'ACCOUNTING';
  if (hasRole(user, 'trainer')) return 'TRAINER';
  if (hasRole(user, 'student')) return 'STUDENT';
  if (hasRole(user, 'officer')) return 'OFFICER';
  return 'AUTHORIZED EMPLOYEE';
}

function allowedCenters(user) {
  const roles = normalizedRoles(user);
  const fullAccess = hasFullAccess(user);
  const centers = [];

  // Portal-only identities are isolated unless they also have Full Access.
  if (!fullAccess && (roles.has('client') || user?.user_type === 'client')) return ['client'];
  if (!fullAccess && roles.has('student')) return ['student'];

  if (fullAccess || user?.role === 'dispatch' || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor')) centers.push('cad');
  if (fullAccess || roles.has('officer')) centers.push('officer');
  if (fullAccess || roles.has('supervisor')) centers.push('supervisor');
  if (fullAccess || roles.has('hr')) centers.push('hr');
  if (fullAccess) centers.push('admin');
  if (fullAccess || roles.has('trainer')) centers.push('training');
  if (fullAccess || roles.has('accounting')) centers.push('accounting');
  if (fullAccess || roles.has('client') || user?.user_type === 'client') centers.push('client');
  if (fullAccess || roles.has('student')) centers.push('student');

  return [...new Set(centers)];
}

function canAccessPage(user, pageName) {
  if (FULL_ACCESS_PAGES.has(pageName)) return hasFullAccess(user);
  const centers = PAGE_TO_CENTERS[pageName];
  if (!centers?.length) return true;
  const available = allowedCenters(user);
  return centers.some(center => available.includes(center));
}

function Sidebar({ collapsed, mobile, user, activeCenter, setActiveCenter, currentPageName, search, setSearch, onCloseMobile }) {
  const availableCenters = allowedCenters(user);
  const center = CENTER_CONFIG[activeCenter] || CENTER_CONFIG.cad;
  const query = search.trim().toLowerCase();
  const groups = center.groups
    .filter(group => !group.fullAccessOnly || hasFullAccess(user))
    .map(group => ({
      ...group,
      items: group.items.filter(([label]) => !query || label.toLowerCase().includes(query)),
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="flex h-full flex-col bg-[#07111f]">
      <div className="border-b border-[#1b3048] px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#315f8e] bg-[#12315a]">
            <Shield className="h-5 w-5 text-[#8cc7ff]" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#07111f] bg-emerald-400" />
          </div>
          {(!collapsed || mobile) && <div className="min-w-0">
            <div className="text-[12px] font-black tracking-[0.16em] text-white">BPS PATHFINDER</div>
            <div className="text-[9px] tracking-[0.16em] text-[#7290ad]">BLACK POINT PROTECTION</div>
          </div>}
        </div>

        {(!collapsed || mobile) && <div className="mt-3 grid grid-cols-2 gap-1.5">
          {availableCenters.map(key => {
            const item = CENTER_CONFIG[key];
            const Icon = item.icon;
            const active = activeCenter === key;
            return <button key={key} onClick={() => setActiveCenter(key)} className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left text-[10px] font-bold transition ${active ? 'border-[#4385c6] bg-[#153b65] text-white' : 'border-[#1c3249] bg-[#0c1a2a] text-[#87a0b8] hover:bg-[#11263d] hover:text-white'}`}>
              <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.label.replace(' Center', '')}</span>
            </button>;
          })}
        </div>}
      </div>

      {(!collapsed || mobile) && <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-md border border-[#1c3249] bg-[#0a1726] px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-[#65819d]" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${center.label}`} className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-[#55708a]" />
        </div>
      </div>}

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map(group => <div key={group.label} className="mb-4">
          {(!collapsed || mobile) && <div className="px-2 pb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#54708f]">{group.label}</div>}
          <div className="space-y-1">
            {group.items.map(([label, page, Icon]) => {
              const active = currentPageName === page;
              return <Link key={page} to={createPageUrl(page)} title={collapsed && !mobile ? label : undefined} onClick={() => onCloseMobile?.()} className={`relative flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 transition ${active ? 'border-[#2f6499] bg-[#14385f] text-white' : 'border-transparent text-[#8ea4bc] hover:border-[#1c3650] hover:bg-[#102239] hover:text-white'} ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
                {active && <span className="absolute bottom-2 left-0 top-2 w-0.5 bg-[#55aaff]" />}
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#7ec1ff]' : 'text-[#6683a0]'}`} />
                {(!collapsed || mobile) && <span className="text-[11px] font-bold leading-tight">{label}</span>}
              </Link>;
            })}
          </div>
        </div>)}
        {groups.length === 0 && (!collapsed || mobile) && <div className="px-3 py-8 text-center text-xs text-[#68829b]">No tools match your search.</div>}
      </nav>

      <div className="border-t border-[#1b3048] p-2">
        {(!collapsed || mobile) && <div className="mb-2 rounded-md border border-[#1c3049] bg-[#0c1828] px-3 py-2">
          <div className="text-[9px] tracking-widest text-[#597491]">{roleName(user)}</div>
          <div className="truncate text-[11px] font-bold text-white">{[user?.rank, user?.last_name].filter(Boolean).join(' ') || user?.full_name || user?.email || 'AUTHORIZED USER'}</div>
          <div className="mt-1 text-[9px] text-emerald-400">● SECURE SESSION</div>
        </div>}
        <button onClick={() => base44.auth.logout('/')} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-[#8399b0] hover:bg-red-950/30 hover:text-red-300 ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
          <LogOut className="h-4 w-4" />{(!collapsed || mobile) && <span className="text-[11px] font-bold">SIGN OUT</span>}
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [outages, setOutages] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [search, setSearch] = useState('');
  const [activeCenter, setActiveCenterState] = useState(() => localStorage.getItem('bps-active-center') || 'cad');

  const setActiveCenter = center => {
    setActiveCenterState(center);
    setSearch('');
    localStorage.setItem('bps-active-center', center);
  };

  useEffect(() => {
    const pageCenter = (PAGE_TO_CENTERS[currentPageName] || []).find(center => allowedCenters(user).includes(center));
    if (pageCenter) setActiveCenter(pageCenter);
  }, [currentPageName, user?.role, JSON.stringify(user?.additional_roles || [])]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = () => base44.entities.SystemOutage.filter({ resolved_at: null }).then(setOutages).catch(() => setOutages([]));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onAlert = event => setActiveAlert(event.detail);
    const onClear = () => setActiveAlert(null);
    window.addEventListener('bps-new-call', onAlert);
    window.addEventListener('bps-alert-cleared', onClear);
    return () => {
      window.removeEventListener('bps-new-call', onAlert);
      window.removeEventListener('bps-alert-cleared', onClear);
    };
  }, []);

  useEffect(() => {
    const available = allowedCenters(user);
    if (!available.includes(activeCenter)) setActiveCenter(available[0] || 'cad');
  }, [user?.role, JSON.stringify(user?.additional_roles || [])]);

  if (!canAccessPage(user, currentPageName)) {
    return <div className="fixed inset-0 flex items-center justify-center bg-[#050a12] px-6 text-white">
      <div className="w-full max-w-md rounded-lg border border-[#294867] bg-[#0b1726] p-8 text-center shadow-2xl">
        <Shield className="mx-auto mb-4 h-10 w-10 text-[#72b7f2]" />
        <h1 className="text-lg font-black uppercase tracking-[0.12em]">Access Restricted</h1>
        <p className="mt-3 text-sm leading-6 text-[#b9c9d8]">Your assigned role does not permit access to this center. Contact an administrator if your duties require this tool.</p>
        <Link to={createPageUrl(allowedCenters(user)[0] === 'cad' ? 'CommandDashboard' : 'Dashboard')} className="mt-6 inline-flex rounded border border-[#4385c6] bg-[#153b65] px-4 py-2 text-xs font-bold text-white hover:bg-[#1d4b7d]">RETURN TO AUTHORIZED CENTER</Link>
      </div>
    </div>;
  }

  if (FULLSCREEN_PAGES.has(currentPageName)) return <div className="h-full w-full bg-[#050a12]">{children}</div>;

  const criticalOutage = outages.some(item => item.severity === 'outage');
  const centerLabel = CENTER_CONFIG[activeCenter]?.label || 'CAD Center';

  return <div className="fixed inset-0 flex overflow-hidden bg-[#050a12] text-white cad-app">
    <aside className="relative hidden flex-col border-r border-[#1c3049] md:flex" style={{ width: collapsed ? 64 : 260, transition: 'width .18s ease' }}>
      <Sidebar collapsed={collapsed} user={user} activeCenter={activeCenter} setActiveCenter={setActiveCenter} currentPageName={currentPageName} search={search} setSearch={setSearch} />
      <button onClick={() => setCollapsed(value => !value)} className="absolute -right-3 top-20 z-40 flex h-8 w-6 items-center justify-center rounded border border-[#294867] bg-[#0b1726] text-[#7892ac] hover:text-white" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>

    <AnimatePresence>{mobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 md:hidden" onClick={() => setMobileOpen(false)}>
      <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} className="h-full w-[290px] border-r border-[#1c3049]" onClick={event => event.stopPropagation()}>
        <Sidebar mobile user={user} activeCenter={activeCenter} setActiveCenter={setActiveCenter} currentPageName={currentPageName} search={search} setSearch={setSearch} onCloseMobile={() => setMobileOpen(false)} />
      </motion.aside>
    </motion.div>}</AnimatePresence>

    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#1c3049] bg-[#08111f] px-3 md:px-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} className="rounded border border-[#294867] p-2 text-[#89a3bd] md:hidden"><Menu className="h-4 w-4" /></button>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.15em] text-white">{centerLabel}</div>
            <div className="text-[9px] tracking-widest text-[#607c98]">UNIFIED OPERATIONS PLATFORM</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#7791aa]">
          {criticalOutage && <span className="hidden rounded border border-red-700/60 bg-red-950/40 px-2 py-1 font-bold text-red-300 sm:block">SYSTEM OUTAGE</span>}
          <span className="font-mono text-[#9fb6cc]">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </header>

      {activeAlert && <div className="flex items-center justify-between border-b border-red-600 bg-red-950 px-4 py-2 text-sm text-red-100">
        <div className="flex items-center gap-2"><Siren className="h-4 w-4 animate-pulse" /><span className="font-bold">{activeAlert.title || 'Priority dispatch alert'}</span></div>
        <button onClick={() => { stopAllAlerts(); setActiveAlert(null); }} className="rounded border border-red-500/50 px-2 py-1 text-xs font-bold hover:bg-red-900">ACKNOWLEDGE</button>
      </div>}

      <main className="min-h-0 flex-1 overflow-auto bg-[#07101b]">{children}</main>
    </section>
  </div>;
}
