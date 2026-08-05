import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  FileText,
  AlertTriangle,
  UserX,
  Wrench,
  CalendarClock,
  LogOut,
  Shield,
  Users,
  ClipboardList,
  MessageCircle,
  Megaphone,
  MapPin,
  Activity,
  DoorOpen,
  DollarSign,
  Briefcase,
  ClipboardCheck,
  FileWarning,
  UserCheck,
  Settings,
  Layers,
  ChevronDown,
  ChevronRight,
  Car,
  ShieldCheck,
  BookOpen,
  GraduationCap,
  Bell,
  CalendarDays,
  Award,
  Package,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import CertificationMonitor from "../components/CertificationMonitor";
import BackgroundLocationTracker from "../components/BackgroundLocationTracker";
import AdminAlertMonitor from "../components/AdminAlertMonitor";
import NotificationCenter from "../components/NotificationCenter";

import PWAManager from "../components/PWAManager";
import TopNotificationBanner from "../components/TopNotificationBanner";
import BottomTabBar from "../components/BottomTabBar";
import { motion, AnimatePresence } from "framer-motion";


const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

const getAllOfficerNavigationItems = (user) => {
  const divisionName = user?.division || '';
  const subdivisionName = user?.subdivision || '';
  const isAdmin = user?.role === 'admin';
  const isVADivision = isAdmin || divisionName === 'Virginia' || divisionName.startsWith('Division 1') || divisionName.startsWith('Division 2') || divisionName.startsWith('Division 3');
  const isMDDivision = isAdmin || divisionName === 'Maryland' || divisionName.startsWith('Division 4');

  const baseItems = [
    // Dashboard & Profile
    { id: "dashboard", title: "Dashboard", url: createPageUrl("Dashboard"), icon: LayoutDashboard, category: "main" },
    { id: "profile", title: "My Profile", url: createPageUrl("OfficerProfile"), icon: UserCheck, category: "main" },
    { id: "my_performance", title: "My Performance", url: createPageUrl("MyPerformanceAnalytics"), icon: ClipboardList, category: "main" },

    // Schedule & Time
    { id: "time_clock", title: "Time Clock", url: createPageUrl("TimeClock"), icon: Clock, category: "schedule" },
    { id: "schedule", title: "My Schedule", url: createPageUrl("Schedule"), icon: Calendar, category: "schedule" },
    
    { id: "open_shifts", title: "Open Shifts", url: createPageUrl("OpenShifts"), icon: Briefcase, category: "schedule" },
    { id: "time_requests", title: "Time Requests", url: createPageUrl("TimeRequests"), icon: CalendarClock, category: "schedule" },
    { id: "payroll_dates", title: "Payroll Dates", url: createPageUrl("PayrollDates"), icon: DollarSign, category: "schedule" },
    // Reports
    { id: "daily_activity_reports", title: "Daily Activity Reports", url: createPageUrl("DailyActivityReports"), icon: ClipboardList, category: "reports" },
    { id: "incident_reports", title: "Incident Reports", url: createPageUrl("IncidentReports"), icon: AlertTriangle, category: "reports" },

    { id: "maintenance_reports", title: "Maintenance", url: createPageUrl("MaintenanceReports"), icon: Wrench, category: "reports" },
    { id: "open_door_reports", title: "Open Door Reports", url: createPageUrl("OpenDoorReports"), icon: DoorOpen, category: "reports" },
    { id: "confidential_report", title: "Confidential Report", url: createPageUrl("ConfidentialReport"), icon: ShieldCheck, category: "reports" },
    // Communication

    { id: "team_chat", title: "Team Chat", url: createPageUrl("TeamChat"), icon: MessageCircle, category: "communication" },
    { id: "announcements", title: "Announcements", url: createPageUrl("Announcements"), icon: Megaphone, category: "communication" },
    { id: "expense_reports", title: "Expense Reports", url: createPageUrl("ExpenseReports"), icon: DollarSign, category: "communication" },
    // Resources
    { id: "rank_duties", title: "Rank Duties", url: createPageUrl("RankDuties"), icon: Shield, category: "resources" },
    { id: "post_orders", title: "Post Orders", url: createPageUrl("PostOrders"), icon: BookOpen, category: "resources" },
    { id: "training", title: "Training & Compliance", url: createPageUrl("OfficerTraining"), icon: GraduationCap, category: "resources" },
    { id: "qr_patrol_scan", title: "QR Patrol Scan", url: createPageUrl("QRPatrolScan"), icon: MapPin, category: "reports" },
  ];

  // Add VA-specific items for Division 1, 2, 3
  if (isVADivision) {
    baseItems.push(
      { id: "va_trespass_notices", title: "VA Trespass Notices", url: createPageUrl("VATrespassNotices"), icon: UserX, category: "reports" },
      { id: "va_criminal_complaints", title: "VA Criminal Complaint", url: createPageUrl("VACriminalComplaints"), icon: Shield, category: "reports" }
    );
  }

  // Add MD-specific items for Division 4
  if (isMDDivision) {
    baseItems.push(
      { id: "md_trespass_notices", title: "MD Trespass Notices", url: createPageUrl("MDTrespassNotices"), icon: UserX, category: "reports" },
      { id: "md_criminal_complaints", title: "MD Criminal Complaint", url: createPageUrl("MDCriminalComplaints"), icon: Shield, category: "reports" }
    );
  }

  return baseItems;
};

