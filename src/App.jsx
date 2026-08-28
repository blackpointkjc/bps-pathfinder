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
import { DashboardDataProvider } from '@/lib/DashboardDataContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PageErrorBoundary from '@/components/PageErrorBoundary';
import DispatcherShiftReports from './pages/DispatcherShiftReports';
import SupervisorFieldOversight from './pages/SupervisorFieldOversight';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

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
    navigateToLogin,
    navigateToMicrosoftLogin,
    checkAppState,
  } = useAuth();

  const needsLogin = !isLoadingPublicSettings && !isLoadingAuth
    && (authError?.type === 'auth_required' || (!authError && !isAuthenticated));

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
          <p className="mt-2 text-sm leading-6 text-slate-400">Use Microsoft sign-in when your Microsoft email matches your Pathfinder login email. If the emails differ, use the standard Pathfinder sign-in; your linked Outlook and Teams tools will remain connected inside the app.</p>
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
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="fixed inset-0 overflow-hidden"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
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
      </motion.div>
    </AnimatePresence>
  );
};

function App() {
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
        <DashboardDataProvider>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
        </DashboardDataProvider>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;