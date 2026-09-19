import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './App.css';
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import VisualEditAgent from '@/lib/VisualEditAgent';
import NavigationTracker from '@/lib/NavigationTracker';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PageErrorBoundary from '@/components/PageErrorBoundary';
import DispatcherShiftReports from './pages/DispatcherShiftReports';
import SupervisorFieldOversight from './pages/SupervisorFieldOversight';
import BackgroundLocationTracker from '@/components/BackgroundLocationTracker';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

const DATA_SYNC_TERMS = {
  User: ['user', 'directory', 'officer', 'personnel', 'client', 'supervisor', 'training', 'currentuser', 'portal', 'rank', 'pto'],
  Division: ['division', 'directory', 'location', 'schedule', 'client', 'user'],
  Location: ['location', 'directory', 'site', 'schedule', 'client', 'geofence', 'dispatch'],
  OfficerRoster: ['officer', 'roster', 'directory', 'personnel'],
  ActiveOfficer: ['activeofficer', 'location', 'officer', 'personnel', 'status'],
  TimeEntry: ['timeentry', 'timeentries', 'activetime', 'recenttime', 'payroll', 'performance', 'client', 'supervisor', 'hr', 'workqueue'],
  Schedule: ['schedule', 'shift', 'openshift', 'availability', 'performance', 'supervisor', 'workqueue'],
  ShiftBid: ['bid', 'shift', 'schedule', 'openshift'],
  OfficerAvailability: ['availability', 'schedule', 'shift'],
  TimeOffRequest: ['pto', 'timeoff', 'leave', 'hr', 'currentuser'],
  PTOAdjustment: ['pto', 'leave', 'hr', 'currentuser'],
  PayrollPeriod: ['payroll'],
  Announcement: ['announcement'],
  AnnouncementReceipt: ['announcement'],
  DailyActivityReport: ['dailyactivity', 'dar', 'report', 'performance'],
  IncidentReport: ['incident', 'report', 'performance', 'client', 'supervisor'],
  MaintenanceReport: ['maintenance', 'report', 'client'],
  OpenDoorReport: ['opendoor', 'report'],
  ConfidentialReport: ['confidential', 'report'],
  TrespassingNotice: ['trespass', 'report', 'legal'],
  CriminalComplaint: ['criminalcomplaint', 'complaint', 'legal'],
  Summons: ['summons', 'legal'],
  QRScanEvent: ['qr', 'patrol', 'performance'],
  QRCheckpoint: ['qr', 'checkpoint'],
  TrainingAssignment: ['training', 'performance'],
  TrainingCompletion: ['training', 'performance', 'supervisor'],
  TrainingSubmission: ['training'],
  PerformanceReview: ['performance', 'review'],
  ClientFeedback: ['feedback', 'client', 'performance'],
  Commendation: ['commendation', 'performance'],
  Complaint: ['complaint', 'performance', 'supervisor'],
  WriteUpReport: ['writeup', 'write-up', 'performance', 'supervisor'],
  InspectionReport: ['inspection', 'performance', 'supervisor'],
};