const supervisorNavigationItems = [
  { title: "My Action Items", url: createPageUrl("SupervisorTasks"), icon: ClipboardList },
  { title: "My Daily Code", url: createPageUrl("SupervisorDailyCode"), icon: ShieldCheck },
  { title: "Rank Structure", url: createPageUrl("RankStructure"), icon: Shield },
  { title: "Division Directory", url: createPageUrl("DivisionDirectory"), icon: Users },
  { title: "Performance Review Tasks", url: createPageUrl("SupervisorPerformanceReview"), icon: ClipboardList },
  { title: "Officer Inspections", url: createPageUrl("SupervisorInspections"), icon: ClipboardCheck },
  { title: "Write-Up Reports", url: createPageUrl("SupervisorWriteUps"), icon: FileWarning },
  { title: "Use-of-Force Reports", url: createPageUrl("SupervisorUseOfForce"), icon: AlertTriangle },
  { title: "File Complaints", url: createPageUrl("SupervisorComplaints"), icon: AlertTriangle },
  { title: "Call-Out Management", url: createPageUrl("SupervisorCallOuts"), icon: UserCheck },
  { title: "Supervisor Chat", url: createPageUrl("SupervisorChat"), icon: MessageCircle },
];

const adminNavigationItems = [
  // Dashboard & Analytics
  { title: "Admin Dashboard", url: createPageUrl("AdminDashboard"), icon: Shield, category: "dashboard" },
  { title: "Pending Users", url: createPageUrl("AdminUsers"), icon: Users, category: "dashboard" },
  { title: "Manage Company Employees", url: createPageUrl("ManageCompanyEmployees"), icon: Briefcase, category: "dashboard" },
  { title: "Company Analytics", url: createPageUrl("AdminAnalytics"), icon: ClipboardList, category: "dashboard" },
  { title: "Geofence Alerts", url: createPageUrl("AdminGeofenceAlerts"), icon: MapPin, category: "dashboard" },
  // Team Management
  { title: "Officer Location Tracker", url: createPageUrl("AdminLocationTracker"), icon: Activity, category: "reports" },
  { title: "QR Checkpoints", url: createPageUrl("AdminQRCheckpoints"), icon: MapPin, category: "reports" },
  { title: "QR Print Manager", url: createPageUrl("AdminQRPrintManager"), icon: MapPin, category: "reports" },
  { title: "QR Patrol Reports", url: createPageUrl("AdminQRReports"), icon: MapPin, category: "reports" },
  { title: "Send Notifications", url: createPageUrl("AdminNotifications"), icon: Bell, category: "team" },
  { title: "Commendations", url: createPageUrl("AdminCommendations"), icon: Award, category: "team" },
  { title: "Complaints", url: createPageUrl("AdminComplaints"), icon: AlertTriangle, category: "team" },
  { title: "Performance Reviews", url: createPageUrl("AdminPerformanceReviews"), icon: ClipboardCheck, category: "team" },
  // Reports
  { title: "All Reports", url: createPageUrl("AdminReports"), icon: ClipboardList, category: "reports" },
  { title: "Supervisor Reports", url: createPageUrl("AdminSupervisorReports"), icon: UserCheck, category: "reports" },
  { title: "Confidential Reports", url: createPageUrl("AdminConfidentialReports"), icon: ShieldCheck, category: "reports" },
  // Scheduling
  { title: "Scheduling", url: createPageUrl("AdminScheduling"), icon: Calendar, category: "scheduling" },
  { title: "Planned Shifts", url: createPageUrl("AdminPlannedShifts"), icon: CalendarDays, category: "scheduling" },
  { title: "Shift Bids", url: createPageUrl("AdminShiftBids"), icon: Briefcase, category: "scheduling" },
  // Communication
  { title: "Announcements", url: createPageUrl("AdminAnnouncements"), icon: Megaphone, category: "communication" },
  { title: "Manage Post Orders", url: createPageUrl("AdminPostOrders"), icon: BookOpen, category: "communication" },
  { title: "Special Coverage Requests", url: createPageUrl("AdminSpecialRequests"), icon: CalendarClock, category: "communication" },
  { title: "Client Feedback", url: createPageUrl("AdminClientFeedback"), icon: Award, category: "communication" },
  { title: "Supervisor Site Check Admin", url: createPageUrl("AdminSupervisorCodes"), icon: ShieldCheck, category: "reports" },
];

// Remove the old 'Manage Officers' item - now split into Pending Users and Manage Company Employees
const trainingPortalNavigationItems = [
  { title: "Training Creation", url: createPageUrl("AdminTraining"), icon: GraduationCap },
  { title: "Training & Compliance", url: createPageUrl("AdminTrainingCompliance"), icon: GraduationCap },
  { title: "Training Tracker", url: createPageUrl("TrainingComplianceTracker"), icon: GraduationCap },
  { title: "Certification Alerts", url: createPageUrl("AdminCertificationAlerts"), icon: AlertTriangle },
  { title: "Manage Students", url: createPageUrl("ManageStudents"), icon: Users },
  { title: "Training Records", url: createPageUrl("TrainingRecords"), icon: BookOpen },
];

