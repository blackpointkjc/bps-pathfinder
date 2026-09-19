import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertTriangle, Award, BarChart3, Bell, BookOpen, Bot, Briefcase,
  Building2, Calendar, CalendarClock, Car, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCheck, ClipboardList, Clock3, DollarSign, DoorOpen, FileText,
  FileWarning, Gauge, GraduationCap, Layers, LogOut, Map as MapIcon, MapPin, Menu,
  Home, Mail, MessageCircle, Package, Radio, Search, Settings, Shield, ShieldCheck,
  Siren, Trash2, UserCheck, UserX, Users, Wrench, X, GitBranch, RotateCw
} from 'lucide-react';
import { base44, clearBase44ReadCache } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from './utils';
import { stopAllAlerts } from '@/utils/alertUtils';
import { stopVoice } from '@/utils/voiceAnnouncer';
import { formatEasternDateTime } from '@/lib/easternTime';
import { cleanIncident } from '@/utils/callUtils';
import { getLocalReadAnnouncementIds } from '@/lib/announcementReadState';
import { disconnectExternalGps, getExternalGpsStatus, lockExternalGpsToCurrentAntenna, requestExternalGpsConnection, subscribeExternalGpsStatus, unlockExternalGpsAntenna } from '@/lib/externalGpsService';
import GlobalMessageBanner, { CadAudioToggle } from '@/components/GlobalMessageBanner';
import SupervisorOperationsMonitor from '@/components/SupervisorOperationsMonitor';
import GlobalOperationsTicker from '@/components/GlobalOperationsTicker';
import NotificationMonitor from '@/components/NotificationMonitor';
import MandatoryReadGate from '@/components/MandatoryReadGate';
import WelcomeBriefing from '@/components/WelcomeBriefing';
import PerformanceReviewTaskGate from '@/components/PerformanceReviewTaskGate';
import AdminClientPreviewBar from '@/components/AdminClientPreviewBar';
import ForcedOOSOverlay from '@/components/ForcedOOSOverlay';
import MicrosoftMailSetupGate from '@/components/MicrosoftMailSetupGate';
import OutlookNotificationMonitor from '@/components/OutlookNotificationMonitor';
import TeamsNotificationMonitor from '@/components/TeamsNotificationMonitor';
import AdminHourlySystemScan from '@/components/admin/AdminHourlySystemScan';


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
        ['Officer Queue', 'OfficerDispatchQueue', Radio],
        ['Live Map', 'Navigation', MapIcon],
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
        ['Shift Handover', 'ShiftHandover', ClipboardCheck],
        ['VA Trespass', 'VATrespassNotices', UserX],
        ['VA Complaint', 'VACriminalComplaints', Shield],
        ['VA Summons', 'Summons', FileText],
        ['Witness Subpoena', 'WitnessSubpoenaRequest', FileText],
      ]},
      { label: 'Reports & Requests', items: [
        ['Daily Activity', 'DailyActivityReports', ClipboardList],
        ['Incident Report', 'IncidentReports', AlertTriangle],
        ['Maintenance', 'MaintenanceReports', Wrench],
        ['Open Door', 'OpenDoorReports', DoorOpen],
        ['Confidential', 'ConfidentialReport', ShieldCheck],
        ['Expense Report', 'ExpenseReports', DollarSign],
        ['QR Patrol Scan', 'QRPatrolScan', MapPin],
        ['Time Request', 'TimeRequests', CalendarClock],
      ]},
      { label: 'Schedule & Availability', items: [
        ['Availability', 'OfficerAvailability', CalendarClock],
        ['Open Shifts', 'OpenShifts', Briefcase],
        ['Payroll Dates', 'OfficerPayrollDates', DollarSign],
      ]},
      { label: 'Communications', items: [
        ['Teams Messages', 'OfficerInbox', MessageCircle],
        ['Officer Chat', 'OfficerChat', Radio],
        ['Announcements', 'Announcements', Bell],
      ]},
      { label: 'Profile & Training', items: [
        ['My Profile', 'OfficerProfile', UserCheck],
        ['My Performance', 'MyPerformanceAnalytics', BarChart3],
        ['My Reviews & Feedback', 'OfficerPerformanceReviews', ClipboardCheck],
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
      { label: 'My Shift', items: [
        ['Dashboard', 'Dashboard', Gauge],
        ['Time Clock', 'TimeClock', Clock3],
        ['My Schedule', 'Schedule', Calendar],
        ['My Dispatch Queue', 'OfficerDispatchQueue', Radio],
      ]},
      { label: 'Field Tools', items: [
        ['Post Orders', 'PostOrders', BookOpen],
        ['Shift Handover', 'ShiftHandover', ClipboardCheck],
        ['Virginia Law', 'VirginiaFieldLawAssistant', BookOpen],
        ['VA Trespass', 'VATrespassNotices', UserX],
        ['VA Complaint', 'VACriminalComplaints', Shield],
        ['VA Summons', 'Summons', FileText],
        ['Witness Subpoena', 'WitnessSubpoenaRequest', FileText],
      ]},
      { label: 'Reports & Requests', items: [
        ['Daily Activity', 'DailyActivityReports', ClipboardList],
        ['Incident Report', 'IncidentReports', AlertTriangle],
        ['Maintenance', 'MaintenanceReports', Wrench],
        ['Open Door', 'OpenDoorReports', DoorOpen],
        ['Confidential', 'ConfidentialReport', ShieldCheck],
        ['Expense Report', 'ExpenseReports', DollarSign],
        ['QR Patrol Scan', 'QRPatrolScan', MapPin],
        ['Time Request', 'TimeRequests', CalendarClock],
      ]},
      { label: 'Schedule & Availability', items: [
        ['Availability', 'OfficerAvailability', CalendarClock],
        ['Open Shifts', 'OpenShifts', Briefcase],
        ['Payroll Dates', 'OfficerPayrollDates', DollarSign],
      ]},
      { label: 'Supervisor Operations', items: [
        ['Live Field Oversight', 'SupervisorFieldOversight', ShieldCheck],
        ['Action Items', 'SupervisorTasks', ClipboardList],
        ['Daily Code', 'SupervisorDailyCode', ShieldCheck],
      ]},
      { label: 'Officer Oversight', items: [
        ['Officer Inspections', 'SupervisorInspections', ClipboardCheck],
        ['Performance Reviews', 'SupervisorPerformanceReview', ClipboardCheck],
        ['Write-Ups', 'SupervisorWriteUps', FileWarning],
        ['Use of Force', 'SupervisorUseOfForce', AlertTriangle],
        ['Complaints', 'SupervisorComplaints', AlertTriangle],
      ]},
      { label: 'Communication & Profile', items: [
        ['Supervisor Chat', 'SupervisorChat', MessageCircle],
        ['Announcements', 'Announcements', Bell],
        ['My Profile', 'OfficerProfile', UserCheck],
        ['My Performance', 'MyPerformanceAnalytics', BarChart3],
        ['My Reviews & Feedback', 'OfficerPerformanceReviews', ClipboardCheck],
        ['Training', 'OfficerTraining', GraduationCap],
        ['Rank Structure', 'RankStructure', Shield],
        ['Rank Duties', 'RankDuties', Shield],
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
        ['Duty Supervisor Schedule', 'DutySupervisorScheduling', ShieldCheck],
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
        ['Special Requests', 'AdminSpecialRequests', CalendarClock],
      ]},
      { label: 'QR Patrol', items: [
        ['QR Patrol Management', 'AdminQRCenter', MapPin],
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
      { label: 'Training Operations', items: [
        ['Trainer Center', 'TrainerCenter', GraduationCap],
        ['Training Documents', 'AdminDocuments', FileText],
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
        ['Bills, Expenses & Approvals', 'AccountingExpenses', DollarSign],
      ]},
      { label: 'Financial Overview', items: [
        ['Company Profit', 'AccountingProfit', BarChart3],
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

const DESKTOP_CENTER_PAGE = {
  cad: 'CADCenter',
  officer: 'OfficerCenter',
  admin: 'AdminCenter',
  hr: 'HRCenter',
  supervisor: 'SupervisorCenter',
  client: 'ClientCenter',
  training: 'TrainerCenter',
  accounting: 'AccountingCenter',
};
Object.entries(DESKTOP_CENTER_PAGE).forEach(([center, page]) => {
  PAGE_TO_CENTERS[page] = [...new Set([...(PAGE_TO_CENTERS[page] || []), center])];
});

const DESKTOP_LEGACY_TOOL_ROUTES = {
  CommandDashboard: ['cad','live','command'], DispatchCenter: ['cad','live','dispatch'], OfficerDispatchQueue: ['cad','live','officerqueue'], Navigation: ['cad','live','map'], BOLOAlerts: ['cad','alerts','bolo'], DispatcherShiftReports: ['cad','live','dispatch'], CallHistory: ['cad','history','history'], RecordsAssistant: ['cad','history','records'], Personnel: ['cad','admin','personnel'], PathfinderReports: ['cad','admin','reports'], AdminPortal: ['cad','admin','control'],
  Dashboard: ['officer','today','dashboard'], TimeClock: ['officer','today','clock'], Schedule: ['officer','today','myschedule'], PostOrders: ['officer','field','postorders'], QRPatrolScan: ['officer','reports','qr'], ShiftHandover: ['officer','field','handover'], VirginiaFieldLawAssistant: ['officer','messages','law'], VATrespassNotices: ['officer','messages','trespass'], VACriminalComplaints: ['officer','messages','complaint'], Summons: ['officer','messages','summons'], WitnessSubpoenaRequest: ['officer','messages','subpoena'], DailyActivityReports: ['officer','reports','dar'], IncidentReports: ['officer','reports','incident'], MaintenanceReports: ['officer','reports','maintenance'], OpenDoorReports: ['officer','reports','opendoor'], ConfidentialReport: ['officer','reports','confidential'], ExpenseReports: ['officer','reports','expense'], TimeRequests: ['officer','schedule','time'], OfficerAvailability: ['officer','schedule','availability'], OpenShifts: ['officer','schedule','openshifts'], OfficerPayrollDates: ['officer','schedule','payroll'], Announcements: ['officer','today','announcements'], OfficerProfile: ['officer','profile','profile'], MyPerformanceAnalytics: ['officer','profile','performance'], OfficerPerformanceReviews: ['officer','profile','reviews'], OfficerTraining: ['officer','profile','training'], RankStructure: ['officer','profile','rank'], RankDuties: ['officer','profile','duties'],
  AdminDashboard: ['admin','command','dashboard'], AdminAnalytics: ['admin','command','analytics'],
  AdminLocationTracker: ['admin','sites','locationdispatch','admin_location_dispatch_tool','tracker'], AdminGeofenceAlerts: ['admin','sites','locationdispatch','admin_location_dispatch_tool','geofence'], AdminAutoDispatchControls: ['admin','sites','locationdispatch','admin_location_dispatch_tool','autodispatch'], AdminLocations: ['admin','sites','locationdispatch','admin_location_dispatch_tool','locations'],
  AdminScheduling: ['admin','schedule','schedulehub','admin_schedule_tool','scheduling'], FleetVehicleAssignments: ['admin','schedule','schedulehub','admin_schedule_tool','fleet'], DutySupervisorScheduling: ['admin','schedule','schedulehub','admin_schedule_tool','duty'], AdminPlannedShifts: ['admin','schedule','schedulehub','admin_schedule_tool','planned'], AdminShiftBids: ['admin','schedule','schedulehub','admin_schedule_tool','bids'], AdminSupportStaffClock: ['admin','schedule','schedulehub','admin_schedule_tool','supportclock'],
  AdminOfficerManagement: ['admin','people','personnelhub','admin_people_tool','availability'], AdminUsers: ['admin','people','personnelhub','admin_people_tool','users'], AdminPlatoonAssignments: ['admin','people','personnelhub','admin_people_tool','chain'],
  AdminEquipment: ['admin','sites','siteassets','admin_site_assets_tool','equipment'], AdminPostOrders: ['admin','sites','siteassets','admin_site_assets_tool','postorders'],
  AdminReports: ['admin','reports','reportshub','admin_reports_quality_tool','allreports'], AdminClientReports: ['admin','reports','reportshub','admin_reports_quality_tool','clientreports'], AdminSupervisorReports: ['admin','reports','reportshub','admin_reports_quality_tool','supervisorreports'], AdminConfidentialReports: ['admin','reports','reportshub','admin_reports_quality_tool','confidential'], AdminComplaints: ['admin','reports','reportshub','admin_reports_quality_tool','complaints'], AdminCommendations: ['admin','reports','reportshub','admin_reports_quality_tool','commendations'], AdminClientFeedback: ['admin','reports','reportshub','admin_reports_quality_tool','feedback'],
  AdminAnnouncements: ['admin','communications','communicationshub','admin_communications_tool','announcements'], AdminSpecialRequests: ['admin','communications','communicationshub','admin_communications_tool','requests'],
  AdminQRCenter: ['admin','sites','siteassets','admin_site_assets_tool','qr'], AdminQRCheckpoints: ['admin','sites','siteassets','admin_site_assets_tool','qr'], AdminQRPrintManager: ['admin','sites','siteassets','admin_site_assets_tool','qr'], AdminQRReports: ['admin','sites','siteassets','admin_site_assets_tool','qr'], AdminPortalSettings: ['admin','sites','systemportal','admin_system_portal_tool','settings'], AdminDocuments: ['training','documents','documents'],
  HRManageCompanyEmployees: ['hr','employees','employees'], ManageTimeEntries: ['hr','support','timeentries'], AdminDivisions: ['hr','employees','divisions'], AdminPTOApproval: ['hr','leave','pto'], AdminManualPTO: ['hr','leave','manualpto'], AdminPTOLossReport: ['hr','leave','ptoloss'], AdminPerformanceReviews: ['hr','clients','reviews'], ManageClients: ['hr','employees','clients'],
  SupervisorTasks: ['supervisor','command','tasks'], SupervisorFieldOversight: ['supervisor','command','field'], SupervisorShiftHandover: ['supervisor','command','handover'], SupervisorChat: ['supervisor','command','chat'], SupervisorDailyCode: ['supervisor','command','code'], SupervisorInspections: ['supervisor','oversight','inspections'], SupervisorPerformanceReview: ['supervisor','oversight','reviews'], SupervisorWriteUps: ['supervisor','oversight','writeups'], SupervisorUseOfForce: ['supervisor','oversight','force'], SupervisorComplaints: ['supervisor','oversight','complaints'],
  ClientDashboard: ['client','overview','dashboard'], ClientAlerts: ['client','overview','alerts'], ClientCallHistory: ['client','overview','calls'], ClientSchedule: ['client','site','schedule'], ClientSupervisors: ['client','site','supervisors'], ClientLocation: ['client','site','location'], ClientTrespass: ['client','site','trespass'], ClientReports: ['client','records','reports'], ClientQRReports: ['client','records','qr'], ClientDocuments: ['client','records','documents'], ClientSpecialRequests: ['client','requests','special'], ClientPayrollReport: ['client','billing','payroll'], ClientFeedback: ['client','requests','feedback'],
  AccountingPayroll: ['accounting','payroll','payroll'], PayrollDates: ['accounting','payroll','dates'], AccountingInvoices: ['accounting','billing','invoices'], AccountingExpenses: ['accounting','billing','expenses'], AccountingProfit: ['accounting','overview','profit'], AccountingTaxLiability: ['accounting','overview','tax'],
};

function _desktopToolRoute(pageName) {
  const route = DESKTOP_LEGACY_TOOL_ROUTES[pageName];
  if (!route) return null;
  const [center, section, tool, nestedParam, nestedTool] = route;
  const centerPage = DESKTOP_CENTER_PAGE[center];
  if (!centerPage) return null;
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  if (center === 'admin') {
    params.set('admin_center', 'admin');
    params.set('admin_ops_section', section);
    params.set('admin_ops_tool', tool);
    if (nestedParam && nestedTool) params.set(nestedParam, nestedTool);
  } else {
    params.set('section', section);
    params.set('tool', tool);
  }
  return `${createPageUrl(centerPage)}?${params.toString()}`;
}

const FULL_ACCESS_PAGES = new Set(['Personnel', 'PathfinderReports', 'AdminPortal']);
const ROOT_PAGES = new Set(['CommandDashboard', 'Dashboard', 'OfficerInbox']);
const CENTER_UNREAD_PAGES = {
  // CAD message counts are shown on the in-workspace MSG control, not the side menu.
  cad: [],
  officer: ['OfficerInbox', 'OutlookMail', 'OfficerChat', 'Announcements'],
  supervisor: ['SupervisorChat'],
  admin: ['AdminAnnouncements'],
};

const UNREAD_PAGE_LABELS = {
  OfficerInbox: 'Teams Messages',
  OutlookMail: 'Outlook Mail',
  OfficerChat: 'Officer Chat',
  SupervisorChat: 'Supervisor Chat',
  Announcements: 'Announcements',
  AdminAnnouncements: 'Announcements',
};

function centerUnreadSummary(centerKey, unreadCounts = {}) {
  const entries = (CENTER_UNREAD_PAGES[centerKey] || [])
    .map(page => ({ page, count: Math.max(0, Number(unreadCounts[page]) || 0) }))
    .filter(item => item.count > 0);
  if (!entries.length) return '';
  const total = entries.reduce((sum, item) => sum + item.count, 0);
  if (entries.length === 1) return `${total > 99 ? '99+' : total} unread · ${UNREAD_PAGE_LABELS[entries[0].page] || pageLabel(entries[0].page)}`;
  const sources = entries.map(item => `${UNREAD_PAGE_LABELS[item.page] || pageLabel(item.page)} ${item.count > 99 ? '99+' : item.count}`).join(', ');
  return `${total > 99 ? '99+' : total} unread · ${sources}`;
}

// Teams-only surfaces still require Microsoft. Officer Chat has a Pathfinder
// native fallback so IMAP/non-Microsoft users can communicate with the same team.
const MICROSOFT_TOOL_PAGES = new Set(['OfficerInbox', 'SupervisorChat']);
const _COMMUNICATION_PAGES = new Set(['OfficerInbox', 'OutlookMail', 'OfficerChat', 'SupervisorChat']);

function hasFullAccess(user) {
  return user?.role === 'admin' || normalizedRoles(user).has('full_access');
}

const HIDDEN_PROPERTY_ALERT_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
const normalizedCallStatus = value => String(value || '').trim().toLowerCase();

const DARK_WORKSPACE_PAGES = new Set([
  'CommandDashboard', 'DispatchCenter', 'CallHistory', 'ClientCallHistory',
  'BOLOAlerts', 'RecordsAssistant', 'VirginiaFieldLawAssistant', 'Personnel', 'PathfinderReports', 'AdminPortal', 'CADCenter'
]);

const OFFICER_MODERN_PAGES = new Set([
  'PostOrders', 'Summons', 'WitnessSubpoenaRequest', 'VACriminalComplaints', 'VATrespassNotices',
  'DailyActivityReports', 'IncidentReports', 'MaintenanceReports', 'OpenDoorReports',
  'ConfidentialReport', 'ExpenseReports', 'QRPatrolScan', 'OpenShifts',
  'OfficerPayrollDates', 'OfficerPerformanceReviews', 'OfficerTraining',
  'RankStructure', 'RankDuties', 'OfficerAvailability'
]);

const MODERNIZED_WORKSPACE_PAGES = new Set([
  'AdminCenter', 'OfficerCenter', 'SupervisorCenter', 'HRCenter', 'TrainerCenter',
  'AdminUsers', 'Personnel', 'AdminShiftBids', 'AdminLocationTracker', 'AdminGeofenceAlerts',
  'AdminLocations', 'AdminPortal', 'AdminPortalSettings', 'AdminClientReports',
  'AdminSupervisorReports', 'AdminConfidentialReports', 'AdminComplaints', 'AdminCommendations',
  'AdminClientFeedback', 'Reports', 'OfficerDispatchQueue', 'TimeClock', 'Schedule', 'Announcements',
  'PostOrders', 'ShiftHandover', 'VATrespassNotices', 'VACriminalComplaints', 'Summons',
  'DailyActivityReports', 'IncidentReports', 'MaintenanceReports', 'OpenDoorReports',
  'ConfidentialReport', 'ExpenseReports', 'QRPatrolScan', 'OpenShifts', 'OfficerPayrollDates',
  'OfficerProfile', 'MyPerformanceAnalytics', 'OfficerPerformanceReviews', 'OfficerTraining',
  'RankStructure', 'RankDuties', 'SupervisorPerformanceReview', 'SupervisorWriteUps',
  'SupervisorComplaints', 'AdminDivisions', 'ManageClients', 'ManageTimeEntries',
  'AdminPTOApproval', 'AdminPTOLossReport', 'AdminPerformanceReviews'
]);

function normalizedRoles(user) {
  return new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(role => String(role).toLowerCase()));
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
  const rank = String(user?.rank || '').toLowerCase();
  const withSupplementalCenters = centers => [...new Set([
    ...centers,
    ...(roles.has('accounting') ? ['accounting'] : []),
    ...(roles.has('trainer') ? ['training'] : []),
  ])];

  // Client and Student are intentionally isolated portal identities.
  if (roles.has('client') || user?.user_type === 'client') return ['client'];
  if (roles.has('student')) return ['student'];

  // Admin is the master soft-mirror workspace. CAD/Officer/Supervisor/HR/Client
  // live inside Admin Center. Accounting remains a visible workspace whenever
  // the employee carries the accounting additional role.
  if (user?.role === 'admin' || fullAccess) return withSupplementalCenters(['admin']);
  if (user?.role === 'dispatch') return withSupplementalCenters(['cad']);
  if (roles.has('supervisor') || ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank)) return withSupplementalCenters(['supervisor', 'cad']);
  if (roles.has('officer')) return withSupplementalCenters(['officer', 'cad']);
  if (roles.has('hr') || rank === 'human resources') return withSupplementalCenters(['hr']);
  if (roles.has('support_staff') || roles.has('support') || rank === 'support staff') return withSupplementalCenters(['support']);
  if (roles.has('accounting')) return withSupplementalCenters(['accounting']);
  if (roles.has('trainer')) return ['training'];

  return roles.has('cad_access') ? withSupplementalCenters(['cad']) : withSupplementalCenters(['officer']);
}

const CENTER_DEFAULT_PAGE = {
  cad: 'CommandDashboard',
  officer: 'Dashboard',
  supervisor: 'SupervisorTasks',
  admin: 'AdminDashboard',
  training: 'TrainerCenter',
  hr: 'HRManageCompanyEmployees',
  support: 'AdminSupportStaffClock',
  accounting: 'AccountingPayroll',
  client: 'ClientDashboard',
  student: 'StudentPortal',
};

function defaultPageForCenter(center) {
  return CENTER_DEFAULT_PAGE[center] || 'CommandDashboard';
}

function defaultPageForUser(user, desktop = false) {
  const centers = allowedCenters(user);
  const center = centers[0];
  return desktop && DESKTOP_CENTER_PAGE[center] ? DESKTOP_CENTER_PAGE[center] : defaultPageForCenter(center);
}

function canAccessPage(user, pageName) {
  if (pageName === 'OfficerInbox' || pageName === 'OutlookMail') return true;
  if (FULL_ACCESS_PAGES.has(pageName)) return hasFullAccess(user);
  const centers = PAGE_TO_CENTERS[pageName];
  if (!centers?.length) return true;

  const roles = normalizedRoles(user);
  const rank = String(user?.rank || '').toLowerCase();
  const clientOnly = roles.has('client') || user?.user_type === 'client';
  const studentOnly = roles.has('student');
  if (clientOnly) return centers.includes('client');
  if (studentOnly) return centers.includes('student');

  // Embedded-center access is broader than visible top-level workspace tabs.
  // This keeps soft-mirrored buttons/navigation functional without exposing
  // duplicate centers in the sidebar.
  if (hasFullAccess(user)) {
    const adminEmbedded = new Set(['admin','cad','officer','supervisor','hr','client']);
    if (centers.some(center => adminEmbedded.has(center))) return true;
  }
  if (roles.has('supervisor') || ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank)) {
    if (centers.some(center => ['cad','supervisor','officer'].includes(center))) return true;
  }
  if (roles.has('trainer') && centers.includes('training')) return true;

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

function MobileFieldNav({ currentPageName, unreadCounts, onMenu, onReports, onTabNavigate, user }) {
  const centers = allowedCenters(user);
  const roleWorkspace = centers.includes('admin')
    ? ['Admin', 'AdminCenter', Settings]
    : centers.includes('supervisor')
      ? ['Supervisor', 'SupervisorCenter', ClipboardCheck]
      : centers.includes('officer')
        ? ['Officer', 'OfficerCenter', Shield]
        : null;
  const tabs = [
    ['CAD', 'CADCenter', Radio],
    ...(roleWorkspace ? [roleWorkspace] : []),
    ['Inbox', 'OfficerInbox', MessageCircle],
  ];
  return (
    <nav aria-label="Primary navigation" className="pathfinder-field-nav fixed inset-x-0 bottom-0 z-[45] flex border-t border-[#29445f] bg-[#07111f]/98 px-1 pt-1 shadow-[0_-10px_30px_rgba(0,0,0,.35)] backdrop-blur xl:hidden" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
      {tabs.map(([label, page, Icon]) => {
        const active = currentPageName === page;
        const count = Number(unreadCounts[page]) || 0;
        return <Link key={`${label}-${page}`} to={createPageUrl(page)} aria-current={active ? "page" : undefined} onClick={() => onTabNavigate?.(page)} className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg ${active ? 'bg-[#153b65] text-white' : 'text-[#7894af]'}`}>
          <Icon className="h-5 w-5" /><span className="text-[9px] font-black">{label}</span>
          {!!count && <span className="absolute right-[18%] top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">{count > 99 ? '99+' : count}</span>}
        </Link>;
      })}
      {(centers.includes('officer') || centers.includes('supervisor')) && <button type="button" onClick={onReports} className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[#8db1d2]"><ClipboardList className="h-5 w-5" /><span className="text-[8px] font-black">REPORTS</span></button>}
      <button type="button" onClick={onMenu} className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[#8db1d2]"><Menu className="h-5 w-5" /><span className="text-[8px] font-black">Tools</span></button>
    </nav>
  );
}

function Sidebar({ collapsed, mobile, mobileSection, user, activeCenter, setActiveCenter, currentPageName, search, setSearch, unreadCounts = {}, onCloseMobile, onToggleCollapsed, onLogout }) {
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState(() => sessionStorage.getItem(`bps-open-nav-group:${activeCenter}`) || '');
  const allAllowedCenters = allowedCenters(user);
  // Support Clock lives inside Admin and HR. Do not waste desktop sidebar space
  // on a duplicate Support Center when the user already has another center.
  const availableCenters = allAllowedCenters
    .filter(center => center !== 'support' || allAllowedCenters.length === 1);
  const center = CENTER_CONFIG[activeCenter] || CENTER_CONFIG.cad;
  const mobileTitle = mobileSection === 'reports' ? 'REPORTS' : 'PATHFINDER TOOLS';
  const query = search.trim().toLowerCase();
  const desktopCenterPage = !mobile ? DESKTOP_CENTER_PAGE[activeCenter] : null;
  const mobileCenters = availableCenters.includes('admin')
    ? [...new Set([...availableCenters, 'cad', 'officer', 'supervisor', 'hr', 'client'])]
    : availableCenters.includes('supervisor')
      ? [...new Set([...availableCenters, 'officer'])] : availableCenters;
  const sourceGroups = mobile
    ? (mobileSection === 'reports'
        ? mobileCenters.flatMap(key => (CENTER_CONFIG[key]?.groups || [])
            .filter(group => group.label.toLowerCase().includes('report'))
            .map(group => ({ ...group, label: `${CENTER_CONFIG[key].label} / ${group.label}` })))
        : [])
    : desktopCenterPage ? [] : center.groups;
  const groups = sourceGroups
    .filter(group => !group.fullAccessOnly || hasFullAccess(user))
    .filter(group => !mobileSection || (mobileSection === 'reports' && group.label.toLowerCase().includes('report')))
    .map(group => ({
      ...group,
      items: group.items.filter(([label, page]) => canAccessPage(user, page) && (!query || `${label} ${group.label}`.toLowerCase().includes(query))),
    }))
    .filter(group => group.items.length > 0);

  useEffect(() => {
    const groupForPage = sourceGroups
      .filter(group => !group.fullAccessOnly || hasFullAccess(user))
      .find(group => group.items.some(([, page]) => page === currentPageName));
    const remembered = sessionStorage.getItem(`bps-open-nav-group:${activeCenter}`);
    const next = mobileSection === 'reports' ? 'Reports' : (groupForPage?.label || remembered || groups[0]?.label || '');
    setOpenNavGroup(next);
    if (next) sessionStorage.setItem(`bps-open-nav-group:${activeCenter}`, next);
  }, [activeCenter, currentPageName, mobileSection, user?.role, JSON.stringify(user?.additional_roles || [])]);

  const setNavGroup = (label, isOpen) => {
    const next = isOpen ? label : '';
    setOpenNavGroup(next);
    if (next) sessionStorage.setItem(`bps-open-nav-group:${activeCenter}`, next);
    else sessionStorage.removeItem(`bps-open-nav-group:${activeCenter}`);
  };

  return (
    <div className={`flex h-full flex-col bg-gradient-to-b from-[#071321] via-[#081522] to-[#050d17] ${mobile ? 'mobile-tool-library' : 'border-r border-[#183049] shadow-[12px_0_40px_rgba(0,0,0,.25)]'}`}>
      <div className="border-b border-[#1b3048] bg-[#091827]/90 px-3 py-2.5 backdrop-blur-xl">
        <div className={`flex items-center ${collapsed && !mobile ? 'justify-center' : 'gap-3'}`}>
          {(!collapsed || mobile) && <div className="min-w-0 flex-1">
            <div className="text-[12px] font-black tracking-[0.16em] text-white">{mobile ? mobileTitle : 'BPS PATHFINDER'}</div>
            <div className="text-[9px] tracking-[0.16em] text-[#7290ad]">{mobile ? 'NAVIGATION, WORKSPACES & ACCOUNT' : 'BLACK POINT PROTECTION'}</div>
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

        {(!collapsed || mobile) && !mobile && availableCenters.length > 1 && (
          <div className="mt-3">
            {mobile && <div className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[#6886a3]">Workspace</div>}
            {mobile ? (
              <div className="relative">
                {React.createElement(center.icon, { className: 'pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-cyan-300' })}
                <select id="mobile-workspace-select" value={activeCenter} onChange={event => setActiveCenter(event.target.value)} aria-label="Open workspace" className="h-11 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 pl-10 pr-3 text-base text-white">
                  {availableCenters.map(key => <option key={key} value={key}>{CENTER_CONFIG[key].label}</option>)}
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-[#203a52] bg-[#07131f]/70 p-2.5 shadow-inner">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[#6886a3]">Workspace</span>
                  <span className="text-[8px] font-bold text-cyan-300">{center.label}</span>
                </div>
                <div className="relative">
                  {React.createElement(center.icon, { className: 'pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-cyan-300' })}
                  <Select value={activeCenter} onValueChange={setActiveCenter}>
                    <SelectTrigger className="h-11 w-full border-[#315879] bg-gradient-to-r from-[#102c49] to-[#0c2238] pl-10 text-[11px] font-black text-white shadow-sm focus:ring-cyan-900/40" aria-label="Switch Pathfinder workspace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#315879] bg-[#0b1928] text-white">
                      {availableCenters.map(key => {
                        const item = CENTER_CONFIG[key];
                        const unreadSummary = centerUnreadSummary(key, unreadCounts);
                        return <SelectItem key={key} value={key} className="focus:bg-[#15314f] focus:text-white">{item.label}{unreadSummary ? ` — ${unreadSummary}` : ''}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {(!collapsed || mobile) && (!desktopCenterPage || mobile) && (!mobile || mobileSection === 'reports') && <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-[#24435f] bg-[#07131f] px-3 py-2.5 shadow-inner transition focus-within:border-cyan-600/70 focus-within:ring-2 focus-within:ring-cyan-900/40">
          <Search className="h-3.5 w-3.5 text-[#65819d]" />
          <input value={search} onChange={event => setSearch(event.target.value)} aria-label={mobile ? 'Search all authorized pages' : `Search ${center.label}`} placeholder={mobile ? 'Search all pages…' : `Search ${center.label}`} className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-[#55708a]" />
        </div>
      </div>}

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y px-2 py-2">
        {mobile && !mobileSection && (
          <>
            <div className="mb-2 px-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#6d8aa7]">Main Centers</div>
            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label="Pathfinder centers">
              {mobileCenters.map(key => {
                const item = CENTER_CONFIG[key];
                const Icon = item.icon;
                return (
                  <Link key={key} to={createPageUrl(DESKTOP_CENTER_PAGE[key] || defaultPageForCenter(key))} onClick={onCloseMobile} className="flex min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#0e2236] px-2.5 py-2 text-[10px] font-black text-slate-100 transition hover:border-cyan-500 hover:bg-[#153552]">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
        {collapsed && !mobile && (
          <div className="mb-2 space-y-1 border-b border-[#1b3048] pb-2">
            {availableCenters.map(key => {
              const item = CENTER_CONFIG[key];
              const Icon = item.icon;
              const target = DESKTOP_CENTER_PAGE[key] || defaultPageForCenter(key);
              return (
                <Link
                  key={`collapsed-${key}`}
                  to={createPageUrl(target)}
                  onClick={() => setActiveCenter(key)}
                  title={item.label}
                  className={`flex h-10 w-full items-center justify-center rounded-lg border transition ${activeCenter === key ? 'border-cyan-500/60 bg-[#12304a] text-cyan-300' : 'border-transparent text-[#6683a0] hover:bg-[#0d2236] hover:text-white'}`}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>
        )}
        {mobile && !mobileSection && (
          <>
            <div className="mb-2 px-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#6d8aa7]">Communication</div>
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <Link to={createPageUrl('OfficerInbox')} onClick={() => onCloseMobile?.()} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#0e2236] px-2.5 py-2 text-[10px] font-black text-slate-100 hover:border-cyan-500 hover:bg-[#153552]">
                <MessageCircle className="h-3.5 w-3.5 text-cyan-300" /><span>Teams</span>
                {!!unreadCounts.OfficerInbox && <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] text-white">{unreadCounts.OfficerInbox > 99 ? '99+' : unreadCounts.OfficerInbox}</span>}
              </Link>
              <Link to={createPageUrl('OutlookMail')} onClick={() => onCloseMobile?.()} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#0e2236] px-2.5 py-2 text-[10px] font-black text-slate-100 hover:border-blue-500 hover:bg-[#153552]">
                <Mail className="h-3.5 w-3.5 text-blue-300" /><span>Outlook</span>
                {!!unreadCounts.OutlookMail && <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] text-white">{unreadCounts.OutlookMail > 99 ? '99+' : unreadCounts.OutlookMail}</span>}
              </Link>
              {(hasFullAccess(user) || hasRole(user, 'officer')) && <Link to={createPageUrl('OfficerChat')} onClick={() => onCloseMobile?.()} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#0e2236] px-2.5 py-2 text-[10px] font-black text-slate-100 hover:border-cyan-500 hover:bg-[#153552]"><Radio className="h-3.5 w-3.5 text-cyan-300" /><span>Officer Chat</span>{!!unreadCounts.OfficerChat && <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] text-white">{unreadCounts.OfficerChat > 99 ? '99+' : unreadCounts.OfficerChat}</span>}</Link>}
              {(hasFullAccess(user) || hasRole(user, 'supervisor')) && <Link to={createPageUrl('SupervisorChat')} onClick={() => onCloseMobile?.()} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#0e2236] px-2.5 py-2 text-[10px] font-black text-slate-100 hover:border-emerald-500 hover:bg-[#153552]"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /><span>Supervisor</span>{!!unreadCounts.SupervisorChat && <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] text-white">{unreadCounts.SupervisorChat > 99 ? '99+' : unreadCounts.SupervisorChat}</span>}</Link>}
              <Link to={createPageUrl('Announcements')} onClick={() => onCloseMobile?.()} className="relative flex min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#0e2236] px-2.5 py-2 text-[10px] font-black text-slate-100 hover:border-amber-500 hover:bg-[#153552]">
                <Bell className="h-3.5 w-3.5 text-amber-300" /><span>Announcements</span>
                {!!unreadCounts.Announcements && <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] text-white">{unreadCounts.Announcements > 99 ? '99+' : unreadCounts.Announcements}</span>}
              </Link>
            </div>
          </>
        )}

        {!mobile && (
          <>
            {(!collapsed || mobile) && <div className="mb-1 px-2.5 pt-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#5f7d99]">Communication</div>}
            <Link to={createPageUrl('OfficerInbox')} className={`relative mb-1 flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 ${currentPageName === 'OfficerInbox' ? 'border-cyan-500/60 bg-[#12304a] text-white' : 'border-[#24415e] bg-[#0b1928] text-[#9bb2c9]'} ${collapsed ? 'justify-center px-0' : ''}`}><MessageCircle className="h-4 w-4 text-cyan-300" />{!collapsed && <span className="text-[11px] font-black">TEAMS MESSAGES</span>}</Link>
            <Link to={createPageUrl('OutlookMail')} className={`relative mb-1 flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 ${currentPageName === 'OutlookMail' ? 'border-blue-500/60 bg-[#12304a] text-white' : 'border-[#24415e] bg-[#0b1928] text-[#9bb2c9]'} ${collapsed ? 'justify-center px-0' : ''}`}><Mail className="h-4 w-4 text-blue-300" />{!collapsed && <span className="text-[11px] font-black">OUTLOOK MAIL</span>}</Link>
            {(hasFullAccess(user) || hasRole(user, 'officer')) && <Link to={createPageUrl('OfficerChat')} className={`relative mb-1 flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 ${currentPageName === 'OfficerChat' ? 'border-cyan-500/60 bg-[#12304a] text-white' : 'border-[#24415e] bg-[#0b1928] text-[#9bb2c9]'} ${collapsed ? 'justify-center px-0' : ''}`}><Radio className="h-4 w-4 text-cyan-300" />{!collapsed && <span className="text-[11px] font-black">OFFICER CHAT</span>}</Link>}
            {(hasFullAccess(user) || hasRole(user, 'supervisor')) && <Link to={createPageUrl('SupervisorChat')} className={`relative mb-1 flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 ${currentPageName === 'SupervisorChat' ? 'border-emerald-500/60 bg-[#123a35] text-white' : 'border-[#24415e] bg-[#0b1928] text-[#9bb2c9]'} ${collapsed ? 'justify-center px-0' : ''}`}><ShieldCheck className="h-4 w-4 text-emerald-300" />{!collapsed && <span className="text-[11px] font-black">SUPERVISOR CHAT</span>}</Link>}
            <Link to={createPageUrl('Announcements')} className={`relative mb-2 flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 ${currentPageName === 'Announcements' ? 'border-amber-500/60 bg-[#3a2d12] text-white' : 'border-[#24415e] bg-[#0b1928] text-[#9bb2c9]'} ${collapsed ? 'justify-center px-0' : ''}`}><Bell className="h-4 w-4 text-amber-300" />{!collapsed && <span className="text-[11px] font-black">ANNOUNCEMENTS</span>}</Link>
          </>
        )}

        {groups.map((group) => {
          // The Pathfinder Tools window is a page launcher, not another copy of
          // every center's nested navigation. Keep group names internally for
          // filtering/search, but do not render rows such as
          // "Admin Center / Command" or "Officer Center / Field Tools".
          const groupOpen = mobile || Boolean(query) || openNavGroup === group.label;
          return (
            <div key={`${activeCenter}:${group.label}`} className={mobile ? 'mb-1' : 'mb-2'}>
              {!mobile && (!collapsed || mobile) && (
                <button
                  type="button"
                  onClick={() => { if (!query) setNavGroup(group.label, !groupOpen); }}
                  aria-expanded={groupOpen}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-[#7895b2] transition hover:bg-[#0d2135] hover:text-[#9fc7e8]"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${groupOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              {groupOpen && (
                <div className="space-y-1 pb-1">
                  {group.items.map(([label, page, Icon]) => {
                    const active = currentPageName === page;
                    return <Link key={page} to={createPageUrl(page)} title={collapsed && !mobile ? label : undefined} onClick={() => { setNavGroup(group.label, true); onCloseMobile?.(); }} className={`relative flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all duration-200 ${active ? 'border-[#2f6f9d] bg-[#12304a] text-white shadow-[0_6px_18px_rgba(0,0,0,.18)]' : 'border-transparent text-[#91a8bf] hover:bg-[#0d2236] hover:text-white'} ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
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
              )}
            </div>
          );
        })}
        {groups.length === 0 && mobile && query && <div className="px-3 py-8 text-center text-xs text-[#68829b]">No tools match your search.</div>}
      </nav>

      <div className={`border-t border-[#1b3048] bg-[#06101b]/95 backdrop-blur ${mobile ? 'mobile-tool-footer' : 'p-2.5'}`}>
        {(!collapsed || mobile) && <div className={`${mobile ? 'mobile-account-card' : 'mb-2'} rounded-lg border border-[#25435e] bg-gradient-to-br from-[#0e2033] to-[#0a1726] px-3 py-2.5 shadow-inner`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#3d6281] bg-[#13263a] shadow-inner">
              {user?.profile_photo_url
                ? <img src={user.profile_photo_url} alt="User profile" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center text-[#7895b2]"><UserCheck className="h-4 w-4" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[9px] tracking-widest text-[#597491]">{roleName(user)}</div>
              <div className="truncate text-[11px] font-bold leading-tight text-white">{user?.rank || user?.full_name || user?.email || 'AUTHORIZED USER'}</div>
              {user?.rank && user?.last_name && <div className="truncate text-[10px] leading-tight text-[#9fb6cc]">{user.last_name}</div>}
              <div className="secure-session mt-1 text-[9px] text-emerald-400">● SECURE SESSION</div>
            </div>
          </div>
        </div>}
        <button onClick={() => onLogout?.()} className={`mobile-session-action flex h-10 w-full items-center gap-3 rounded px-3 text-[#8399b0] hover:bg-red-950/30 hover:text-red-300 ${collapsed && !mobile ? 'justify-center px-0' : ''}`} title="Sign out" aria-label="Sign out">
          <LogOut className="h-4 w-4" />{(!collapsed || mobile) && <span className="text-[11px] font-bold">SIGN OUT</span>}
        </button>
        <button type="button" onClick={() => setShowDeleteAccountDialog(true)} className={`mobile-session-action flex h-10 w-full items-center gap-3 rounded px-3 text-[#8399b0] hover:bg-red-950/30 hover:text-red-300 ${collapsed && !mobile ? 'justify-center px-0' : ''}`} title="Delete account" aria-label="Request account deletion">
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches);
  const [activeAlert, setActiveAlert] = useState(null);
  const [propertyAlert, setPropertyAlert] = useState(null);
  const [propertyAlertSilenced, setPropertyAlertSilenced] = useState(false);
  const dismissedPropertyAlertIdsRef = useRef(new Set());
  const dismissedPropertyAlertKeysRef = useRef(new Set());
  const [outages, setOutages] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [refreshingApp, setRefreshingApp] = useState(false);
  const [gpsMenuOpen, setGpsMenuOpen] = useState(false);
  const [gpsChanging, setGpsChanging] = useState(false);
  const [externalGps, setExternalGps] = useState(() => getExternalGpsStatus());
  const gpsMenuRef = useRef(null);
  const [search, setSearch] = useState('');
  // The user's primary role owns the initial workspace. Do not bootstrap from a
  // stale browser-wide CAD selection left by a previous page or role.
  const [activeCenter, setActiveCenterState] = useState(() => allowedCenters(user)[0] || 'cad');
  const [unreadCounts, setUnreadCounts] = useState({});
  const mainScrollRef = useRef(null);
  const roleHomeEntryHandledRef = useRef(false);
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

  useEffect(() => subscribeExternalGpsStatus(setExternalGps), []);

  useEffect(() => {
    if (!gpsMenuOpen) return undefined;
    const closeIfOutside = event => {
      if (!gpsMenuRef.current?.contains(event.target)) setGpsMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setGpsMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [gpsMenuOpen]);

  const useDeviceGps = async () => {
    if (gpsChanging) return;
    setGpsChanging(true);
    try {
      if (externalGps.lockedToAntenna) unlockExternalGpsAntenna();
      await disconnectExternalGps();
      toast.success('GPS source changed to Windows / device location.');
      setGpsMenuOpen(false);
    } catch (error) {
      toast.error(error?.message || 'Unable to disconnect the external GPS receiver.');
    } finally {
      setGpsChanging(false);
    }
  };

  const connectExternalAntenna = async (baudRate = externalGps.baudRate || 4800) => {
    if (gpsChanging) return;
    if (!externalGps.serialApiAvailable) {
      toast.error('Direct external GPS is not available in this browser. Use Pathfinder Desktop or Windows Location Services.');
      return;
    }
    if (externalGps.policyAllowed === false) {
      toast.error('Direct external GPS selection is unavailable in this browser session. Use the saved device GPS source or Pathfinder Desktop.');
      return;
    }
    setGpsChanging(true);
    try {
      await requestExternalGpsConnection({ baudRate: Number(baudRate) || 4800 });
      toast.success('External GPS antenna connected. Pathfinder is now using the receiver as the preferred live GPS source.');
      setGpsMenuOpen(false);
    } catch (error) {
      toast.error(error?.message || 'Unable to connect the external GPS antenna.');
    } finally {
      setGpsChanging(false);
    }
  };

  const changeExternalGpsBaud = async value => {
    const baudRate = Number(value);
    if (!Number.isFinite(baudRate) || gpsChanging) return;
    await connectExternalAntenna(baudRate);
  };

  const toggleExternalGpsLock = () => {
    try {
      if (externalGps.lockedToAntenna) {
        unlockExternalGpsAntenna();
        toast.success('GPS antenna lock removed. This computer may use another approved receiver.');
      } else {
        lockExternalGpsToCurrentAntenna();
        toast.success('GPS antenna locked to this computer. Pathfinder will reconnect only to this receiver after logout or restart.');
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to change the GPS antenna lock.');
    }
  };

  const refreshApplication = async () => {
    if (refreshingApp) return;
    setRefreshingApp(true);
    stopAllAlerts();
    stopVoice();
    clearBase44ReadCache();
    try {
      // A stale service worker/cache can keep an older Pathfinder bundle alive
      // after a new Base44 release. Remove only browser asset caches; application
      // data in localStorage/sessionStorage (drafts, preferences, auth) is preserved.
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(async registration => {
          try { await registration.update(); } catch {}
          try { registration.waiting?.postMessage({ type: 'SKIP_WAITING' }); } catch {}
          try { await registration.unregister(); } catch {}
        }));
      }
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map(key => window.caches.delete(key)));
      }
    } catch (error) {
      console.warn('[APP REFRESH] Cache cleanup was partial:', error?.message);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_pathfinder_refresh', String(Date.now()));
    window.location.replace(url.toString());
  };

  const switchCenter = center => {
    const available = allowedCenters(user);
    if (!available.includes(center)) return;

    setActiveCenter(center);
    setMobileSection(null);
    setMobileOpen(false);

    const remembered = centerLastPagesRef.current?.[center];
    const rememberedCenters = remembered ? (PAGE_TO_CENTERS[remembered] || []) : [];
    const desktopDefault = DESKTOP_CENTER_PAGE[center];
    const target = desktopDefault || (remembered && rememberedCenters.includes(center) && canAccessPage(user, remembered)
      ? remembered
      : defaultPageForCenter(center));

    if (target && target !== currentPageName) {
      navigate(createPageUrl(target));
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const updateViewport = event => setIsMobileViewport(event.matches);
    setIsMobileViewport(media.matches);
    media.addEventListener?.('change', updateViewport);
    return () => media.removeEventListener?.('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!user?.id || !currentPageName || roleHomeEntryHandledRef.current) return;
    const primaryCenter = allowedCenters(user)[0] || 'cad';
    const target = defaultPageForUser(user, true);
    const routeKey = `bps-role-home-routed:${user.id}`;
    const isRootLanding = typeof window !== 'undefined' && window.location.pathname === '/';

    // Resolve the role home only from the true root landing route. Direct URLs,
    // browser refreshes, communication links, and task links must remain on the
    // page the user opened instead of being forced back to the dashboard.
    roleHomeEntryHandledRef.current = true;
    sessionStorage.setItem(routeKey, '1');
    if (isRootLanding) {
      setActiveCenter(primaryCenter);
      if (target && target !== currentPageName) navigate(createPageUrl(target), { replace: true });
    }
  }, [user?.id, user?.role, user?.user_type, JSON.stringify(user?.additional_roles || []), currentPageName, isMobileViewport]);

  useEffect(() => {
    const openTools = event => {
      setMobileSection(event?.detail?.section || null);
      setMobileOpen(true);
    };
    window.addEventListener('pathfinder:open-mobile-tools', openTools);
    return () => window.removeEventListener('pathfinder:open-mobile-tools', openTools);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previous = document.body.style.overflow;
    const opener = document.activeElement;
    const drawer = document.querySelector('.pathfinder-mobile-drawer');
    const focusable = () => [...(drawer?.querySelectorAll('button:not([disabled]), a[href], input, select, [tabindex="0"]') || [])].filter(el => el.getClientRects().length);
    focusable()[0]?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') { setMobileOpen(false); setMobileSection(null); }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0], last = items[items.length - 1];
        if (!first) return;
        if (event.shiftKey && (document.activeElement === first || !drawer?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !drawer?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [mobileOpen]);

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
    // Keep persisted Teams unread counts until the Teams monitors publish a
    // verified replacement. Resetting OfficerInbox here hid unread messages
    // every time Layout remounted or the user signed back in.
  }, [unreadStorageKey, user?.id]);

  useEffect(() => {
    const onUnread = event => {
      const page = event.detail?.page;
      if (!page || (page === currentPageName && !event.detail?.absolute)) return;
      setUnreadCounts(current => {
        const nextValue = event.detail?.absolute ? Math.max(0, Number(event.detail?.count) || 0) : (Number(current[page]) || 0) + Math.max(1, Number(event.detail?.count) || 1);
        const next = { ...current, [page]: nextValue };
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
        const [announcements, receipts] = await Promise.all([
          base44.entities.Announcement.list('-created_date', 100),
          base44.entities.AnnouncementReceipt.filter({ user_email: user.email }, '-read_at', 500),
        ]);
        if (!active) return;
        const receiptIds = getLocalReadAnnouncementIds(user.email);
        (receipts || []).forEach(receipt => {
          if (receipt?.announcement_id) receiptIds.add(String(receipt.announcement_id));
        });
        const accountCreated = user.created_date ? new Date(user.created_date).getTime() : 0;
        const canSeeSupervisorAnnouncements = user.role === 'admin' || user.additional_roles?.includes('supervisor');
        const unreadAnnouncements = (announcements || []).filter(a => {
          if (a.audience === 'supervisors' && !canSeeSupervisorAnnouncements) return false;
          const created = new Date(a.created_date || 0).getTime();
          if (!created || (accountCreated && created < accountCreated) || receiptIds.has(a.id)) return false;
          const days = (Date.now() - created) / 86400000;
          return a.priority === 'urgent' ? days <= 30 : a.priority === 'important' ? days <= 14 : days <= 7;
        });
        setUnreadCounts(current => {
          // Teams chat unread counts are owned by TeamsNotificationMonitor. Do not
          // overwrite them with legacy Pathfinder @mention records.
          const next = { ...current, Announcements: unreadAnnouncements.length };
          localStorage.setItem(unreadStorageKey, JSON.stringify(next));
          return next;
        });
      } catch {}
    };
    refreshUnreadFromServer();
    const interval = setInterval(refreshUnreadFromServer, 300000);
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
    // Main Center routes are authoritative. This keeps direct links/refreshes in
    // ClientCenter (and the other consolidated centers) synchronized with the shell.
    if (pageCenter && DESKTOP_CENTER_PAGE[pageCenter] === currentPageName && activeCenter !== pageCenter) {
      setActiveCenter(pageCenter);
    }
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
      if (currentPageName === 'OutlookMail' || !current[currentPageName]) return current;
      const next = { ...current, [currentPageName]: 0 };
      localStorage.setItem(unreadStorageKey, JSON.stringify(next));
      return next;
    });
  }, [currentPageName, unreadStorageKey]);

  // Keep the selected workspace locked while navigating pages. A route must never
  // silently switch the sidebar to another center; only the workspace selector may
  // change activeCenter. Access changes are handled by the availability effect below.

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => base44.entities.SystemOutage.filter({ resolved_at: null }).then(rows => {
      if (active) setOutages(rows || []);
    }).catch(() => { if (active) setOutages([]); });
    load();
    let unsubscribe;
    try { unsubscribe = base44.entities.SystemOutage.subscribe(() => load()); } catch {}
    // Realtime owns fast updates; the slow poll only repairs a dropped subscription.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
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
    // Every signed-in operational user must receive property alerts. Some legacy
    // accounts can open CAD through permission flags that are not represented in
    // role/additional_roles, so a narrow role gate could silently disable alerts.
    const roles = normalizedRoles(user);
    const isNonOperational = user?.user_type === 'client' || roles.has('client') || roles.has('student');
    if (!user?.id || isNonOperational) return undefined;
    let cancelled = false;

    let monitorInFlight = false;
    let rateLimitBackoffUntil = 0;
    const monitor = async () => {
      if (cancelled || monitorInFlight || document.visibilityState !== 'visible' || Date.now() < rateLimitBackoffUntil) return;
      monitorInFlight = true;
      try {
        // PropertyAlert is a shared event; acknowledgement/silence is stored per user.
        // Dedupe by call+property so legacy duplicate alert rows cannot re-open the popup.
        const [alerts, receipts, calls, locations] = await Promise.all([
          base44.entities.PropertyAlert.list('-created_date', 100).catch(() => []),
          user?.email ? base44.entities.PropertyAlertReceipt.filter({ user_email: String(user.email).trim().toLowerCase() }, '-dismissed_at', 100).catch(() => []) : Promise.resolve([]),
          base44.entities.DispatchCall.list('-created_date', 75).catch(() => []),
          base44.entities.Location.list('site_name', 100).catch(() => []),
        ]);
        const dismissedPairs = new Set((receipts || []).map(item => `${item.call_id}:${item.property_id}`));
        const dismissedEventKeys = new Set((receipts || []).map(item => String(item.event_key || '')).filter(Boolean));
        const localDismissKey = `bps:property-alert-dismissed:${String(user?.email || user?.id || '').trim().toLowerCase()}`;
        let locallyDismissed = new Set();
        try {
          locallyDismissed = new Set(JSON.parse(window.localStorage.getItem(localDismissKey) || '[]'));
        } catch {
          locallyDismissed = new Set();
        }
        const callById = new Map((calls || []).map(call => [String(call.id), call]));
        const locationById = new Map((locations || []).map(location => [String(location.id), location]));
        const recentCutoff = Date.now() - (6 * 60 * 60 * 1000);
        const seenPairs = new Set();
        const record = (alerts || []).find(item => {
          const pair = `${item.callId}:${item.propertyId}`;
          const linkedCall = callById.get(String(item.callId));
          const stableCallId = linkedCall?.external_call_id || linkedCall?.agency_cad_number || linkedCall?.bps_reference || linkedCall?.call_id || linkedCall?.id || item.source_key || item.callId;
          const eventKey = `${item.propertyId}|${stableCallId}`;
          const eventTime = new Date(item.callTime || item.time_received || item.created_date || 0).getTime();
          const location = locationById.get(String(item.propertyId));
          const inactiveProperty = !location || location.active === false || location.property_monitoring_enabled !== true;
          const inactiveCall = !linkedCall || HIDDEN_PROPERTY_ALERT_STATUSES.has(normalizedCallStatus(linkedCall.status));
          if (inactiveProperty || inactiveCall || seenPairs.has(eventKey)) return false;
          seenPairs.add(eventKey);
          return Number.isFinite(eventTime)
            && eventTime >= recentCutoff
            && !dismissedPairs.has(pair)
            && !dismissedEventKeys.has(eventKey)
            && !locallyDismissed.has(pair)
            && !locallyDismissed.has(eventKey)
            && !dismissedPropertyAlertKeysRef.current.has(eventKey)
            && !dismissedPropertyAlertIdsRef.current.has(item.id);
        });
        if (!record || cancelled) {
          if (!cancelled) {
            setPropertyAlert(null);
            setPropertyAlertSilenced(false);
          }
          return;
        }
        const linkedCall = callById.get(String(record.callId));
        const location = locationById.get(String(record.propertyId));
        const call = linkedCall || {
          id: record.callId,
          incident: record.callIncident || 'Unknown incident',
          location: record.callLocation || location?.address || '',
          status: 'New',
          time_received: record.callTime || record.time_received || record.created_date,
          created_date: record.created_date,
        };
        const stableCallId = call.external_call_id || call.agency_cad_number || call.bps_reference || call.call_id || call.id || record.source_key;
        const propertyId = location?.id || record.propertyId;
        const key = `${propertyId}|${stableCallId}`;
        const relation = String(record.description || '').toLowerCase().includes('inside') ? 'inside' : 'nearby';
        setPropertyAlert({
          alertId: record.id,
          call,
          property: {
            id: location?.id || record.propertyId,
            location_id: location?.id || record.propertyId,
            name: location?.site_name || record.propertyName || 'Monitored Property',
            address: location?.address || '',
          },
          relation,
          distanceFeet: Math.round(Number(record.distanceMeters || 0) / 0.3048),
          key,
        });
        setPropertyAlertSilenced(false);
        // Voice delivery is owned app-wide by GlobalMessageBanner, using the same
        // subscription and speech path as BOLO announcements. This effect only
        // owns the persistent property-call popup and acknowledgement state.
      } catch (error) {
        const message = String(error?.message || error || '');
        if (/rate limit|too many requests|\b429\b/i.test(message)) {
          rateLimitBackoffUntil = Date.now() + 2 * 60 * 1000;
        } else {
          console.warn('Property alert display check failed:', error?.message);
        }
      } finally {
        monitorInFlight = false;
      }
    };

    // Let the dashboard's Active Calls request own the startup lane. Realtime is
    // already connected below, so delaying this history reconciliation does not
    // prevent newly-created property alerts from being observed.
    const initialMonitorTimer = window.setTimeout(monitor, 5000);
    // Realtime owns fast delivery. Use one slow fallback poll and debounce entity
    // events so a burst of alert writes cannot fan out into four list requests per event.
    let refreshTimer;
    const scheduleMonitor = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!cancelled && document.visibilityState === 'visible') monitor();
      }, 1200);
    };
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') monitor();
    }, 120000);
    const unsubscribeAlerts = base44.entities.PropertyAlert.subscribe(scheduleMonitor);
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') scheduleMonitor();
    };
    const recoverPropertyAlerts = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!cancelled) monitor();
      }, 250);
    };
    document.addEventListener('visibilitychange', refreshOnVisibility);
    window.addEventListener('bps-operational-resume', recoverPropertyAlerts);
    window.addEventListener('online', recoverPropertyAlerts);
    window.addEventListener('pageshow', recoverPropertyAlerts);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.clearTimeout(initialMonitorTimer);
      window.clearTimeout(refreshTimer);
      unsubscribeAlerts?.();
      document.removeEventListener('visibilitychange', refreshOnVisibility);
      window.removeEventListener('bps-operational-resume', recoverPropertyAlerts);
      window.removeEventListener('online', recoverPropertyAlerts);
      window.removeEventListener('pageshow', recoverPropertyAlerts);
    };
  }, [user?.id, user?.email, user?.role, user?.user_type, JSON.stringify(user?.additional_roles || [])]);

  const dismissPropertyAlert = async (action = 'acknowledged') => {
    if (!propertyAlert) return false;
    stopAllAlerts();
    stopVoice();
    if (action === 'silenced') setPropertyAlertSilenced(true);

    const stableCallId = propertyAlert.call.external_call_id || propertyAlert.call.agency_cad_number || propertyAlert.call.bps_reference || propertyAlert.call.call_id || propertyAlert.call.id;
    const pairKey = `${propertyAlert.property.id}|${stableCallId}`;
    const rawPairKey = `${propertyAlert.call.id}:${propertyAlert.property.id}`;
    const dismissedIds = [];
    dismissedPropertyAlertKeysRef.current.add(pairKey);
    const localDismissKey = `bps:property-alert-dismissed:${String(user?.email || user?.id || '').trim().toLowerCase()}`;
    try {
      const saved = new Set(JSON.parse(window.localStorage.getItem(localDismissKey) || '[]'));
      saved.add(pairKey);
      saved.add(rawPairKey);
      window.localStorage.setItem(localDismissKey, JSON.stringify([...saved].slice(-1000)));
    } catch {
      // Server-side PropertyAlertReceipt remains the durable cross-device source.
    }
    try {
      // Hide every legacy duplicate row for this call/property immediately in this session.
      const records = await base44.entities.PropertyAlert.filter({ callId: propertyAlert.call.id, propertyId: propertyAlert.property.id }).catch(() => []);
      for (const record of records || []) {
        dismissedPropertyAlertIdsRef.current.add(record.id);
        dismissedIds.push(record.id);
      }

      // One receipt is enough because it is keyed to the user + call + property.
      const result = await base44.functions.invoke('acknowledgePropertyAlert', {
        alert_id: propertyAlert.alertId,
        action,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);

      setPropertyAlert(null);
      setPropertyAlertSilenced(false);
      return true;
    } catch (error) {
      // Keep the local dismissal so a call the officer already saw does not pop
      // back up after a browser refresh while the server receipt is retrying.
      setPropertyAlertSilenced(false);
      console.warn('Unable to save property alert dismissal:', error?.message);
      toast.error(action === 'silenced' ? 'Unable to silence this property call for your account.' : 'Unable to acknowledge this property call.');
      return false;
    }
  };

  const acknowledgePropertyAlert = () => dismissPropertyAlert('acknowledged');

  const openPropertyCadCall = async () => {
    const call = propertyAlert?.call;
    if (!call?.id) return;
    const params = new URLSearchParams({ callId: call.id });
    if (Number.isFinite(Number(call.latitude)) && Number.isFinite(Number(call.longitude))) {
      params.set('lat', String(call.latitude));
      params.set('lng', String(call.longitude));
    }
    const acknowledged = await acknowledgePropertyAlert();
    if (!acknowledged) return;
    navigate(`${createPageUrl('Navigation')}?${params.toString()}`);
  };

  const openMobileToolsMenu = () => {
    setMobileSection(null);
    setSearch('');
    const centers = allowedCenters(user);
    if (!centers.includes(activeCenter)) setActiveCenter(centers[0] || 'officer');
    setMobileOpen(true);
  };

  if (!canAccessPage(user, currentPageName)) {
    return <Navigate to={createPageUrl(defaultPageForUser(user, true))} replace />;
  }

  // Keep direct task and tool routes on the page the user opened. Center pages
  // remain available from the workspace selector, but desktop navigation must not
  // rewrite an inner-page URL back to a center landing page.
  const criticalOutage = outages.some(item => item.severity === 'outage');
  const centerLabel = CENTER_CONFIG[activeCenter]?.label || 'CAD Center';
  const primaryCenter = allowedCenters(user)[0] || 'officer';
  const userHomePage = defaultPageForUser(user, true);
  const userHomeLabel = userHomePage === 'AdminCenter'
    ? 'Admin Main'
    : `${String(CENTER_CONFIG[primaryCenter]?.label || 'Pathfinder').replace(/\s+Center$/i, '')} Main`;

  const requireMicrosoftConnection = MICROSOFT_TOOL_PAGES.has(currentPageName);

  return <MicrosoftMailSetupGate user={user} enabled={requireMicrosoftConnection}><div className="fixed inset-0 flex overflow-hidden bg-[#050a12] text-white cad-app"><AdminHourlySystemScan user={user} /><PerformanceReviewTaskGate user={user} /><NotificationMonitor user={user} /><OutlookNotificationMonitor user={user} /><TeamsNotificationMonitor user={user} /><SupervisorOperationsMonitor user={user} /><GlobalMessageBanner user={user} /><WelcomeBriefing user={user} /><MandatoryReadGate user={user} /><ForcedOOSOverlay />
    <AnimatePresence>{mobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-2 backdrop-blur-[4px] sm:p-5" onClick={() => { setMobileOpen(false); setMobileSection(null); }}>
      <motion.section initial={{ scale: 0.96, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.97, y: 12, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="pathfinder-mobile-drawer h-[min(80dvh,640px)] w-[min(94vw,620px)] overflow-hidden rounded-2xl border border-[#315879] bg-[#06101b] shadow-[0_30px_100px_rgba(0,0,0,.7)]" role="dialog" aria-modal="true" aria-label={mobileSection === 'reports' ? 'Reports' : 'Pathfinder tools'} onClick={event => event.stopPropagation()}>
        <Sidebar mobile mobileSection={mobileSection} user={user} activeCenter={activeCenter} setActiveCenter={switchCenter} currentPageName={currentPageName} search={search} setSearch={setSearch} unreadCounts={unreadCounts} onCloseMobile={() => { setMobileOpen(false); setMobileSection(null); }} onLogout={() => { if (user?.id) sessionStorage.removeItem(`bps-role-home-routed:${user.id}`); logout(true); }} />
      </motion.section>
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{propertyAlert && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100010] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
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
              <div className="text-xs font-black uppercase tracking-[0.25em] text-red-300">Active Call for Service</div>
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
              <div className="mt-2 text-2xl font-black text-white">{cleanIncident(propertyAlert.call)}</div>
              <div className="mt-1 flex items-start gap-2 text-sm text-slate-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />{propertyAlert.call.location}</div>
              <div className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Call received {formatEasternDateTime(propertyAlert.call.time_received || propertyAlert.call.created_date)} ET</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-slate-700 bg-slate-900/70 p-3"><div className="text-slate-500">PROPERTY ADDRESS</div><div className="mt-1 font-bold text-slate-100">{propertyAlert.property.address}</div></div>
              <div className="rounded border border-slate-700 bg-slate-900/70 p-3"><div className="text-slate-500">CALL STATUS</div><div className="mt-1 font-bold text-slate-100">{propertyAlert.call.status || 'New'} · {(propertyAlert.call.priority || 'medium').toUpperCase()}</div></div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => dismissPropertyAlert('silenced')}
                disabled={propertyAlertSilenced}
                aria-pressed={propertyAlertSilenced}
                className="rounded-lg border border-amber-500/60 bg-amber-950/40 px-5 py-3 text-sm font-black text-amber-200 hover:bg-amber-900/50 disabled:cursor-default disabled:opacity-70"
              >
                {propertyAlertSilenced ? 'SILENCING…' : 'SILENCE FOR ME'}
              </button>
              <button type="button" onClick={acknowledgePropertyAlert} className="rounded-lg border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-black text-slate-100 hover:bg-slate-700">ACKNOWLEDGE</button>
              <button type="button" onClick={openPropertyCadCall} className="rounded-lg border border-blue-400 bg-blue-600 px-5 py-3 text-center text-sm font-black text-white hover:bg-blue-500">OPEN CAD CALL</button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>

    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="pathfinder-header flex min-h-14 shrink-0 items-center justify-between border-b border-[#1c3049] bg-[#08111f] px-2 pb-0 md:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <button type="button" onClick={openMobileToolsMenu} className="hidden min-h-10 items-center gap-2 rounded-lg border border-[#315879] bg-[#10263a] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100 shadow-sm transition hover:border-cyan-500/70 hover:bg-[#153552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 xl:flex" aria-label="Open Pathfinder tools">
            <Menu className="h-4 w-4" />
            <span>Tools</span>
          </button>
          {!ROOT_PAGES.has(currentPageName) && (
            <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate(createPageUrl(userHomePage))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#294867] text-[#a8c3dc] xl:hidden" aria-label="Go back"><ChevronLeft className="h-5 w-5" /></button>
          )}
          <Link
            to={createPageUrl(userHomePage)}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-blue-400/80 bg-blue-600/25 px-2.5 text-[10px] font-black uppercase tracking-wider text-blue-50 shadow-sm hover:bg-blue-600/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:gap-2 sm:px-3"
            aria-label={`Return to ${userHomeLabel}`}
            title={`Return to ${userHomeLabel}`}
          >
            <Home className="h-4 w-4" />
            <span className="sm:hidden">Main</span>
            <span className="hidden sm:inline">{userHomeLabel}</span>
          </Link>
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white xl:tracking-[0.15em]"><span className="xl:hidden">{pageLabel(currentPageName)}</span><span className="hidden xl:inline">{centerLabel}</span></div>
            <div className="truncate text-[9px] tracking-widest text-[#607c98]"><span className="xl:hidden">FIELD OPERATIONS</span><span className="hidden xl:inline">UNIFIED OPERATIONS PLATFORM</span></div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-[#7791aa]">
          <button
            type="button"
            onClick={() => navigate(createPageUrl('SystemStatus'))}
            className={`hidden min-h-9 items-center gap-1.5 rounded-lg border px-2.5 font-black uppercase tracking-[0.08em] transition sm:flex ${criticalOutage ? 'border-red-600/70 bg-red-950/40 text-red-200 hover:border-red-400 hover:bg-red-900/50' : outages.length ? 'border-amber-600/60 bg-amber-950/30 text-amber-200 hover:border-amber-400' : 'border-slate-600 bg-slate-900/70 text-slate-200 hover:border-cyan-500 hover:text-cyan-200'}`}
            title="Open Pathfinder system status and diagnostics"
            aria-label="Open Pathfinder system status"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>{criticalOutage ? 'SYSTEM OUTAGE' : 'SYSTEM STATUS'}</span>
            {outages.length > 0 && <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[8px]">{outages.length}</span>}
          </button>
          <div ref={gpsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setGpsMenuOpen(open => !open)}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 font-black uppercase tracking-[0.08em] transition sm:px-3 ${externalGps.connected ? 'border-cyan-500/70 bg-cyan-950/35 text-cyan-100 hover:bg-cyan-900/45' : 'border-slate-600 bg-slate-900/70 text-slate-200 hover:border-slate-500 hover:bg-slate-800'}`}
              title="Change GPS / external antenna source"
              aria-label="Change GPS or external antenna source"
              aria-expanded={gpsMenuOpen}
            >
              <Radio className={`h-3.5 w-3.5 ${externalGps.connecting ? 'animate-pulse' : ''}`} />
              <span className="hidden md:inline">GPS {externalGps.connecting ? 'CONNECTING' : externalGps.connected ? 'EXTERNAL' : 'DEVICE'}</span>
              <span className="md:hidden">GPS</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${gpsMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {gpsMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-[180] w-[min(92vw,330px)] overflow-hidden rounded-xl border border-[#315879] bg-[#071421] shadow-[0_18px_55px_rgba(0,0,0,.65)]">
                <div className="border-b border-[#233b55] bg-[#0b1c2b] px-3 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">GPS / External Antenna</div>
                  <div className="mt-1 text-[11px] font-bold text-white">
                    {externalGps.connecting ? 'Connecting to receiver…' : externalGps.connected ? 'External USB / NMEA receiver active' : 'Windows / device location active'}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400">
                    {externalGps.connected && <span>Baud {externalGps.baudRate || 4800}</span>}
                    {externalGps.satellites != null && <span>{externalGps.satellites} satellites</span>}
                    {externalGps.backgroundReader && <span className="text-emerald-300">Background reader active</span>}
                    {externalGps.lockedToAntenna && <span className="text-cyan-300">Locked to saved antenna</span>}
                  </div>
                  {externalGps.error && <div className="mt-2 rounded-md border border-red-800/60 bg-red-950/40 px-2 py-1.5 text-[9px] font-bold text-red-200">{externalGps.error}</div>}
                </div>

                <div className="space-y-2 p-3">
                  <button
                    type="button"
                    onClick={useDeviceGps}
                    disabled={gpsChanging}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50 ${!externalGps.connected ? 'border-emerald-600/60 bg-emerald-950/30' : 'border-slate-700 bg-[#0b1725] hover:border-slate-500'}`}
                  >
                    <div className="text-[10px] font-black uppercase text-white">Windows / Device GPS</div>
                    <div className="mt-0.5 text-[9px] text-slate-400">Use the computer, tablet, or Windows Location Services source.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => connectExternalAntenna(externalGps.baudRate || 4800)}
                    disabled={gpsChanging}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${externalGps.connected ? 'border-cyan-500/60 bg-cyan-950/30' : 'border-blue-700 bg-blue-950/25 hover:border-blue-500'}`}
                  >
                    <div className="text-[10px] font-black uppercase text-white">{externalGps.connected ? 'Change External GPS Antenna' : 'Connect External GPS Antenna'}</div>
                    <div className="mt-0.5 text-[9px] text-slate-400">{externalGps.policyAllowed === false ? 'Direct antenna selection is unavailable in this browser session.' : 'Choose an approved USB / serial NMEA receiver or COM device.'}</div>
                  </button>

                  <button
                    type="button"
                    onClick={toggleExternalGpsLock}
                    disabled={gpsChanging || (!externalGps.connected && !externalGps.lockedToAntenna)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${externalGps.lockedToAntenna ? 'border-cyan-500/70 bg-cyan-950/35' : 'border-slate-700 bg-[#0b1725] hover:border-cyan-600/70'}`}
                  >
                    <div className="text-[10px] font-black uppercase text-white">{externalGps.lockedToAntenna ? 'Unlock Saved Antenna' : 'Lock This Antenna To This Computer'}</div>
                    <div className="mt-0.5 text-[9px] text-slate-400">{externalGps.lockedToAntenna ? 'The saved receiver will remain preferred across logout, refresh, and restart until you unlock it.' : 'Prevent this computer from automatically switching to another approved GPS receiver.'}</div>
                  </button>

                  <div className="rounded-lg border border-slate-700 bg-[#0b1725] p-2.5">
                    <label htmlFor="pathfinder-gps-baud" className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Receiver baud rate</label>
                    <select
                      id="pathfinder-gps-baud"
                      value={String(externalGps.baudRate || 4800)}
                      onChange={event => changeExternalGpsBaud(event.target.value)}
                      disabled={!externalGps.serialApiAvailable || externalGps.policyAllowed === false || gpsChanging}
                      className="mt-1.5 h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-2 text-[11px] font-bold text-white outline-none focus:border-cyan-500"
                    >
                      <option value="4800">4800 baud</option>
                      <option value="9600">9600 baud</option>
                      <option value="38400">38400 baud</option>
                    </select>
                    <div className="mt-1 text-[8px] leading-4 text-slate-500">Changing the baud rate will reopen the external receiver chooser so Pathfinder connects using the selected speed.</div>
                  </div>

                  {!externalGps.serialApiAvailable && (
                    <div className="rounded-lg border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-[9px] leading-4 text-amber-200">
                      This browser does not expose direct Serial access. Use Pathfinder Desktop or Windows/device GPS.
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
          <CadAudioToggle />

          <button
            type="button"
            onClick={refreshApplication}
            disabled={refreshingApp}
            className="flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-600/60 bg-emerald-950/30 px-2.5 font-black uppercase tracking-[0.08em] text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-900/40 disabled:cursor-wait disabled:opacity-60 sm:px-3"
            title="Load the newest Pathfinder update"
            aria-label="Refresh Pathfinder and load the newest update"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshingApp ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshingApp ? 'Refreshing' : 'Refresh App'}</span>
          </button>
          <div className="pathfinder-header-clock hidden shrink-0 text-right font-mono leading-tight text-[#9fb6cc] lg:block">
            <div className="text-[11px] font-black tracking-wider text-white">{clock.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            <div className="text-[8px] font-bold tracking-[0.12em] text-[#7894af]">{clock.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()} ET</div>
          </div>

        </div>
      </header>

      <GlobalOperationsTicker user={user} currentPageName={currentPageName} />

      <AdminClientPreviewBar user={user} activeCenter={activeCenter} />
      <main ref={mainScrollRef} data-page={currentPageName} className={`bps-command-page mobile-field-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y ${OFFICER_MODERN_PAGES.has(currentPageName) ? 'officer-modern-workspace' : ''} ${MODERNIZED_WORKSPACE_PAGES.has(currentPageName) ? 'pathfinder-modern-page' : ''} ${DARK_WORKSPACE_PAGES.has(currentPageName) ? 'dark-workspace bg-[#07101b] text-white' : 'night-workspace bg-[#0b1420] text-slate-100'}`}>{children}</main>
    </section>
    <MobileFieldNav
      currentPageName={currentPageName}
      unreadCounts={unreadCounts}
      activeCenter={activeCenter}
      user={user}
      centerDestinations={{
        cad: centerLastPagesRef.current.cad || 'CommandDashboard',
        officer: centerLastPagesRef.current.officer || 'Dashboard',
        supervisor: centerLastPagesRef.current.supervisor || 'SupervisorCenter',
        admin: centerLastPagesRef.current.admin || 'AdminDashboard',
      }}
      onTabNavigate={() => {
        if (mainScrollRef.current && currentPageName) {
          const position = mainScrollRef.current.scrollTop;
          scrollPositionsRef.current[currentPageName] = position;
          sessionStorage.setItem(`bps-mobile-scroll:${currentPageName}`, String(position));
        }
      }}
      onReports={() => { const centers = allowedCenters(user); setActiveCenter(centers.includes('supervisor') ? 'supervisor' : 'officer'); setMobileSection('reports'); setMobileOpen(true); }}
      onMenu={openMobileToolsMenu}
    />
  </div></MicrosoftMailSetupGate>;
}