const FUNCTION_SYNC_TERMS = {
  updateUser: DATA_SYNC_TERMS.User,
  createPortalAccount: DATA_SYNC_TERMS.User,
  manageHRDivisions: DATA_SYNC_TERMS.Division,
  manageLocations: DATA_SYNC_TERMS.Location,
  manageClientAssignments: [...DATA_SYNC_TERMS.User, ...DATA_SYNC_TERMS.Location],
  manageHRTimeEntries: DATA_SYNC_TERMS.TimeEntry,
  getMyTimeEntries: DATA_SYNC_TERMS.TimeEntry,
  rollbackMyTimeEntry: DATA_SYNC_TERMS.TimeEntry,
  calculatePTOForOfficer: ['pto', 'leave', 'hr', 'currentuser', 'user'],
  getPTORequests: ['pto', 'timeoff', 'leave', 'hr', 'currentuser'],
  managePerformanceReviews: ['performance', 'review', 'user', 'officer'],
  manageOfficerPerformanceReviews: ['performance', 'review', 'user', 'officer'],
  completeSupervisorPerformanceReview: ['performance', 'review', 'supervisor', 'workqueue'],
  officerTrainingAction: ['training', 'performance', 'officer'],
  claimOpenShift: ['openshift', 'shift', 'schedule', 'bid'],
  maintainRollingPayrollPeriods: ['payroll'],
  updateOfficerStatus: ['activeofficer', 'officer', 'status', 'location', 'personnel'],
  forceOfficerStatus: ['activeofficer', 'officer', 'status', 'location', 'personnel'],
  forceUserSignOut: ['activeofficer', 'officer', 'status', 'location', 'personnel', 'user'],
  enforceOfficerDutyStatus: ['activeofficer', 'officer', 'status', 'location', 'timeentry'],
  manageOfficerCertifications: ['training', 'certification', 'officer', 'user'],
  syncCertToOfficer: ['training', 'certification', 'officer', 'user'],
};

function syncTermsForChange(detail = {}) {
  const kind = String(detail.kind || '');
  const name = String(detail.name || '');
  if (kind === 'entity') return DATA_SYNC_TERMS[name] || [name.toLowerCase()];
  if (kind === 'function') return FUNCTION_SYNC_TERMS[name] || [];
  return [];
}

const LayoutWrapper = ({ children, currentPageName }) => Layout
  ? <Layout currentPageName={currentPageName}><PageErrorBoundary pageName={currentPageName}>{children}</PageErrorBoundary></Layout>
  : <PageErrorBoundary pageName={currentPageName}>{children}</PageErrorBoundary>;

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-700 border-t-blue-400" />
        <p className="mt-4 text-xs font-bold tracking-[0.2em] text-slate-400">LOADING PATHFINDER</p>
      </div>
    </div>
  );
}

const AuthenticatedApp = () => {
  const location = useLocation();
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    accountLock,
    isAuthenticated,
    user,
    navigateToLogin,
    navigateToMicrosoftLogin,
    checkAppState,
  } = useAuth();

  useEffect(() => {
    // Screen changes consume the same persistent GPS owner. Ask that stream for
    // an immediate fresh observation so the newly opened map/status screen does
    // not wait for the next scheduled device refresh. This does not stop or
    // recreate the GPS watch.
    if (!isAuthenticated || !user?.email) return;
    window.dispatchEvent(new CustomEvent('bps-request-location', {
      detail: { reason: 'route_change', path: location.pathname, at: Date.now() },
    }));
  }, [location.pathname, isAuthenticated, user?.email]);

  const needsLogin = !isLoadingPublicSettings && !isLoadingAuth
    && (authError?.type === 'auth_required'
      || authError?.type === 'microsoft_session_expired'
      || (!authError && !isAuthenticated));

  if (isLoadingPublicSettings || isLoadingAuth) return <LoadingScreen />;

  if (authError?.type === 'user_not_registered') return <UserNotRegisteredError />;

  if (accountLock) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-lg rounded-2xl border border-red-700/70 bg-slate-900 p-7 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-500/60 bg-red-950/60 text-3xl">🔒</div>
          <h1 className="mt-5 text-2xl font-black tracking-wide">ACCOUNT ACCESS LOCKED</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Your Pathfinder account has been temporarily locked. You cannot access the application while this lock is active.
          </p>
          {accountLock.message && <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4 text-left"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">MESSAGE</div><p className="mt-2 text-sm text-slate-200">{accountLock.message}</p></div>}
          {accountLock.reason && <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-left"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">REASON</div><p className="mt-2 text-sm text-slate-300">{accountLock.reason}</p></div>}
          <div className="mt-6 rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm font-semibold text-amber-200">
            Please contact your supervisor for assistance with your account.
          </div>
        </div>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050a12] p-5 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0b1725] p-6 shadow-2xl sm:p-8">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">BPS Pathfinder</div>
          <h1 className="mt-2 text-2xl font-black">Secure Sign In</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Sign in with your authorized BlackPoint Microsoft work email. Pathfinder uses the linked identity to keep your existing account, role, reports, schedule, and history connected even when your original login email is different.</p>
          {authError?.type === 'microsoft_session_expired' && (
            <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-950/40 p-3 text-sm font-semibold leading-5 text-amber-100">
              Your Microsoft session has expired. Please sign in again with your BlackPoint email.
            </div>
          )}
          <button
            type="button"
            onClick={navigateToMicrosoftLogin}
            className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-500"
          >
            SIGN IN WITH MICROSOFT
          </button>
          <button
            type="button"
            onClick={navigateToLogin}
            className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 text-sm font-black text-slate-200 hover:border-slate-500 hover:bg-slate-800"
          >
            OTHER PATHFINDER SIGN IN
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">Pathfinder keeps your original user ID and login email authoritative so roles, reports, schedules, posts, messages, and history stay linked.</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
          <h1 className="text-xl font-bold">Pathfinder could not finish loading</h1>
          <p className="mt-2 text-sm text-slate-300">
            {authError.message || 'The connection to the application service was interrupted.'}
          </p>
          <button
            type="button"
            onClick={checkAppState}
            className="mt-5 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
      <div className="fixed inset-0 overflow-hidden">
        {/* One persistent GPS owner for the entire authenticated Pathfinder
            session. Route changes must never unmount/restart the shared browser
            or external GPS stream. Individual pages only consume this stream. */}
        {user && <BackgroundLocationTracker user={user} />}
        <Routes location={location}>
      <Route
        path="/"
        element={MainPage ? (
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        ) : <PageNotFound />}
      />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/DispatcherShiftReports" element={<LayoutWrapper currentPageName="DispatcherShiftReports"><DispatcherShiftReports /></LayoutWrapper>} />
      <Route path="/SupervisorFieldOversight" element={<LayoutWrapper currentPageName="SupervisorFieldOversight"><SupervisorFieldOversight /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
        </Routes>
      </div>
  );
};

