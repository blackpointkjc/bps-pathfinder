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

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

const LayoutWrapper = ({ children, currentPageName }) => Layout
  ? <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

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
    isAuthenticated,
    navigateToLogin,
    checkAppState,
  } = useAuth();

  const needsLogin = !isLoadingPublicSettings && !isLoadingAuth
    && (authError?.type === 'auth_required' || (!authError && !isAuthenticated));

  useEffect(() => {
    if (needsLogin) navigateToLogin();
  }, [needsLogin, navigateToLogin]);

  if (isLoadingPublicSettings || isLoadingAuth) return <LoadingScreen />;

  if (authError?.type === 'user_not_registered') return <UserNotRegisteredError />;

  if (needsLogin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-slate-300">
        <p className="text-sm font-semibold">Redirecting to secure sign-in…</p>
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