const accountingNavigationItems = [
  // Payroll & Tax
  { title: "Payroll Management", url: createPageUrl("AccountingPayroll"), icon: DollarSign, category: "payroll" },
  // Billing & Invoices
  { title: "Client Invoices", url: createPageUrl("AccountingInvoices"), icon: FileText, category: "billing" },
  // Financial Reports
  { title: "Company Profit Report", url: createPageUrl("AccountingProfit"), icon: DollarSign, category: "reports" },
  { title: "PTO Loss Report", url: createPageUrl("AdminPTOLossReport"), icon: AlertTriangle, category: "reports" },
  // Approvals
  { title: "Expense Approval", url: createPageUrl("AdminExpenseApproval"), icon: DollarSign, category: "approvals" },
];

const clientNavigationItems = [
  { title: "Dashboard", url: createPageUrl("ClientDashboard"), icon: LayoutDashboard },
  { title: "Security Alerts", url: createPageUrl("ClientAlerts"), icon: AlertTriangle },
  { title: "Special Requests", url: createPageUrl("ClientSpecialRequests"), icon: CalendarClock },
  { title: "Site Supervisors", url: createPageUrl("ClientSupervisors"), icon: UserCheck },
  { title: "All Reports", url: createPageUrl("ClientReports"), icon: FileText },
  { title: "QR Patrol Reports", url: createPageUrl("ClientQRReports"), icon: MapPin },
  { title: "Payroll & Invoicing", url: createPageUrl("ClientPayrollReport"), icon: DollarSign },
  { title: "Trespass Management", url: createPageUrl("ClientTrespass"), icon: UserX },
  { title: "Site Schedule", url: createPageUrl("ClientSchedule"), icon: Calendar },
  { title: "Training Documents", url: createPageUrl("ClientDocuments"), icon: BookOpen },
  { title: "Feedback", url: createPageUrl("ClientFeedback"), icon: Award },
  { title: "Location Info", url: createPageUrl("ClientLocation"), icon: MapPin },
];

