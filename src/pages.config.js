/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "CommandDashboard",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import BOLOAlerts from './pages/BOLOAlerts';
import PathfinderReports from './pages/Reports';
import CallHistory from './pages/CallHistory';
import Navigation from './pages/Navigation';
import RecordsAssistant from './pages/RecordsAssistant';
import DispatchCenter from './pages/DispatchCenter';
import CommandDashboard from './pages/CommandDashboard';
import FieldUnitView from './pages/FieldUnitView';
import Personnel from './pages/Personnel';
import AdminPortal from './pages/AdminPortal';
import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "CommandDashboard",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "CommandDashboard",
 *   New: mainPage: "CommandDashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccountingInvoices from './pages/AccountingInvoices';
import AccountingPayroll from './pages/AccountingPayroll';
import AccountingProfit from './pages/AccountingProfit';
import AccountingTaxLiability from './pages/AccountingTaxLiability';
import AccountingW2Generator from './pages/AccountingW2Generator';
import ActiveTracker from './pages/ActiveTracker';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminCertificationAlerts from './pages/AdminCertificationAlerts';
import AdminClientFeedback from './pages/AdminClientFeedback';
import AdminClientReports from './pages/AdminClientReports';
import AdminCommendations from './pages/AdminCommendations';
import AdminComplaints from './pages/AdminComplaints';
import AdminConfidentialReports from './pages/AdminConfidentialReports';
import AdminDashboard from './pages/AdminDashboard';
import AdminDivisions from './pages/AdminDivisions';
import AdminDocuments from './pages/AdminDocuments';
import AdminEquipment from './pages/AdminEquipment';
import AdminExpenseApproval from './pages/AdminExpenseApproval';
import AdminGeofenceAlerts from './pages/AdminGeofenceAlerts';
import AdminLocationTracker from './pages/AdminLocationTracker';
import AdminLocations from './pages/AdminLocations';
import AdminManualPTO from './pages/AdminManualPTO';
import AdminMessages from './pages/AdminMessages';
import AdminNotifications from './pages/AdminNotifications';
import AdminOfficerManagement from './pages/AdminOfficerManagement';
import AdminOfficerRoster from './pages/AdminOfficerRoster';
import AdminPTOApproval from './pages/AdminPTOApproval';
import AdminPTOLossReport from './pages/AdminPTOLossReport';
import AdminPTOReview from './pages/AdminPTOReview';
import AdminPayroll from './pages/AdminPayroll';
import AdminPayrollConfig from './pages/AdminPayrollConfig';
import AdminPerformanceReviews from './pages/AdminPerformanceReviews';
import AdminPlannedShifts from './pages/AdminPlannedShifts';
import AdminPortalSettings from './pages/AdminPortalSettings';
import AdminPostOrders from './pages/AdminPostOrders';
import AdminReports from './pages/AdminReports';
import AdminScheduling from './pages/AdminScheduling';
import AdminShiftBids from './pages/AdminShiftBids';
import AdminSpecialRequests from './pages/AdminSpecialRequests';
import AdminSupervisorReports from './pages/AdminSupervisorReports';
import AdminSupportStaffClock from './pages/AdminSupportStaffClock';
import AdminTraining from './pages/AdminTraining';
import AdminTrainingCompliance from './pages/AdminTrainingCompliance';
import TrainingComplianceTracker from './pages/TrainingComplianceTracker';
import AdminUsers from './pages/AdminUsers';
import Announcements from './pages/Announcements';
import CallsForService from './pages/CallsForService';
import ClientAlerts from './pages/ClientAlerts';
import ClientDashboard from './pages/ClientDashboard';
import ClientDocuments from './pages/ClientDocuments';
import ClientFeedback from './pages/ClientFeedback';
import ClientLocation from './pages/ClientLocation';
import ClientPayrollReport from './pages/ClientPayrollReport';
import ClientReports from './pages/ClientReports';
import ClientSchedule from './pages/ClientSchedule';
import ClientSpecialRequests from './pages/ClientSpecialRequests';
import ClientSupervisors from './pages/ClientSupervisors';
import ClientTrespass from './pages/ClientTrespass';
import ConfidentialReport from './pages/ConfidentialReport';
import CriminalComplaints from './pages/CriminalComplaints';
import DailyActivityReports from './pages/DailyActivityReports';
import Dashboard from './pages/Dashboard';
import DivisionDirectory from './pages/DivisionDirectory';
import ExpenseReports from './pages/ExpenseReports';
import Home from './pages/Home';
import IncidentReports from './pages/IncidentReports';
import MDCriminalComplaints from './pages/MDCriminalComplaints';
import MDTrespassNotices from './pages/MDTrespassNotices';
import MaintenanceReports from './pages/MaintenanceReports';
import ManageClients from './pages/ManageClients';
import ManageTimeEntries from './pages/ManageTimeEntries';
import MyPerformanceAnalytics from './pages/MyPerformanceAnalytics';
import OfficerAnalytics from './pages/OfficerAnalytics';
import OfficerAvailability from './pages/OfficerAvailability';
import OfficerInbox from './pages/OfficerInbox';
import OfficerMobile from './pages/OfficerMobile';
import OfficerPayroll from './pages/OfficerPayroll';
import OfficerPerformance from './pages/OfficerPerformance';
import OfficerProfile from './pages/OfficerProfile';
import OfficerRoster from './pages/OfficerRoster';
import OfficerTraining from './pages/OfficerTraining';
import OpenDoorReports from './pages/OpenDoorReports';
import OpenShifts from './pages/OpenShifts';
import PayrollDates from './pages/PayrollDates';
import PostOrders from './pages/PostOrders';
import RankDuties from './pages/RankDuties';
import RankStructure from './pages/RankStructure';
import Schedule from './pages/Schedule';
import ShiftHandover from './pages/ShiftHandover';
import ShiftReports from './pages/ShiftReports';
import Summons from './pages/Summons';
import SupervisorCallOuts from './pages/SupervisorCallOuts';
import SupervisorChat from './pages/SupervisorChat';
import SupervisorComplaints from './pages/SupervisorComplaints';
import SupervisorDirectory from './pages/SupervisorDirectory';
import SupervisorInspections from './pages/SupervisorInspections';
import SupervisorPerformanceReview from './pages/SupervisorPerformanceReview';
import SupervisorTasks from './pages/SupervisorTasks';
import SupervisorUseOfForce from './pages/SupervisorUseOfForce';
import SupervisorWriteUps from './pages/SupervisorWriteUps';
import TeamChat from './pages/TeamChat';
import TimeClock from './pages/TimeClock';
import TimeRequests from './pages/TimeRequests';
import TrespassingNotices from './pages/TrespassingNotices';
import VAContactSheet from './pages/VAContactSheet';
import VACriminalComplaints from './pages/VACriminalComplaints';
import VATrespassNotices from './pages/VATrespassNotices';
import QRPatrolScan from './pages/QRPatrolScan.jsx';
import AdminQRCheckpoints from './pages/AdminQRCheckpoints';
import AdminQRPrintManager from './pages/AdminQRPrintManager';
import AdminQRReports from './pages/AdminQRReports';
import ClientQRReports from './pages/ClientQRReports';
import BOLOAlerts from './pages/BOLOAlerts';
import PathfinderReports from './pages/Reports';
import CallHistory from './pages/CallHistory';
import Navigation from './pages/Navigation';
import RecordsAssistant from './pages/RecordsAssistant';
import DispatchCenter from './pages/DispatchCenter';
import CommandDashboard from './pages/CommandDashboard';
import FieldUnitView from './pages/FieldUnitView';
import Personnel from './pages/Personnel';
import AdminPortal from './pages/AdminPortal';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountingInvoices": AccountingInvoices,
    "AccountingPayroll": AccountingPayroll,
    "AccountingProfit": AccountingProfit,
    "AccountingTaxLiability": AccountingTaxLiability,
    "AccountingW2Generator": AccountingW2Generator,
    "ActiveTracker": ActiveTracker,
    "AdminAnalytics": AdminAnalytics,
    "AdminAnnouncements": AdminAnnouncements,
    "AdminCertificationAlerts": AdminCertificationAlerts,
    "AdminClientFeedback": AdminClientFeedback,
    "AdminClientReports": AdminClientReports,
    "AdminCommendations": AdminCommendations,
    "AdminComplaints": AdminComplaints,
    "AdminConfidentialReports": AdminConfidentialReports,
    "AdminDashboard": AdminDashboard,
    "AdminDivisions": AdminDivisions,
    "AdminDocuments": AdminDocuments,
    "AdminEquipment": AdminEquipment,
    "AdminExpenseApproval": AdminExpenseApproval,
    "AdminGeofenceAlerts": AdminGeofenceAlerts,
    "AdminLocationTracker": AdminLocationTracker,
    "AdminLocations": AdminLocations,
    "AdminManualPTO": AdminManualPTO,
    "AdminMessages": AdminMessages,
    "AdminNotifications": AdminNotifications,
    "AdminOfficerManagement": AdminOfficerManagement,
    "AdminOfficerRoster": AdminOfficerRoster,
    "AdminPTOApproval": AdminPTOApproval,
    "AdminPTOLossReport": AdminPTOLossReport,
    "AdminPTOReview": AdminPTOReview,
    "AdminPayroll": AdminPayroll,
    "AdminPayrollConfig": AdminPayrollConfig,
    "AdminPerformanceReviews": AdminPerformanceReviews,
    "AdminPlannedShifts": AdminPlannedShifts,
    "AdminPortalSettings": AdminPortalSettings,
    "AdminPostOrders": AdminPostOrders,
    "AdminReports": AdminReports,
    "AdminScheduling": AdminScheduling,
    "AdminShiftBids": AdminShiftBids,
    "AdminSpecialRequests": AdminSpecialRequests,
    "AdminSupervisorReports": AdminSupervisorReports,
    "AdminSupportStaffClock": AdminSupportStaffClock,
    "AdminTraining": AdminTraining,
    "AdminTrainingCompliance": AdminTrainingCompliance,
    "TrainingComplianceTracker": TrainingComplianceTracker,
    "AdminUsers": AdminUsers,
    "Announcements": Announcements,
    "CallsForService": CallsForService,
    "ClientAlerts": ClientAlerts,
    "ClientDashboard": ClientDashboard,
    "ClientDocuments": ClientDocuments,
    "ClientFeedback": ClientFeedback,
    "ClientLocation": ClientLocation,
    "ClientPayrollReport": ClientPayrollReport,
    "ClientReports": ClientReports,
    "ClientSchedule": ClientSchedule,
    "ClientSpecialRequests": ClientSpecialRequests,
    "ClientSupervisors": ClientSupervisors,
    "ClientTrespass": ClientTrespass,
    "ConfidentialReport": ConfidentialReport,
    "CriminalComplaints": CriminalComplaints,
    "DailyActivityReports": DailyActivityReports,
    "Dashboard": Dashboard,
    "DivisionDirectory": DivisionDirectory,
    "ExpenseReports": ExpenseReports,
    "Home": Home,
    "IncidentReports": IncidentReports,
    "MDCriminalComplaints": MDCriminalComplaints,
    "MDTrespassNotices": MDTrespassNotices,
    "MaintenanceReports": MaintenanceReports,
    "ManageClients": ManageClients,
    "ManageTimeEntries": ManageTimeEntries,
    "MyPerformanceAnalytics": MyPerformanceAnalytics,
    "OfficerAnalytics": OfficerAnalytics,
    "OfficerAvailability": OfficerAvailability,
    "OfficerInbox": OfficerInbox,
    "OfficerMobile": OfficerMobile,
    "OfficerPayroll": OfficerPayroll,
    "OfficerPerformance": OfficerPerformance,
    "OfficerProfile": OfficerProfile,
    "OfficerRoster": OfficerRoster,
    "OfficerTraining": OfficerTraining,
    "OpenDoorReports": OpenDoorReports,
    "OpenShifts": OpenShifts,
    "PayrollDates": PayrollDates,
    "PostOrders": PostOrders,
    "RankDuties": RankDuties,
    "RankStructure": RankStructure,
    "Schedule": Schedule,
    "ShiftHandover": ShiftHandover,
    "ShiftReports": ShiftReports,
    "Summons": Summons,
    "SupervisorCallOuts": SupervisorCallOuts,
    "SupervisorChat": SupervisorChat,
    "SupervisorComplaints": SupervisorComplaints,
    "SupervisorDirectory": SupervisorDirectory,
    "SupervisorInspections": SupervisorInspections,
    "SupervisorPerformanceReview": SupervisorPerformanceReview,
    "SupervisorTasks": SupervisorTasks,
    "SupervisorUseOfForce": SupervisorUseOfForce,
    "SupervisorWriteUps": SupervisorWriteUps,
    "TeamChat": TeamChat,
    "TimeClock": TimeClock,
    "TimeRequests": TimeRequests,
    "TrespassingNotices": TrespassingNotices,
    "VAContactSheet": VAContactSheet,
    "VACriminalComplaints": VACriminalComplaints,
    "VATrespassNotices": VATrespassNotices,
    "QRPatrolScan": QRPatrolScan,
    "AdminQRCheckpoints": AdminQRCheckpoints,
    "AdminQRPrintManager": AdminQRPrintManager,
    "AdminQRReports": AdminQRReports,
    "ClientQRReports": ClientQRReports,
    "BOLOAlerts": BOLOAlerts,
    "PathfinderReports": PathfinderReports,
    "CallHistory": CallHistory,
    "Navigation": Navigation,
    "RecordsAssistant": RecordsAssistant,
    "DispatchCenter": DispatchCenter,
    "CommandDashboard": CommandDashboard,
    "FieldUnitView": FieldUnitView,
    "Personnel": Personnel,
    "AdminPortal": AdminPortal,
}

export const pagesConfig = {
    mainPage: "CommandDashboard",
    Pages: PAGES,
    Layout: __Layout,
};