function App() {
  useEffect(() => {
    const pendingTerms = new Set();
    let refreshTimer = null;

    const flush = () => {
      refreshTimer = null;
      if (!pendingTerms.size) return;
      const terms = [...pendingTerms];
      pendingTerms.clear();
      queryClientInstance.invalidateQueries({
        predicate: query => {
          const key = JSON.stringify(query.queryKey || []).toLowerCase();
          return terms.some(term => key.includes(String(term).toLowerCase()));
        },
      });
    };

    const queueChange = detail => {
      const terms = syncTermsForChange(detail);
      if (!terms.length) return;
      terms.forEach(term => pendingTerms.add(term));
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flush, 180);
    };

    const handleLocalChange = event => queueChange(event?.detail || {});
    window.addEventListener('bps-data-changed', handleLocalChange);

    let channel = null;
    try {
      channel = new BroadcastChannel('bps-pathfinder-data-sync');
      channel.addEventListener('message', event => queueChange(event?.data || {}));
    } catch {}

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('bps-data-changed', handleLocalChange);
      try { channel?.close(); } catch {}
    };
  }, []);

  useEffect(() => {
    const nativeAlert = window.alert;

    // Legacy pages still call alert(). Route every one of those messages through
    // the in-app notification system so the browser never opens its dated modal.
    window.alert = (message) => {
      const text = String(message ?? '').trim();
      if (!text) return;
      const isError = /(^|\s)(❌|error|failed|unable|invalid|warning|⚠️)/i.test(text);
      const isSuccess = /(^|\s)(✅|success|successfully|published|saved|created|submitted|approved|updated|sent|complete)/i.test(text);
      const cleanText = text.replace(/^[✅❌⚠️\s]+/, '').replace(/\n{3,}/g, '\n\n');
      toast({
        title: isError ? 'Action Needed' : isSuccess ? 'Success' : 'Pathfinder',
        description: cleanText,
        variant: isError ? 'destructive' : 'default',
      });
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;