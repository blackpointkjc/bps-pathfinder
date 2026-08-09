import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertTriangle, Award, BarChart3, Bell, BookOpen, Bot, Briefcase,
  Building2, Calendar, CalendarClock, Car, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCheck, ClipboardList, Clock3, DollarSign, DoorOpen, FileText,
  FileWarning, Gauge, GraduationCap, Layers, LogOut, Map, MapPin, Menu,
  MessageCircle, Package, Radio, Search, Settings, Shield, ShieldCheck,
  Siren, Trash2, UserCheck, UserX, Users, Wrench, X, GitBranch
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from './utils';
import { playPropertyAlert, stopAllAlerts } from '@/utils/alertUtils';
import GlobalMessageBanner from '@/components/GlobalMessageBanner';
import MandatoryReadGate from '@/components/MandatoryReadGate';
import WelcomeBriefing from '@/components/WelcomeBriefing';
import BackgroundLocationTracker from '@/components/BackgroundLocationTracker';
import AdminClientPreviewBar from '@/components/AdminClientPreviewBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const CENTER_CONFIG = {
  cad: {
    label: 'CAD Center',
    icon: Radio,
    groups: [
      { label: 'Live Operations', items: [
        ['Command Dashboard', 'CommandDashboard', Gauge],
        ['Dispatch Center', 'DispatchCenter', Radio],
        ['Live Map', 'Navigation', Map],
        ['BOLO / Alerts', 'BOLOAlerts', FileWarning],
      ]},
      { label: 'History & Intelligence', items: [
        ['Call History', 'CallHistory', Clock3],
        ['Records AI', 'RecordsAssistant', Bot],
      ]},
      { label: 'CAD Administration', fullAccessOnly: true, items: [
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
      { label: 'Quick Access', items: [
        ['Dashboard', 'Dashboard', Gauge],
        ['Time Clock', 'TimeClock', Clock3],
        ['My Schedule', 'Schedule', Calendar],
        ['Virginia Law', 'VirginiaFieldLawAssistant', BookOpen],
      ]},
      { label: 'Field Tools', items: [
        ['Post Orders', 'PostOrders', BookOpen],
        ['QR Patrol', 'QRPatrolScan', MapPin],
        ['Shift Handover', 'ShiftHandover', ClipboardCheck],
        ['VA Trespass', 'VATrespassNotices', UserX],
        ['VA Complaint', 'VACriminalComplaints', Shield],
        ['VA Summons', 'Summons', FileText],
      ]},
      { label: 'Reports & Requests', items: [
        ['Daily Activity', 'DailyActivityReports', ClipboardList],
        ['Incident Report', 'IncidentReports', AlertTriangle],
        ['Maintenance', 'MaintenanceReports', Wrench],
        ['Open Door', 'OpenDoorReports', DoorOpen],
        ['Confidential', 'ConfidentialReport', ShieldCheck],
        ['Expense Report', 'ExpenseReports', DollarSign],
        ['Time Request', 'TimeRequests', CalendarClock],
      ]},
      { label: 'Schedule & Availability', items: [
        ['Availability', 'OfficerAvailability', CalendarClock],
        ['Open Shifts', 'OpenShifts', Briefcase],
        ['Payroll Dates', 'OfficerPayrollDates', DollarSign],
      ]},
      { label: 'Messages', items: [
        ['Team Chat', 'TeamChat', MessageCircle],
        ['Announcements', 'Announcements', Bell],
      ]},
      { label: 'Profile & Training', items: [
        ['My Profile', 'OfficerProfile', UserCheck],
        ['My Performance', 'MyPerformanceAnalytics', BarChart3],
        ['Training', 'OfficerTraining', GraduationCap],
        ['Rank Structure', 'RankStructure', Shield],
        ['Rank Duties', 'RankDuties', Shield],
      ]},
    ],
  },
  supervisor: {
    label: 'Supervisor Center',
    icon: ClipboardCheck,
    groups: [
      { label: 'Today', items: [
        ['Action Items', 'SupervisorTasks', ClipboardList],
        ['Daily Code', 'SupervisorDailyCode', ShieldCheck],
        ['Call-Outs', 'SupervisorCallOuts', UserCheck],
      ]},
      { label: 'Officer Oversight', items: [
        ['Officer Inspections', 'SupervisorInspections', ClipboardCheck],
        ['Performance Reviews', 'SupervisorPerformanceReview', ClipboardCheck],
        ['Write-Ups', 'SupervisorWriteUps', FileWarning],
        ['Use of Force', 'SupervisorUseOfForce', AlertTriangle],
        ['Complaints', 'SupervisorComplaints', AlertTriangle],
      ]},
      { label: 'People & Communication', items: [
        ['Company Directory', 'DivisionDirectory', Users],
        ['Supervisor Chat', 'SupervisorChat', MessageCircle],
        ['Rank Structure', 'RankStructure', Shield],
      ]},
    ],
  },
  admin: {
    label: 'Admin Center',
    icon: Settings,
    groups: [
      { label: 'Command', items: [
        ['Admin Dashboard', 'AdminDashboard', Gauge],
        ['Company Analytics', 'AdminAnalytics', BarChart3],
        ['Location Tracker', 'AdminLocationTracker', MapPin],
        ['Geofence Alerts', 'AdminGeofenceAlerts', AlertTriangle],
      ]},
      { label: 'Scheduling & Fleet', items: [
        ['Scheduling', 'AdminScheduling', Calendar],
        ['Fleet Assignments', 'FleetVehicleAssignments', Car],
        ['Availability Approvals', 'AdminOfficerManagement', UserCheck],
        ['Planned Shifts', 'AdminPlannedShifts', Calendar],
        ['Shift Bids', 'AdminShiftBids', Briefcase],
      ]},
      { label: 'Personnel & Sites', items: [
        ['Users & Accounts', 'AdminUsers', Users],
        ['Platoon & Chain', 'AdminPlatoonAssignments', GitBranch],
        ['Locations', 'AdminLocations', Building2],
        ['Equipment', 'AdminEquipment', Package],
        ['Post Orders', 'AdminPostOrders', BookOpen],
      ]},
      { label: 'Reports & Quality', items: [
        ['All Reports', 'AdminReports', ClipboardList],
        ['Client Reports', 'AdminClientReports', FileText],
        ['Supervisor Reports', 'AdminSupervisorReports', UserCheck],
        ['Confidential Reports', 'AdminConfidentialReports', ShieldCheck],
        ['Complaints', 'AdminComplaints', AlertTriangle],
        ['Commendations', 'AdminCommendations', Award],
        ['Client Feedback', 'AdminClientFeedback', Award],
      ]},
      { label: 'Communications & Requests', items: [
        ['Announcements', 'AdminAnnouncements', Bell],
        ['Notifications', 'AdminNotifications', Bell],
        ['Special Requests', 'AdminSpecialRequests', CalendarClock],
        ['Documents', 'AdminDocuments', FileText],
      ]},
      { label: 'QR Patrol', items: [
        ['QR Checkpoints', 'AdminQRCheckpoints', MapPin],
        ['QR Print Manager', 'AdminQRPrintManager', FileText],
        ['QR Patrol Reports', 'AdminQRReports', BarChart3],
      ]},
      { label: 'System', items: [
        ['Portal Settings', 'AdminPortalSettings', Settings],
      ]},
    ],
  },
  training: {
    label: 'Trainer Center',
    icon: GraduationCap,
    groups: [
      { label: 'Training Management', items: [
        ['Create Training', 'AdminTraining', GraduationCap],
        ['Training Records', 'TrainingRecords', BookOpen],
        ['Manage Students', 'ManageStudents', Users],
      ]},
      { label: 'Compliance & Certifications', items: [
        ['Training Compliance', 'AdminTrainingCompliance', ShieldCheck],
        ['Compliance Tracker', 'TrainingComplianceTracker', BarChart3],
        ['Certification Alerts', 'AdminCertificationAlerts', Bell],
        ['Officer Certifications', 'TrainingManageCompanyEmployees', Users],
      ]},
    ],
  },
  hr: {
    label: 'HR Center',
    icon: Users,
    groups: [
      { label: 'Employees', items: [
        ['Company Employees', 'HRManageCompanyEmployees', Briefcase],
        ['Time Entries', 'ManageTimeEntries', Clock3],
        ['Divisions', 'AdminDivisions', Layers],
      ]},
      { label: 'Leave & Performance', items: [
        ['PTO Approval & History', 'AdminPTOApproval', ClipboardCheck],
        ['Manual PTO', 'AdminManualPTO', CalendarClock],
        ['PTO Loss Report', 'AdminPTOLossReport', AlertTriangle],
        ['Performance Reviews', 'AdminPerformanceReviews', ClipboardCheck],
      ]},
      { label: 'Client Assignments', items: [
        ['Client Accounts & Assignments', 'ManageClients', Building2],
      ]},
    ],
  },
  support: {
    label: 'Support Center',
    icon: Clock3,
    groups: [
      { label: 'Support Operations', items: [
        ['Support Staff Clock', 'AdminSupportStaffClock', Clock3],
      ]},
    ],
  },
  accounting: {
    label: 'Accounting Center',
    icon: DollarSign,
    groups: [
      { label: 'Payroll', items: [
        ['Payroll Center', 'AccountingPayroll', DollarSign],
        ['Payroll Dates', 'PayrollDates', CalendarClock],
      ]},
      { label: 'Billing & Expenses', items: [
        ['Client Invoices', 'AccountingInvoices', FileText],
        ['Bills & Expenses', 'AccountingExpenses', DollarSign],
        ['Expense Approval', 'AdminExpenseApproval', ClipboardCheck],
      ]},
      { label: 'Financial Overview', items: [
        ['Company Profit', 'AccountingProfit', BarChart3],
        ['Tax Liability', 'AccountingTaxLiability', ClipboardList],
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
      { label: 'Overview', items: [
        ['Dashboard', 'ClientDashboard', Gauge],
        ['Security Alerts', 'ClientAlerts', AlertTriangle],
        ['Calls for Service', 'ClientCallHistory', Radio],
      ]},
      { label: 'Site Operations', items: [
        ['Site Schedule', 'ClientSchedule', Calendar],
        ['Site Supervisors', 'ClientSupervisors', UserCheck],
        ['Location Info', 'ClientLocation', MapPin],
        ['Trespass Management', 'ClientTrespass', UserX],
      ]},
      { label: 'Reports & Documents', items: [
        ['All Reports', 'ClientReports', FileText],
        ['QR Patrol Reports', 'ClientQRReports', MapPin],
        ['Training Documents', 'ClientDocuments', BookOpen],
      ]},
      { label: 'Requests & Billing', items: [
        ['Special Requests', 'ClientSpecialRequests', CalendarClock],
        ['Payroll & Invoicing', 'ClientPayrollReport', DollarSign],
        ['Feedback', 'ClientFeedback', Award],
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
const ROOT_PAGES = new Set(['CommandDashboard', 'Dashboard', 'OfficerInbox']);
const CENTER_UNREAD_PAGES = {
  cad: ['DispatchCenter'],
  officer: ['TeamChat', 'Announcements'],
  supervisor: ['SupervisorChat'],
  admin: ['AdminAnnouncements'],
};

function hasFullAccess(user) {
  return user?.role === 'admin' || normalizedRoles(user).has('full_access');
}

const DARK_WORKSPACE_PAGES = new Set([
  'CommandDashboard', 'DispatchCenter', 'CallHistory', 'ClientCallHistory',
  'BOLOAlerts', 'RecordsAssistant', 'VirginiaFieldLawAssistant', 'Personnel', 'PathfinderReports', 'AdminPortal'
]);

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
  if (hasRole(user, 'hr') || String(user?.rank || '').toLowerCase() === 'human resources') return 'HUMAN RESOURCES';
  if (hasRole(user, 'support_staff') || String(user?.rank || '').toLowerCase() === 'support staff') return 'SUPPORT STAFF';
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
  const rank = String(user?.rank || '').toLowerCase();
  if (fullAccess || roles.has('hr') || rank === 'human resources') centers.push('hr');
  if (fullAccess || roles.has('support_staff') || roles.has('trainer') || rank === 'support staff' || rank === 'human resources') centers.push('support');
  if (fullAccess) centers.push('admin');
  if (fullAccess || roles.has('trainer')) centers.push('training');
  if (fullAccess || roles.has('accounting')) centers.push('accounting');
  if (fullAccess || roles.has('client') || user?.user_type === 'client') centers.push('client');
  if (fullAccess || roles.has('student')) centers.push('student');

  return [...new Set(centers)];
}

const CENTER_DEFAULT_PAGE = {
  cad: 'CommandDashboard',
  officer: 'Dashboard',
  supervisor: 'SupervisorTasks',
  admin: 'AdminDashboard',
  training: 'AdminTraining',
  hr: 'HRManageCompanyEmployees',
  support: 'AdminSupportStaffClock',
  accounting: 'AccountingPayroll',
  client: 'ClientDashboard',
  student: 'StudentPortal',
};

function defaultPageForCenter(center) {
  return CENTER_DEFAULT_PAGE[center] || 'CommandDashboard';
}

function defaultPageForUser(user) {
  const centers = allowedCenters(user);
  return defaultPageForCenter(centers[0]);
}

function canAccessPage(user, pageName) {
  if (pageName === 'OfficerInbox') return true;
  if (FULL_ACCESS_PAGES.has(pageName)) return hasFullAccess(user);
  const centers = PAGE_TO_CENTERS[pageName];
  if (!centers?.length) return true;
  const available = allowedCenters(user);
  return centers.some(center => available.includes(center));
}

function pageLabel(pageName) {
  for (const config of Object.values(CENTER_CONFIG)) {
    for (const group of config.groups) {
      const match = group.items.find(([, page]) => page === pageName);
      if (match) return match[0];
    }
  }
  return pageName?.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Pathfinder';
}

function MobileFieldNav({ currentPageName, unreadCounts, onMenu, onReports, activeCenter, centerDestinations = {}, onTabNavigate }) {
  const isAdminCenter = activeCenter === 'admin' || (PAGE_TO_CENTERS[currentPageName] || []).includes('admin');
  const tabs = isAdminCenter
    ? [
        ['CAD', centerDestinations.cad || 'CommandDashboard', Radio],
        ['Admin', centerDestinations.admin || 'AdminDashboard', Settings],
        ['Inbox', 'OfficerInbox', MessageCircle],
      ]
    : [
        ['CAD', centerDestinations.cad || 'CommandDashboard', Radio],
        ['Officer', centerDestinations.officer || 'Dashboard', Shield],
        ['Inbox', 'OfficerInbox', MessageCircle],
      ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[45] flex border-t border-[#29445f] bg-[#07111f]/98 px-1 pt-1 shadow-[0_-10px_30px_rgba(0,0,0,.35)] backdrop-blur md:hidden" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
      {tabs.map(([label, page, Icon]) => {
        const active = currentPageName === page;
        const count = Number(unreadCounts[page]) || 0;
        return <Link key={`${label}-${page}`} to={createPageUrl(page)} onClick={() => onTabNavigate?.(page)} className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg ${active ? 'bg-[#153b65] text-white' : 'text-[#7894af]'}`}>
          <Icon className="h-5 w-5" /><span className="text-[9px] font-black">{label}</span>
          {!!count && <span className="absolute right-[18%] top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">{count > 99 ? '99+' : count}</span>}
        </Link>;
      })}
      {!isAdminCenter && <button type="button" onClick={onReports} className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[#8db1d2]"><ClipboardList className="h-5 w-5" /><span className="text-[8px] font-black">REPORTS</span></button>}
      <button type="button" onClick={onMenu} className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[#8db1d2]"><Menu className="h-5 w-5" /><span className="text-[8px] font-black">ALL</span></button>
    </nav>
  );
}

function Sidebar({ collapsed, mobile, mobileSection, user, activeCenter, setActiveCenter, currentPageName, search, setSearch, unreadCounts = {}, onCloseMobile, onToggleCollapsed, onLogout }) {
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const availableCenters = allowedCenters(user).filter(center => !mobile || ['cad', 'officer', 'supervisor', 'admin'].includes(center));
  const center = CENTER_CONFIG[activeCenter] || CENTER_CONFIG.cad;
  const query = search.trim().toLowerCase();
  const groups = center.groups
    .filter(group => !group.fullAccessOnly || hasFullAccess(user))
    .filter(group => !mobileSection || (mobileSection === 'reports' && activeCenter === 'officer' && group.label === 'Reports'))
    .map(group => ({
      ...group,
      items: group.items.filter(([label]) => !query || label.toLowerCase().includes(query)),
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="flex h-full flex-col border-r border-[#183049] bg-gradient-to-b from-[#071321] via-[#081522] to-[#050d17] shadow-[12px_0_40px_rgba(0,0,0,.25)]">
      <div className="border-b border-[#1b3048] bg-[#091827]/90 px-3 py-4 backdrop-blur-xl">
        <div className={`flex items-center ${collapsed && !mobile ? 'justify-center' : 'gap-3'}`}>
          {(!collapsed || mobile) && <div className="min-w-0 flex-1">
            <div className="text-[12px] font-black tracking-[0.16em] text-white">BPS PATHFINDER</div>
            <div className="text-[9px] tracking-[0.16em] text-[#7290ad]">BLACK POINT PROTECTION</div>
          </div>}
          {mobile && (
            <button type="button" onClick={onCloseMobile} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#31506d] bg-[#13263a] text-white" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          )}
          {!mobile && onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#31506d] bg-[#13263a] text-[#8cc7ff] hover:bg-[#19334e] hover:text-white"
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        {(!collapsed || mobile) && (
          <div className="mt-3">
            <label htmlFor={mobile ? 'mobile-workspace-select' : 'desktop-workspace-select'} className="mb-1.5 block text-[8px] font-bold uppercase tracking-[0.18em] text-[#6886a3]">
              Workspace
            </label>
            <div className="relative">
              {React.createElement(center.icon, { className: 'pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-cyan-300' })}
              <Select value={activeCenter} onValueChange={setActiveCenter}>
                <SelectTrigger
                  id={mobile ? 'mobile-workspace-select' : 'desktop-workspace-select'}
                  className="h-10 w-full border-[#315879] bg-gradient-to-r from-[#102c49] to-[#0c2238] pl-10 text-[11px] font-bold text-white shadow-inner focus:ring-cyan-900/40"
                  aria-label="Select workspace"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#315879] bg-[#0b1928] text-white">
                  {availableCenters.map(key => {
                    const item = CENTER_CONFIG[key];
                    const centerUnread = (CENTER_UNREAD_PAGES[key] || []).reduce((sum, page) => sum + (Number(unreadCounts[page]) || 0), 0);
                    return (
                      <SelectItem key={key} value={key} className="focus:bg-[#15314f] focus:text-white">
                        {item.label}{centerUnread ? ` — ${centerUnread > 99 ? '99+' : centerUnread} unread` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {(!collapsed || mobile) && <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-[#24435f] bg-[#07131f] px-3 py-2.5 shadow-inner transition focus-within:border-cyan-600/70 focus-within:ring-2 focus-within:ring-cyan-900/40">
          <Search className="h-3.5 w-3.5 text-[#65819d]" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${center.label}`} className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-[#55708a]" />
        </div>
      </div>}

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <Link
          to={createPageUrl('OfficerInbox')}
          title={collapsed && !mobile ? 'Inbox' : undefined}
          onClick={() => onCloseMobile?.()}
          className={`relative mb-2 flex min-h-9 items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-all ${currentPageName === 'OfficerInbox' ? 'border-cyan-500/60 bg-gradient-to-r from-[#16466f] to-[#123554] text-white shadow-lg shadow-black/20' : 'border-[#24415e] bg-[#0b1928] text-[#9bb2c9] hover:border-[#356187] hover:bg-[#102b47] hover:text-white'} ${collapsed && !mobile ? 'justify-center px-0' : ''}`}
        >
          <MessageCircle className="h-4 w-4 shrink-0 text-[#7ec1ff]" />
          {(!collapsed || mobile) && <span className="min-w-0 flex-1 text-[11px] font-black leading-tight">INBOX</span>}
          {!!unreadCounts.OfficerInbox && (
            <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
              {unreadCounts.OfficerInbox > 99 ? '99+' : unreadCounts.OfficerInbox}
            </span>
          )}
        </Link>
        {groups.map((group, groupIndex) => <details key={group.label} name={`${activeCenter}-nav-groups`} open={groups.length === 1 || groupIndex === 0} className="mb-2 group">
          {(!collapsed || mobile) ? (
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#7895b2] transition hover:bg-[#0d2135] hover:text-[#9fc7e8]">{group.label}<ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" /></summary>
          ) : (
            <summary className="hidden">{group.label}</summary>
          )}
          <div className="space-y-1 pb-1">
            {group.items.map(([label, page, Icon]) => {
              const active = currentPageName === page;
              return <Link key={page} to={createPageUrl(page)} title={collapsed && !mobile ? label : undefined} onClick={() => onCloseMobile?.()} className={`relative flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-200 ${active ? 'border-[#2f6f9d] bg-[#12304a] text-white shadow-[0_6px_18px_rgba(0,0,0,.18)]' : 'border-transparent text-[#91a8bf] hover:bg-[#0d2236] hover:text-white'} ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
                {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,.55)]" />}
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#7ec1ff]' : 'text-[#6683a0]'}`} />
                {(!collapsed || mobile) && <span className="min-w-0 flex-1 text-[11px] font-bold leading-tight">{label}</span>}
                {!!unreadCounts[page] && (
                  <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-sm">
                    {unreadCounts[page] > 99 ? '99+' : unreadCounts[page]}
                  </span>
                )}
              </Link>;
            })}
          </div>
        </details>)}
        {groups.length === 0 && (!collapsed || mobile) && <div className="px-3 py-8 text-center text-xs text-[#68829b]">No tools match your search.</div>}
      </nav>

      <div className="border-t border-[#1b3048] bg-[#06101b]/90 p-2.5 backdrop-blur">
        {(!collapsed || mobile) && <div className="mb-2 rounded-lg border border-[#25435e] bg-gradient-to-br from-[#0e2033] to-[#0a1726] px-3 py-2.5 shadow-inner">
          <div className="text-[9px] tracking-widest text-[#597491]">{roleName(user)}</div>
          <div className="text-[11px] font-bold leading-tight text-white break-words">{user?.rank || user?.full_name || user?.email || 'AUTHORIZED USER'}</div>
          {user?.rank && user?.last_name && <div className="text-[10px] leading-tight text-[#9fb6cc] break-words">{user.last_name}</div>}
          <div className="mt-1 text-[9px] text-emerald-400">● SECURE SESSION</div>
        </div>}
        <button onClick={() => onLogout?.()} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-[#8399b0] hover:bg-red-950/30 hover:text-red-300 ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
          <LogOut className="h-4 w-4" />{(!collapsed || mobile) && <span className="text-[11px] font-bold">SIGN OUT</span>}
        </button>
        <button type="button" onClick={() => setShowDeleteAccountDialog(true)} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-[#8399b0] hover:bg-red-950/30 hover:text-red-300 ${collapsed && !mobile ? 'justify-center px-0' : ''}`} title="Delete account">
          <Trash2 className="h-4 w-4" />{(!collapsed || mobile) && <span className="text-[11px] font-bold">DELETE ACCOUNT</span>}
        </button>
      </div>

      <AnimatePresence>{showDeleteAccountDialog && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4" onClick={() => setShowDeleteAccountDialog(false)}>
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }} role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-sm rounded-2xl border border-red-800/70 bg-[#0c1724] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-950/70 text-red-300"><Trash2 className="h-5 w-5" /></div>
            <h2 id="delete-account-title" className="mt-4 text-lg font-black text-white">Request account deletion?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a9bbcc]">This will sign you out and submit an account deletion request to Human Resources for processing.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowDeleteAccountDialog(false)} className="min-h-11 flex-1 rounded-lg border border-[#36516b] bg-[#122236] px-4 text-sm font-bold text-white">CANCEL</button>
              <button type="button" onClick={() => {
                setShowDeleteAccountDialog(false);
                toast.success('Your account deletion request has been submitted to HR for processing.');
                window.setTimeout(() => onLogout?.(), 650);
              }} className="min-h-11 flex-1 rounded-lg bg-red-700 px-4 text-sm font-black text-white hover:bg-red-600">CONFIRM</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [activeAlert, setActiveAlert] = useState(null);
  const [propertyAlert, setPropertyAlert] = useState(null);
  const [outages, setOutages] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [search, setSearch] = useState('');
  const [activeCenter, setActiveCenterState] = useState(() => localStorage.getItem('bps-active-center') || 'cad');
  const [unreadCounts, setUnreadCounts] = useState({});
  const mainScrollRef = useRef(null);
  const scrollPositionsRef = useRef({});
  const centerLastPagesRef = useRef(() => ({}));
  if (typeof centerLastPagesRef.current === 'function') {
    try {
      centerLastPagesRef.current = JSON.parse(sessionStorage.getItem('bps-mobile-center-pages') || '{}');
    } catch {
      centerLastPagesRef.current = {};
    }
  }
  const unreadStorageKey = `bps-unread-counts:${String(user?.email || user?.id || 'guest').toLowerCase()}`;

  const setActiveCenter = center => {
    setActiveCenterState(center);
    setSearch('');
    localStorage.setItem('bps-active-center', center);
  };

  const switchCenter = center => {
    const available = allowedCenters(user);
    if (!available.includes(center)) return;

    setActiveCenter(center);
    setMobileSection(null);
    setMobileOpen(false);

    const remembered = centerLastPagesRef.current?.[center];
    const rememberedCenters = remembered ? (PAGE_TO_CENTERS[remembered] || []) : [];
    const target = remembered && rememberedCenters.includes(center) && canAccessPage(user, remembered)
      ? remembered
      : defaultPageForCenter(center);

    if (target && target !== currentPageName) {
      navigate(createPageUrl(target));
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const updateViewport = event => setIsMobileViewport(event.matches);
    setIsMobileViewport(media.matches);
    media.addEventListener?.('change', updateViewport);
    return () => media.removeEventListener?.('change', updateViewport);
  }, []);

  useEffect(() => {
    if (user && hasFullAccess(user) && !sessionStorage.getItem('bps-ranks-normalized')) {
      sessionStorage.setItem('bps-ranks-normalized', '1');
      base44.functions.invoke('normalizeLegacyRanks', {}).catch(() => sessionStorage.removeItem('bps-ranks-normalized'));
    }
    if (user && hasFullAccess(user) && !localStorage.getItem('bps-location-log-purge-complete')) {
      base44.functions.invoke('purgeLegacyLocationLogs', {}).then(() => localStorage.setItem('bps-location-log-purge-complete', '1')).catch(() => null);
    }
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem('bps-workspace-theme', 'night');
    document.documentElement.classList.add('bps-night-mode');
    return () => document.documentElement.classList.remove('bps-night-mode');
  }, []);

  useEffect(() => {
    try {
      setUnreadCounts(JSON.parse(localStorage.getItem(unreadStorageKey) || '{}'));
    } catch {
      setUnreadCounts({});
    }
    if (user?.id) {
      Promise.all([
        base44.entities.Message.filter({ recipient_id: user.id, read: false }, '-created_date', 200),
        base44.functions.invoke('get-inbox-thread-preferences', {}).catch(() => ({ data: { preferences: [] } })),
      ]).then(([records, preferenceResponse]) => {
        const preferencePayload = preferenceResponse?.data || preferenceResponse || {};
        const hiddenKeys = new Set((preferencePayload.preferences || []).filter(preference => preference.hidden !== false).map(preference => preference.thread_key));
        const visibleUnread = (records || []).filter(message => {
          if (message.draft || !String(message.message || '').trim()) return false;
          const fallbackPartner = message.sender_id === user.id ? message.recipient_id : message.sender_id;
          const threadKey = message.thread_id || `direct:${fallbackPartner}`;
          return !hiddenKeys.has(threadKey);
        });
        setUnreadCounts(current => {
          const next = { ...current, OfficerInbox: visibleUnread.length };
          localStorage.setItem(unreadStorageKey, JSON.stringify(next));
          return next;
        });
      }).catch(() => null);
    }
  }, [unreadStorageKey, user?.id]);

  useEffect(() => {
    const onUnread = event => {
      const page = event.detail?.page;
      if (!page || page === currentPageName) return;
      setUnreadCounts(current => {
        const next = { ...current, [page]: (Number(current[page]) || 0) + 1 };
        localStorage.setItem(unreadStorageKey, JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener('bps-unread-notification', onUnread);
    return () => window.removeEventListener('bps-unread-notification', onUnread);
  }, [currentPageName, unreadStorageKey]);

  useEffect(() => {
    if (!user?.id || !user?.email) return;
    let active = true;
    const refreshUnreadFromServer = async () => {
      try {
        const [messages, mentions, announcements, receipts, preferenceResponse] = await Promise.all([
          base44.entities.Message.filter({ recipient_id: user.id, read: false }, '-created_date', 200),
          base44.entities.ChatMention.filter({ recipient_email: user.email, read: false }, '-created_date', 200),
          base44.entities.Announcement.list('-created_date', 100),
          base44.entities.AnnouncementReceipt.filter({ user_email: user.email }, '-read_at', 500),
          base44.functions.invoke('get-inbox-thread-preferences', {}).catch(() => ({ data: { preferences: [] } })),
        ]);
        if (!active) return;
        const receiptIds = new Set((receipts || []).map(r => r.announcement_id));
        const accountCreated = user.created_date ? new Date(user.created_date).getTime() : 0;
        const unreadAnnouncements = (announcements || []).filter(a => {
          const created = new Date(a.created_date || 0).getTime();
          if (!created || (accountCreated && created < accountCreated) || receiptIds.has(a.id)) return false;
          const days = (Date.now() - created) / 86400000;
          return a.priority === 'urgent' ? days <= 30 : a.priority === 'important' ? days <= 14 : days <= 7;
        });
        const teamMentions = (mentions || []).filter(m => m.page === 'TeamChat').length;
        const supervisorMentions = (mentions || []).filter(m => m.page === 'SupervisorChat').length;
        const preferencePayload = preferenceResponse?.data || preferenceResponse || {};
        const hiddenKeys = new Set((preferencePayload.preferences || []).filter(preference => preference.hidden !== false).map(preference => preference.thread_key));
        const visibleUnreadMessages = (messages || []).filter(message => {
          if (message.draft || !String(message.message || '').trim()) return false;
          const fallbackPartner = message.sender_id === user.id ? message.recipient_id : message.sender_id;
          const threadKey = message.thread_id || `direct:${fallbackPartner}`;
          return !hiddenKeys.has(threadKey);
        });
        setUnreadCounts(current => {
          const next = { ...current, OfficerInbox: visibleUnreadMessages.length, TeamChat: teamMentions, SupervisorChat: supervisorMentions, Announcements: unreadAnnouncements.length };
          localStorage.setItem(unreadStorageKey, JSON.stringify(next));
          return next;
        });
      } catch {}
    };
    refreshUnreadFromServer();
    const interval = setInterval(refreshUnreadFromServer, 30000);
    window.addEventListener('bps-unread-refresh', refreshUnreadFromServer);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('bps-unread-refresh', refreshUnreadFromServer);
    };
  }, [user?.id, user?.email, user?.created_date, unreadStorageKey]);

  useEffect(() => {
    if (!currentPageName) return;
    const available = allowedCenters(user);
    const pageCenters = (PAGE_TO_CENTERS[currentPageName] || []).filter(center => available.includes(center));
    // Preserve the page for the workspace the user is actually in. Shared pages
    // should not overwrite every center that happens to expose the same route.
    const pageCenter = pageCenters.includes(activeCenter) ? activeCenter : pageCenters[0];
    if (pageCenter) {
      centerLastPagesRef.current[pageCenter] = currentPageName;
      sessionStorage.setItem('bps-mobile-center-pages', JSON.stringify(centerLastPagesRef.current));
    }
    window.requestAnimationFrame(() => {
      const storedPosition = sessionStorage.getItem(`bps-mobile-scroll:${currentPageName}`);
      const savedPosition = Number(storedPosition ?? scrollPositionsRef.current[currentPageName] ?? 0);
      mainScrollRef.current?.scrollTo({ top: savedPosition, behavior: 'auto' });
    });
    setUnreadCounts(current => {
      if (!current[currentPageName]) return current;
      const next = { ...current, [currentPageName]: 0 };
      localStorage.setItem(unreadStorageKey, JSON.stringify(next));
      return next;
    });
  }, [currentPageName, unreadStorageKey]);

  useEffect(() => {
    const pageCenters = PAGE_TO_CENTERS[currentPageName] || [];
    const available = allowedCenters(user);
    if (!pageCenters.length) return;

    // Route changes may update the workspace, but changing the workspace dropdown
    // must never trigger this effect by itself. Using the functional state form
    // preserves the current center for shared pages such as Rank Structure.
    setActiveCenterState(current => {
      if (pageCenters.includes(current) && available.includes(current)) return current;
      const next = pageCenters.find(center => available.includes(center));
      if (!next || next === current) return current;
      localStorage.setItem('bps-active-center', next);
      return next;
    });
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

  useEffect(() => {
    const roles = normalizedRoles(user);
    const canMonitor = user?.role === 'admin' || user?.role === 'dispatch' || roles.has('cad_access') || roles.has('full_access');
    if (!canMonitor) return undefined;
    let cancelled = false;

    const monitor = async () => {
      if (propertyAlert) return;
      try {
        // Property matching/creation now happens server-side during CAD ingestion.
        // The shell only needs the newest unacknowledged alert and its two related rows.
        const alerts = await base44.entities.PropertyAlert.filter({ acknowledged: false }, '-created_date', 20).catch(() => []);
        const record = alerts?.[0];
        if (!record || cancelled) return;
        const [callRows, locationRows] = await Promise.all([
          base44.entities.DispatchCall.filter({ id: record.callId }).catch(() => []),
          base44.entities.Location.filter({ id: record.propertyId }).catch(() => []),
        ]);
        if (cancelled) return;
        const call = callRows?.[0];
        const location = locationRows?.[0];
        if (!call || !location || ['Cleared', 'Cancelled'].includes(call.status)) return;
        const key = `${call.id}:${location.id}`;
        const relation = String(record.description || '').toLowerCase().includes('inside') ? 'inside' : 'nearby';
        setPropertyAlert({
          call,
          property: {
            id: location.id,
            location_id: location.id,
            name: location.site_name || record.propertyName || 'Monitored Property',
            address: location.address || '',
          },
          relation,
          distanceFeet: Math.round(Number(record.distanceMeters || 0) / 0.3048),
          key,
        });
        playPropertyAlert();
      } catch (error) {
        console.warn('Property alert display check failed:', error?.message);
      }
    };

    monitor();
    const id = setInterval(monitor, 30000);
    const unsubscribeAlerts = base44.entities.PropertyAlert.subscribe(event => {
      if (event?.type === 'create' || event?.type === 'update') monitor();
    });
    const refreshOnFocus = () => { if (!document.hidden) monitor(); };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      unsubscribeAlerts?.();
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [user?.role, JSON.stringify(user?.additional_roles || []), propertyAlert?.key]);

  const acknowledgePropertyAlert = async () => {
    if (!propertyAlert) return;
    stopAllAlerts();
    try {
      const records = await base44.entities.PropertyAlert.filter({ callId: propertyAlert.call.id, propertyId: propertyAlert.property.id, acknowledged: false });
      for (const record of records || []) {
        await base44.entities.PropertyAlert.update(record.id, {
          acknowledged: true,
          acknowledgedBy: user?.email || '',
          acknowledgedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn('Unable to record property alert acknowledgment:', error?.message);
    }
    setPropertyAlert(null);
  };

  if (!canAccessPage(user, currentPageName)) {
    return <Navigate to={createPageUrl(defaultPageForUser(user))} replace />;
  }

  const mobilePageCenters = PAGE_TO_CENTERS[currentPageName] || [];
  const allowedOnMobile = currentPageName === 'OfficerInbox' || mobilePageCenters.some(center => ['cad', 'officer', 'supervisor', 'admin'].includes(center));
  if (isMobileViewport && !allowedOnMobile) {
    return <div className="fixed inset-0 flex items-center justify-center bg-[#07111f] p-6 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-[#294867] bg-[#0c1a2a] p-6 text-center shadow-2xl">
        <Shield className="mx-auto h-10 w-10 text-[#7ec1ff]" />
        <h1 className="mt-4 text-lg font-black">DESKTOP ACCESS REQUIRED</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#9fb6cc]">This area is available only in the desktop web app for your assigned role. Mobile access includes CAD, Officer, Supervisor, and Admin Center operations when your account has permission.</p>
        {canAccessPage(user, 'CommandDashboard') && <Link to={createPageUrl('CommandDashboard')} className="mt-5 block rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white">OPEN CAD</Link>}
      </div>
    </div>;
  }

  const criticalOutage = outages.some(item => item.severity === 'outage');
  const centerLabel = CENTER_CONFIG[activeCenter]?.label || 'CAD Center';

  return <div className="fixed inset-0 flex overflow-hidden bg-[#050a12] text-white cad-app"><BackgroundLocationTracker user={user} /><GlobalMessageBanner user={user} /><WelcomeBriefing user={user} /><MandatoryReadGate user={user} />
    <aside className="relative hidden flex-col border-r border-[#1c3049] md:flex" style={{ width: collapsed ? 64 : 260, transition: 'width .18s ease' }}>
      <Sidebar collapsed={collapsed} user={user} activeCenter={activeCenter} setActiveCenter={switchCenter} currentPageName={currentPageName} search={search} setSearch={setSearch} unreadCounts={unreadCounts} onToggleCollapsed={() => setCollapsed(value => !value)} onLogout={() => logout(true)} />
    </aside>

    <AnimatePresence>{mobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 md:hidden" onClick={() => setMobileOpen(false)}>
      <motion.aside initial={{ x: -360 }} animate={{ x: 0 }} exit={{ x: -360 }} className="h-full w-[min(92vw,360px)] border-r border-[#1c3049] shadow-2xl" onClick={event => event.stopPropagation()}>
        <Sidebar mobile mobileSection={mobileSection} user={user} activeCenter={activeCenter} setActiveCenter={switchCenter} currentPageName={currentPageName} search={search} setSearch={setSearch} unreadCounts={unreadCounts} onCloseMobile={() => { setMobileOpen(false); setMobileSection(null); }} onLogout={() => logout(true)} />
      </motion.aside>
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{propertyAlert && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.94, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 12, opacity: 0 }}
          className="w-full max-w-xl overflow-hidden rounded-xl border-2 border-red-500 bg-[#0b1523] shadow-[0_0_60px_rgba(239,68,68,.35)]"
        >
          <div className="flex items-center gap-3 border-b border-red-700/60 bg-red-950/70 px-5 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-400 bg-red-600/20">
              <Siren className="h-7 w-7 animate-pulse text-red-300" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-red-300">Property Monitoring Alert</div>
              <div className="text-xl font-black text-white">{propertyAlert.property.name}</div>
            </div>
            <div className="ml-auto rounded border border-red-500/60 bg-red-950 px-3 py-1 font-mono text-sm font-black text-red-200">
              {propertyAlert.call.agency_cad_number || (propertyAlert.call.official_cad_verified ? propertyAlert.call.call_id : '') || propertyAlert.call.bps_reference || propertyAlert.call.call_id || 'REFERENCE ASSIGNING'}
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className={`rounded-lg border p-4 ${propertyAlert.relation === 'inside' ? 'border-red-500/50 bg-red-950/30' : 'border-amber-500/50 bg-amber-950/25'}`}>
              <div className={`text-sm font-black uppercase tracking-wider ${propertyAlert.relation === 'inside' ? 'text-red-300' : 'text-amber-300'}`}>
                {propertyAlert.relation === 'inside' ? 'Call inside property boundary' : `Call ${propertyAlert.distanceFeet} feet from property boundary`}
              </div>
              <div className="mt-2 text-2xl font-black text-white">{propertyAlert.call.incident || 'Unknown incident'}</div>
              <div className="mt-1 flex items-start gap-2 text-sm text-slate-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />{propertyAlert.call.location}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-slate-700 bg-slate-900/70 p-3"><div className="text-slate-500">PROPERTY ADDRESS</div><div className="mt-1 font-bold text-slate-100">{propertyAlert.property.address}</div></div>
              <div className="rounded border border-slate-700 bg-slate-900/70 p-3"><div className="text-slate-500">CALL STATUS</div><div className="mt-1 font-bold text-slate-100">{propertyAlert.call.status || 'New'} · {(propertyAlert.call.priority || 'medium').toUpperCase()}</div></div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={stopAllAlerts} className="rounded-lg border border-amber-500/60 bg-amber-950/40 px-5 py-3 text-sm font-black text-amber-200 hover:bg-amber-900/50">SILENCE ALARM</button>
              <button onClick={acknowledgePropertyAlert} className="rounded-lg border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-black text-slate-100 hover:bg-slate-700">ACKNOWLEDGE</button>
              <Link to={createPageUrl('DispatchCenter')} onClick={acknowledgePropertyAlert} className="rounded-lg border border-blue-400 bg-blue-600 px-5 py-3 text-center text-sm font-black text-white hover:bg-blue-500">OPEN CAD CALL</Link>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>

    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-[#1c3049] bg-[#08111f] px-2 pb-0 md:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {!ROOT_PAGES.has(currentPageName) && (
            <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate(createPageUrl(defaultPageForUser(user)))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#294867] text-[#a8c3dc] md:hidden" aria-label="Go back"><ChevronLeft className="h-5 w-5" /></button>
          )}
          <div className="min-w-0">
            <div className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white md:tracking-[0.15em]"><span className="md:hidden">{pageLabel(currentPageName)}</span><span className="hidden md:inline">{centerLabel}</span></div>
            <div className="truncate text-[9px] tracking-widest text-[#607c98]"><span className="md:hidden">FIELD OPERATIONS</span><span className="hidden md:inline">UNIFIED OPERATIONS PLATFORM</span></div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[#7791aa]">
          {criticalOutage && <span className="hidden rounded border border-red-700/60 bg-red-950/40 px-2 py-1 font-bold text-red-300 sm:block">SYSTEM OUTAGE</span>}
          <div className="text-right font-mono leading-tight text-[#9fb6cc]">
            <div className="text-[11px] font-black tracking-wider text-white">{clock.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            <div className="text-[8px] font-bold tracking-[0.12em] text-[#7894af]">{clock.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()} ET</div>
          </div>

        </div>
      </header>

      {activeAlert && <div className="flex items-center justify-between border-b border-red-600 bg-red-950 px-4 py-2 text-sm text-red-100">
        <div className="flex items-center gap-2"><Siren className="h-4 w-4 animate-pulse" /><span className="font-bold">{activeAlert.title || 'Priority dispatch alert'}</span></div>
        <button onClick={() => { stopAllAlerts(); setActiveAlert(null); }} className="rounded border border-red-500/50 px-2 py-1 text-xs font-bold hover:bg-red-900">ACKNOWLEDGE</button>
      </div>}

      <AdminClientPreviewBar user={user} activeCenter={activeCenter} />
      <main ref={mainScrollRef} data-page={currentPageName} className={`mobile-field-content min-h-0 flex-1 overflow-auto ${DARK_WORKSPACE_PAGES.has(currentPageName) ? 'dark-workspace bg-[#07101b] text-white' : 'night-workspace bg-[#0b1420] text-slate-100'}`}>{children}</main>
    </section>
    <MobileFieldNav
      currentPageName={currentPageName}
      unreadCounts={unreadCounts}
      activeCenter={activeCenter}
      centerDestinations={{
        cad: centerLastPagesRef.current.cad || 'CommandDashboard',
        officer: centerLastPagesRef.current.officer || 'Dashboard',
        admin: centerLastPagesRef.current.admin || 'AdminDashboard',
      }}
      onTabNavigate={() => {
        if (mainScrollRef.current && currentPageName) {
          const position = mainScrollRef.current.scrollTop;
          scrollPositionsRef.current[currentPageName] = position;
          sessionStorage.setItem(`bps-mobile-scroll:${currentPageName}`, String(position));
        }
      }}
      onReports={() => { setActiveCenter('officer'); setMobileSection('reports'); setMobileOpen(true); }}
      onMenu={() => { setMobileSection(null); if (!['cad', 'officer', 'supervisor', 'admin'].includes(activeCenter)) setActiveCenter('cad'); setMobileOpen(true); }}
    />
  </div>;
}