// Admin nav items without AI Schedule Generator for client-role users — filtered at render time

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activePortal, setActivePortal] = useState(() => {
    return localStorage.getItem('activePortal') || null;
  });
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    officer: true,
    supervisor: false,
    admin: false,
    hr: false,
    client: true,
    // Officer category sections
    officer_main: true,
    officer_schedule: true,
    officer_reports: true,
    officer_communication: true,
    officer_resources: true,
    // Admin category sections
    admin_dashboard: true,
    admin_team: true,
    admin_reports: true,
    admin_scheduling: true,
    admin_communication: true,
  });

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.additional_roles?.includes('supervisor');
  const isHR = user?.additional_roles?.includes('hr');
  const isClient = user?.additional_roles?.includes('client');
  const isOfficerOnly = user?.additional_roles?.includes('officer');
  const isAccounting = user?.additional_roles?.includes('accounting');
  const hasFullAccess = user?.additional_roles?.includes('full_access');
  const isSupportStaff = user?.additional_roles?.includes('support_staff');
  const isTrainer = user?.additional_roles?.includes('trainer');
  const isStudent = user?.additional_roles?.includes('student');
  const isStudentNonAdmin = isStudent && !isAdmin;
  const isStudentOnly = isStudent && !isAdmin && !isSupervisor && !isHR && !isAccounting && !isClient && !isOfficerOnly && !hasFullAccess && !isTrainer;

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      try {
        const entries = await base44.entities.TimeEntry.filter(
          { officer_email: user.email },
          '-created_date',
          10
        );
        return entries.find(e => !e.clock_out) || null;
      } catch (e) {
        console.error('Error fetching active entry:', e);
        return null;
      }
    },
    enabled: !!user?.email && !isClient,
    refetchInterval: 5000,
  });

  // Portal selection logic for ADMIN users
  useEffect(() => {
    if (!user || userLoading) return;

    // Client users (including those with 'client' additional role) go directly to client dashboard
    if (isClient) {
      // Only redirect if not already on a client page
      if (!location.pathname.startsWith('/Client')) {
        navigate(createPageUrl("ClientDashboard"));
      }
      return;
    }

    // Admin users need to choose a portal (only non-client admins)
    if (isAdmin && !activePortal) {
      setShowPortalModal(true);
    }
  }, [user, userLoading, isAdmin, isClient, activePortal, location.pathname, navigate]);

  const handlePortalChoice = (portal) => {
    setActivePortal(portal);
    localStorage.setItem('activePortal', portal);
    setShowPortalModal(false);
    
    if (portal === 'officer') {
      navigate(createPageUrl("Dashboard"));
    } else if (portal === 'admin') {
      navigate(createPageUrl("AdminDashboard"));
    }
  };

  const handleSwitchPortal = () => {
    setShowPortalModal(true);
  };

  const hrNavigationItems = useMemo(() => {
    const items = [
      { title: "PTO Approval", url: createPageUrl("AdminPTOApproval"), icon: CalendarClock },
      { title: "Manual PTO Entry", url: createPageUrl("AdminManualPTO"), icon: CalendarClock },
      { title: "Manage Time Entries", url: createPageUrl("ManageTimeEntries"), icon: Clock },
      { title: "Manage Divisions", url: createPageUrl("AdminDivisions"), icon: Layers },
      { title: "Manage Locations", url: createPageUrl("AdminLocations"), icon: MapPin },
      { title: "Pending Users", url: createPageUrl("AdminUsers"), icon: Users },
      { title: "Manage Company Employees", url: createPageUrl("ManageCompanyEmployees"), icon: Briefcase },
      { title: "Manage Equipment", url: createPageUrl("AdminEquipment"), icon: Briefcase },
      { title: "Manage Clients", url: createPageUrl("ManageClients"), icon: Briefcase },
      { title: "Portal Visibility", url: createPageUrl("AdminPortalSettings"), icon: Settings },
    ];

    // Only show Support Staff Clock if user has support_staff role
    if (isSupportStaff) {
      items.splice(2, 0, { title: "Support Staff Clock", url: createPageUrl("AdminSupportStaffClock"), icon: Clock });
    }

    return items;
  }, [isSupportStaff]);

  // Office staff are identified by their additional roles, not rank
  const isOfficeStaff = isAdmin && (isHR || isAccounting || user?.additional_roles?.includes('support_staff'));

  // Initialize accounting section states
  const accountingSections = ['accounting_payroll', 'accounting_billing', 'accounting_reports', 'accounting_approvals'];
  accountingSections.forEach(section => {
    if (expandedSections[section] === undefined) {
      expandedSections[section] = true;
    }
  });

  const isAdminWithClientRole = isAdmin && isClient;

  const hiddenPortals = user?.hidden_portals || [];

  // If user has 'officer' additional role, they ONLY see officer tools unless they have other additional roles
  const hasOtherRoles = isSupervisor || isHR || isClient || isAccounting;
  
  // Full access role ONLY grants officer tools access, doesn't bypass other role requirements
  // Office staff (OM, HR, Support) only see admin portal and HR portal if they have HR role
  
  // Portal visibility based on activePortal selection
  // ONLY admin users need to choose a portal. Non-admin users see their normal portals.
  const inOfficerMode = activePortal === 'officer';
  const inAdminMode = activePortal === 'admin';
  
  // For ADMIN users: portal switcher controls what they see
  // For NON-ADMIN users: they see their normal portals based on roles
  const showAdminPortal = isAdmin && !isClient && !isOfficerOnly && !hiddenPortals.includes('admin') && (isAdmin ? inAdminMode : true);
  const showHRPortal = isHR && !isClient && !isOfficerOnly && !hiddenPortals.includes('hr') && !isStudentNonAdmin && (isAdmin ? inAdminMode : true);
  const showAccountingPortal = isAccounting && !isClient && !isOfficerOnly && !hiddenPortals.includes('accounting') && !isStudentNonAdmin && (isAdmin ? inAdminMode : true);
  const showSupervisorPortal = isSupervisor && !isClient && (!isOfficerOnly || hasOtherRoles) && !hiddenPortals.includes('supervisor') && !isStudentNonAdmin && (isAdmin ? inOfficerMode : true);

  // Show client portal if user has client role
  const showClientPortal = isClient && (!isOfficerOnly || hasOtherRoles);

  // A user with NO additional_roles, not admin, not client, not student = unsetup/pending
  const isUnsetupUser = !isAdmin && !isClient && !isStudent && (!user?.additional_roles || user.additional_roles.length === 0);

  // Officer portal access:
  // - Must have explicit 'officer' role OR admin OR full_access
  // - Pending/unsetup users do NOT see officer portal — they get the "not set up" screen
  // - Office staff without full_access → do NOT see it
  const showOfficerTools = (isOfficerOnly || isAdmin || hasFullAccess) &&
    (!isOfficeStaff || isOfficerOnly || hasFullAccess) &&
    (isAdmin ? inOfficerMode : true) &&
    !isStudentNonAdmin && !isClient && !isUnsetupUser;
  // Training portal in admin mode only
  const showTrainingPortal = isAdmin && inAdminMode && !isClient && !isStudentNonAdmin && !hiddenPortals.includes('training');
  // Trainer-only (non-admin) gets training portal alongside their officer view
  const showTrainerInOfficerView = isTrainer && !isAdmin && !isClient && !isStudentNonAdmin && !hiddenPortals.includes('training');
  const showStudentPortal = isStudent && !isAdmin && !hiddenPortals.includes('student');



  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);
  const primaryClientLocation = clientLocations[0];

  const { data: clientLocation } = useQuery({
    queryKey: ['clientLocation', primaryClientLocation],
    queryFn: async () => {
      if (!isClient || !primaryClientLocation) return null;
      try {
        const locations = await base44.entities.Location.list();
        return locations.find(loc => loc.site_name === primaryClientLocation);
      } catch (e) {
        console.error('Error fetching client location:', e);
        return null;
      }
    },
    enabled: isClient && !!primaryClientLocation,
    staleTime: 60000,
  });

  const clientLocationExpired = React.useMemo(() => {
    if (!isClient || !clientLocation?.contract_end_date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endDate = new Date(clientLocation.contract_end_date);
    endDate.setHours(12, 0, 0, 0);
    return now.getTime() >= endDate.getTime();
  }, [isClient, clientLocation]);

  const hasActiveAccess = useCallback(() => {
    if (!user) return false;
    
    // Check if officer is terminated and past termination date
    if (user.employment_status === 'terminated' && user.termination_date) {
      const terminationDate = new Date(user.termination_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      terminationDate.setHours(0, 0, 0, 0);
      
      if (terminationDate <= today) {
        return false; // Terminated - restricted access
      }
    }
    
    return true;
  }, [user]);

  const getFilteredOfficerNavigation = useCallback(() => {
    if (isClient || isAdminWithClientRole || isStudentNonAdmin) {
      return [];
    }

    // Unsetup users (no roles) do NOT get officer nav
    if (!isOfficerOnly && !isAdmin && !hasFullAccess) {
      return [];
    }

    // Office staff (OM, HR, Support Staff) don't need officer tools UNLESS they have full access
    if (isOfficeStaff && !hasFullAccess) {
      return [];
    }

    // Check if officer portal is hidden
    if (hiddenPortals.includes('officer')) {
      return [];
    }

    const allItems = getAllOfficerNavigationItems(user);

    if (isAdmin || isHR || isSupervisor) {
      return allItems;
    }

    // Check if terminated and past termination date
    if (user?.employment_status === 'terminated' && user?.termination_date) {
      const terminationDate = new Date(user.termination_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      terminationDate.setHours(0, 0, 0, 0);
      
      if (terminationDate <= today) {
        // Terminated officer - only show payroll page
        return [
          { id: "officer_payroll", title: "My Payroll", url: createPageUrl("OfficerPayroll"), icon: DollarSign, category: "main" }
        ];
      }
    }

    if (!hasActiveAccess()) {
      return [
        allItems.find(item => item.id === "dashboard"),
        allItems.find(item => item.id === "profile"),
      ].filter(Boolean);
    }

    return allItems;
  }, [isClient, isAdmin, isHR, isSupervisor, isOfficeStaff, hasActiveAccess, user, hiddenPortals, hasFullAccess, isAdminWithClientRole, isOfficerOnly, isStudentNonAdmin]);

  const filteredOfficerNav = getFilteredOfficerNavigation();
  const effectiveFilteredOfficerNav = isAdmin && inAdminMode ? [] : filteredOfficerNav;

  // Remove the useEffect that was auto-collapsing sections - let user control them manually

  // If user is admin with client role, redirect to client dashboard
  useEffect(() => {
    if (isAdminWithClientRole && !location.pathname.startsWith('/Client')) {
      navigate(createPageUrl("ClientDashboard"));
    }
  }, [isAdminWithClientRole, location.pathname, navigate]);

  // If student (non-admin), redirect to Student Portal
  useEffect(() => {
    if (isStudentNonAdmin && !userLoading && user && location.pathname !== createPageUrl("StudentPortal")) {
      navigate(createPageUrl("StudentPortal"));
    }
  }, [isStudentNonAdmin, userLoading, user, location.pathname, navigate]);

  const handleLogout = async (e) => {
    // Prevent logout if officer is clocked in
    if (activeEntry && !isAdmin && !isHR && !isSupervisor && !isClient) {
      e?.preventDefault();
      alert('⚠️ Cannot logout while clocked in!\n\nPlease clock out first before logging out of the system. This ensures accurate time tracking and shift accountability.');
      return false;
    }

    await base44.auth.logout();
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getDisplayName = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user?.full_name) {
      return user.full_name;
    }
    return isClient ? 'Client' : 'Officer';
  };

  const getInitial = () => {
    if (user?.first_name) {
      return user.first_name.charAt(0);
    }
    if (user?.full_name) {
      return user.full_name.charAt(0);
    }
    return 'U';
  };

  const getRoleBadge = () => {
    const badges = [];
    if (isAdmin) badges.push(<Shield key="admin" className="w-3 h-3 text-amber-600" title="Admin" />);
    if (isSupervisor) badges.push(<UserCheck key="supervisor" className="w-3 h-3 text-green-600" title="Supervisor" />);
    if (isHR) badges.push(<Users key="hr" className="w-3 h-3 text-pink-600" title="Human Resources" />);
    if (isAccounting) badges.push(<DollarSign key="accounting" className="w-3 h-3 text-teal-600" title="Accounting" />);
    if (isClient) badges.push(<Briefcase key="client" className="w-3 h-3 text-purple-600" title="Client" />);
    return badges.length > 0 ? <div className="flex gap-1">{badges}</div> : null;
  };

  const getInitialBgColor = () => {
    if (isAdmin) return 'bg-gradient-to-br from-amber-400 to-amber-600';
    if (isSupervisor) return 'bg-gradient-to-br from-green-400 to-green-600';
    if (isHR) return 'bg-gradient-to-br from-pink-400 to-pink-600';
    if (isAccounting) return 'bg-gradient-to-br from-teal-400 to-teal-600';
    if (isClient) return 'bg-gradient-to-br from-purple-400 to-purple-600';
    return 'bg-gradient-to-br from-slate-300 to-slate-400';
  }

  const getInitialTextColor = () => {
    if (isAdmin || isHR || isSupervisor || isAccounting || isClient) return 'text-white';
    return 'text-slate-700';
  }

  // Unsetup user — show "account not set up" screen
  if (!userLoading && user && isUnsetupUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-md w-full text-center">
          <img
            src={LOGO_URL}
            alt="Black Point Protection"
            className="w-32 h-auto object-contain mx-auto mb-8"
          />
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Account Not Set Up</h2>
            <p className="text-slate-600 mb-6">
              Your account has not been configured yet. Please contact Black Point Security to get access.
            </p>
            <a
              href="tel:8558277911"
              className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white font-semibold px-6 py-3 rounded-xl text-lg hover:bg-slate-800 transition-colors"
            >
              📞 855-827-7911
            </a>
            <p className="text-xs text-slate-400 mt-4">
              Tap to call Black Point Security
            </p>
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="mt-6 text-sm text-slate-400 hover:text-slate-600 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (isClient && clientLocationExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <Card className="max-w-md w-full border-none shadow-xl">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Contract Expired</h2>
            <p className="text-slate-600 mb-4">
              Your client portal access has been deactivated because the contract for {user.assigned_location} has ended.
            </p>
            <p className="text-sm text-slate-500">
              Please contact Virtus Security to renew your contract and restore access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      {/* Portal Selection Modal */}
      <Dialog open={showPortalModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">Which portal would you like to access?</DialogTitle>
            <DialogDescription className="text-center">
              Choose between Officer Portal or Admin Portal
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-6">
            <Button
              size="lg"
              className="h-20 text-lg bg-blue-600 hover:bg-blue-700"
              onClick={() => handlePortalChoice('officer')}
            >
              <Shield className="w-6 h-6 mr-3" />
              Officer Portal
            </Button>
            <Button
              size="lg"
              className="h-20 text-lg bg-amber-600 hover:bg-amber-700"
              onClick={() => handlePortalChoice('admin')}
            >
              <Settings className="w-6 h-6 mr-3" />
              Admin Portal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen flex w-full bg-slate-950 overflow-hidden">
        <Sidebar className="border-r border-white/10 bg-slate-950/80 backdrop-blur-xl h-screen overflow-y-auto shadow-2xl shadow-black/50">
          <SidebarHeader className="border-b border-white/10 p-4 bg-slate-950/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={LOGO_URL}
                  alt="Black Point Protection"
                  className="w-16 h-auto object-contain"
                />
                <div>
                  <h2 className="font-bold text-lg text-white">
                    BPS Connect
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    {isClient ? 'Client Portal' : activePortal === 'officer' ? 'Officer Mode' : activePortal === 'admin' ? 'Admin Mode' : 'Security Portal'}
                  </p>
                </div>
                </div>
                </div>
          </SidebarHeader>

          <SidebarContent className="p-2 pb-20">
            {/* Portal Switcher for Admin Users — hidden for client-role users */}
            {isAdmin && activePortal && !isClient && (
              <div className="px-3 py-2 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleSwitchPortal}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Switch Portal
                </Button>
              </div>
            )}

            {isClient && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-purple-600 px-3 py-2">
                  Client Portal
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {clientNavigationItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`transition-all duration-200 rounded-lg mb-1 hover:bg-purple-50 text-purple-900 ${
                            location.pathname === item.url ? 'bg-purple-100 text-purple-900 shadow-sm font-semibold' : 'font-medium'
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {effectiveFilteredOfficerNav.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-3 py-2">
                  Officer Tools
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {['main', 'schedule', 'reports', 'communication', 'resources'].map(cat => {
                      const catItems = effectiveFilteredOfficerNav.filter(item => item.category === cat);
                      if (catItems.length === 0) return null;
                      const sectionKey = `officer_${cat}`;
                      const isExpanded = expandedSections[sectionKey] !== false;
                      return (
                        <React.Fragment key={cat}>
                          <div 
                            className="px-3 py-2 text-xs font-medium text-slate-400 uppercase cursor-pointer hover:bg-slate-50 rounded flex items-center justify-between"
                            onClick={() => setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                          >
                            <span>{cat === 'main' ? 'Dashboard' : cat}</span>
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </div>
                          {isExpanded && catItems.map((item) => (
                            <SidebarMenuItem key={item.id}>
                              <SidebarMenuButton
                                asChild
                                className={`transition-all duration-200 rounded-lg mb-1 hover:bg-blue-50 dark:hover:bg-green-900/30 text-blue-900 dark:text-green-500 ${
                                  location.pathname === item.url ? 'bg-blue-100 dark:bg-green-900/30 text-blue-900 dark:text-green-400 shadow-sm' : ''
                                }`}
                              >
                                <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                                  <item.icon className="w-4 h-4" />
                                  <span className="font-medium text-sm">{item.title}</span>
                                </Link>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {showSupervisorPortal && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider text-green-600 px-3 py-2 flex items-center justify-between cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection('supervisor'); }}
                  >
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3 h-3" />
                      Supervisor Portal
                    </div>
                    {expandedSections.supervisor ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  {expandedSections.supervisor && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {supervisorNavigationItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              asChild
                              className={`transition-all duration-200 rounded-lg mb-1 hover:bg-green-50 text-green-900 ${
                                location.pathname === item.url ? 'bg-green-50 text-green-900 shadow-sm' : ''
                              }`}
                            >
                              <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                                <item.icon className="w-5 h-5" />
                                <span className="font-medium">{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              </>
            )}

            {showAdminPortal && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider text-amber-600 px-3 py-2 flex items-center justify-between cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection('admin'); }}
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      Admin Portal
                    </div>
                    {expandedSections.admin ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  {expandedSections.admin && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {['dashboard', 'team', 'reports', 'scheduling', 'communication'].map(cat => {
                                          const catItems = adminNavigationItems.filter(item => item.category === cat);
                                          if (catItems.length === 0) return null;
                                          const sectionKey = `admin_${cat}`;
                                          const isExpanded = expandedSections[sectionKey] !== false;
                                          return (
                                            <React.Fragment key={cat}>
                                              <div 
                                                className="px-3 py-2 text-xs font-medium text-amber-400 uppercase cursor-pointer hover:bg-amber-50 rounded flex items-center justify-between"
                                                onClick={() => setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                                              >
                                                <span>{cat === 'dashboard' ? 'Overview' : cat}</span>
                                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                              </div>
                                              {isExpanded && catItems.map((item) => (
                                                <SidebarMenuItem key={item.title}>
                                                  <SidebarMenuButton
                                                    asChild
                                                    className={`transition-all duration-200 rounded-lg mb-1 hover:bg-amber-50 text-amber-900 ${
                                                      location.pathname === item.url ? 'bg-amber-50 text-amber-900 shadow-sm' : ''
                                                    }`}
                                                  >
                                                    <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                                                      <item.icon className="w-4 h-4" />
                                                      <span className="font-medium text-sm">{item.title}</span>
                                                    </Link>
                                                  </SidebarMenuButton>
                                                </SidebarMenuItem>
                                              ))}
                                            </React.Fragment>
                                          );
                                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>

                {showClientPortal && (
                  <>
                    <Separator className="my-2" />
                    <SidebarGroup>
                      <div
                        className="text-xs font-semibold uppercase tracking-wider text-purple-600 px-3 py-2 flex items-center justify-between cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection('client'); }}
                      >
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-3 h-3" />
                          Client Portal View
                        </div>
                        {expandedSections.client ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                      {expandedSections.client && (
                        <SidebarGroupContent>
                          <SidebarMenu>
                            {clientNavigationItems.map((item) => (
                              <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                  asChild
                                  className={`transition-all duration-200 rounded-lg mb-1 hover:bg-purple-50 text-purple-900 ${
                                    location.pathname === item.url ? 'bg-purple-100 text-purple-900 shadow-sm font-semibold' : 'font-medium'
                                  }`}
                                >
                                  <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                                    <item.icon className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm">{item.title}</span>
                                  </Link>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            ))}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      )}
                    </SidebarGroup>
                  </>
                )}
              </>
            )}

            {showHRPortal && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider text-pink-600 px-3 py-2 flex items-center justify-between cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection('hr'); }}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      Human Resources
                    </div>
                    {expandedSections.hr ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  {expandedSections.hr && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {hrNavigationItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              asChild
                              className={`transition-all duration-200 rounded-lg mb-1 hover:bg-pink-50 text-pink-900 ${
                                location.pathname === item.url ? 'bg-pink-50 text-pink-900 shadow-sm' : ''
                              }`}
                            >
                              <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                                <item.icon className="w-4 h-4" />
                                <span className="font-medium text-sm">{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              </>
            )}

            {showAccountingPortal && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider text-teal-600 px-3 py-2 flex items-center justify-between cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection('accounting'); }}
                  >
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3 h-3" />
                      Accounting
                    </div>
                    {expandedSections.accounting ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  {expandedSections.accounting && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {['payroll', 'billing', 'reports', 'approvals'].map(cat => {
                          const catItems = accountingNavigationItems.filter(item => item.category === cat);
                          if (catItems.length === 0) return null;
                          const sectionKey = `accounting_${cat}`;
                          const isExpanded = expandedSections[sectionKey] !== false;
                          const categoryNames = {
                            payroll: 'Payroll & Tax',
                            billing: 'Billing & Invoices',
                            reports: 'Financial Reports',
                            approvals: 'Approvals'
                          };
                          return (
                            <React.Fragment key={cat}>
                              <div 
                                className="px-3 py-2 text-xs font-medium text-teal-400 uppercase cursor-pointer hover:bg-teal-50 rounded flex items-center justify-between"
                                onClick={() => setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                              >
                                <span>{categoryNames[cat]}</span>
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </div>
                              {isExpanded && catItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                  <SidebarMenuButton
                                    asChild
                                    className={`transition-all duration-200 rounded-lg mb-1 hover:bg-teal-50 text-teal-900 ${
                                      location.pathname === item.url ? 'bg-teal-50 text-teal-900 shadow-sm' : ''
                                    }`}
                                  >
                                    <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                                      <item.icon className="w-4 h-4" />
                                      <span className="font-medium text-sm">{item.title}</span>
                                    </Link>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              </>
            )}
            {showTrainingPortal && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider text-indigo-600 px-3 py-2 flex items-center justify-between cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection('training'); }}
                  >
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-3 h-3" />
                      Training Portal
                    </div>
                    {expandedSections.training !== false ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  {expandedSections.training !== false && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {trainingPortalNavigationItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              asChild
                              className={`transition-all duration-200 rounded-lg mb-1 hover:bg-indigo-50 text-indigo-900 ${
                                location.pathname === item.url ? 'bg-indigo-50 text-indigo-900 shadow-sm' : ''
                              }`}
                            >
                              <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                                <item.icon className="w-4 h-4" />
                                <span className="font-medium text-sm">{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              </>
            )}
            {showTrainerInOfficerView && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-indigo-600 px-3 py-2">
                    Training Portal
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {trainingPortalNavigationItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            className={`transition-all duration-200 rounded-lg mb-1 hover:bg-indigo-50 text-indigo-900 ${
                              location.pathname === item.url ? 'bg-indigo-50 text-indigo-900 shadow-sm' : ''
                            }`}
                          >
                            <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                              <item.icon className="w-4 h-4" />
                              <span className="font-medium text-sm">{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {showStudentPortal && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-violet-600 px-3 py-2">
                    Student Portal
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          className={`transition-all duration-200 rounded-lg mb-1 hover:bg-violet-50 text-violet-900 font-medium ${
                            location.pathname === createPageUrl("StudentPortal") ? 'bg-violet-100 text-violet-900 shadow-sm font-semibold' : ''
                          }`}
                        >
                          <Link to={createPageUrl("StudentPortal")} className="flex items-center gap-3 px-3 py-2.5">
                            <GraduationCap className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">My Training</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="border-t border-white/10 p-4 bg-slate-950/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user?.profile_photo_url ? (
                  <img
                    src={user.profile_photo_url}
                    alt={`${user.first_name || 'User'} Profile`}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${getInitialBgColor()} shadow-md`}>
                    <span className={`font-semibold text-sm ${getInitialTextColor()}`}>
                      {getInitial()}
                    </span>
                  </div>
                )}
                <Link to={isClient ? createPageUrl("ClientDashboard") : createPageUrl("OfficerProfile")} className="flex-1 min-w-0 group">
                  <p className="font-medium text-sm text-white group-hover:text-blue-400 truncate flex items-center gap-1 transition-colors">
                    {getDisplayName()}
                    {getRoleBadge()}
                  </p>
                  <p className="text-xs text-slate-400 group-hover:text-blue-400 truncate transition-colors">
                    {user?.email}
                  </p>
                  {activeEntry && !isAdmin && !isHR && !isSupervisor && !isClient && (
                    <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      On Duty
                    </p>
                  )}
                </Link>
              </div>
              <button
                onClick={handleLogout}
                className={`p-2 rounded-lg transition-all duration-200 hover:bg-slate-100 ${
                  activeEntry && !isAdmin && !isHR && !isSupervisor && !isClient
                    ? 'bg-red-50 text-red-300 cursor-not-allowed opacity-50'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                }`}
                title={activeEntry && !isAdmin && !isHR && !isSupervisor && !isClient ? "Cannot logout while clocked in - Clock out first" : "Logout"}
                disabled={activeEntry && !isAdmin && !isHR && !isSupervisor && !isClient}
                style={activeEntry && !isAdmin && !isHR && !isSupervisor && !isClient ? { pointerEvents: 'none' } : {}}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-h-screen md:h-screen md:overflow-hidden relative">
          {/* Cinematic animated gradient mesh background — sits behind all page content */}
          <div className="cinematic-bg">
            <div className="cinematic-glow-3" />
          </div>
          <div className="cinematic-grid" />

          {user && !isClient && <TopNotificationBanner user={user} />}

          <header
            className="bg-slate-950/50 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex-shrink-0 relative z-10"
            style={{ paddingTop: `calc(env(safe-area-inset-top) + 0.75rem)` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden md:flex" />
                {/* Mobile header: show back button on sub-pages, logo+title on root tabs */}
                {(() => {
                  const rootTabPaths = [
                    createPageUrl("Dashboard"),
                    createPageUrl("Schedule"),
                    createPageUrl("ShiftReports"),
                    createPageUrl("TeamChat"),
                    createPageUrl("OfficerProfile"),
                  ];
                  const isRootTab = rootTabPaths.includes(location.pathname);
                  return isRootTab ? (
                    <>
                      <img src={LOGO_URL} alt="Black Point Protection" className="w-10 h-auto object-contain md:hidden" />
                      <h1 className="text-lg font-bold text-slate-900 dark:text-white md:hidden">BPS Connect</h1>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate(-1)}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors md:hidden flex items-center gap-1 text-blue-600 dark:text-blue-400 text-sm font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      Back
                    </button>
                  );
                })()}
              </div>
              {user && !isClient && (
                <div className="flex items-center gap-2">
                  <NotificationCenter user={user} />
                </div>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-none pb-[calc(env(safe-area-inset-bottom)+100px)] md:pb-6 md:h-screen relative z-10" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
            {/* Root tab pages are kept mounted (display:none when inactive) to preserve scroll + state */}
            {(() => {
              const rootTabPaths = [
                createPageUrl("Dashboard"),
                createPageUrl("Schedule"),
                createPageUrl("ShiftReports"),
                createPageUrl("TeamChat"),
                createPageUrl("OfficerProfile"),
              ];
              const isRootTab = rootTabPaths.includes(location.pathname);
              return (
                <>
                  {/* Persistent tab shells — always mounted, hidden when not active */}
                  {rootTabPaths.map((tabPath) => (
                    <div
                      key={tabPath}
                      style={{ display: location.pathname === tabPath ? "block" : "none" }}
                      className="h-full"
                    >
                      {/* Children rendered here when this tab is active */}
                      {location.pathname === tabPath && children}
                    </div>
                  ))}
                  {/* Non-tab pages get the normal animated transition */}
                  {!isRootTab && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, x: 30, filter: "blur(8px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, x: -30, filter: "blur(8px)" }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full"
                      >
                        {children}
                      </motion.div>
                    </AnimatePresence>
                  )}
                </>
              );
            })()}
          </div>

          {/* Bottom tab bar — only for officer/non-client mobile users */}
          {user && !isClient && (isAdmin ? inOfficerMode : true) && (
            <BottomTabBar />
          )}
        </main>
      </div>

      {user && !isClient && !isAdminWithClientRole && (
        <>
          <CertificationMonitor user={user} />
          <BackgroundLocationTracker user={user} />
          {user.role === 'admin' && <AdminAlertMonitor user={user} />}
        </>
      )}
      <PWAManager />
      <Toaster 
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'hsl(222 40% 8%)',
            color: 'hsl(210 40% 98%)',
            border: '1px solid hsl(217 33% 18%)',
          },
        }}
      />
    </SidebarProvider>
  );
}

export default function Layout(props) {
  return <LayoutContent {...props} />;
}