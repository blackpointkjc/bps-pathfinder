import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ClientDashboard from './pages/ClientDashboard';
import ClientAlerts from './pages/ClientAlerts';
import ClientSpecialRequests from './pages/ClientSpecialRequests';
import ClientSupervisors from './pages/ClientSupervisors';
import ClientReports from './pages/ClientReports';
import ClientQRReports from './pages/ClientQRReports';
import ClientPayrollReport from './pages/ClientPayrollReport';
import ClientTrespass from './pages/ClientTrespass';
import ClientSchedule from './pages/ClientSchedule';
import ClientDocuments from './pages/ClientDocuments';
import ClientFeedback from './pages/ClientFeedback';
import ClientLocation from './pages/ClientLocation';
import SupervisorDailyCode from './pages/SupervisorDailyCode';
import AdminSupervisorCodes from './pages/AdminSupervisorCodes';
import StudentPortal from './pages/StudentPortal';
import ManageStudents from './pages/ManageStudents';
import ManageCompanyEmployees from './pages/ManageCompanyEmployees';
import TrainingRecords from './pages/TrainingRecords';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin, checkAppState } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
          <h1 className="text-xl font-bold">Pathfinder could not finish loading</h1>
          <p className="mt-2 text-sm text-slate-300">{authError.message || 'The connection to the application service was interrupted.'}</p>
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

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
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
      {/* Client Portal Routes */}
      <Route path="/ClientDashboard" element={<LayoutWrapper currentPageName="ClientDashboard"><ClientDashboard /></LayoutWrapper>} />
      <Route path="/ClientAlerts" element={<LayoutWrapper currentPageName="ClientAlerts"><ClientAlerts /></LayoutWrapper>} />
      <Route path="/ClientSpecialRequests" element={<LayoutWrapper currentPageName="ClientSpecialRequests"><ClientSpecialRequests /></LayoutWrapper>} />
      <Route path="/ClientSupervisors" element={<LayoutWrapper currentPageName="ClientSupervisors"><ClientSupervisors /></LayoutWrapper>} />
      <Route path="/ClientReports" element={<LayoutWrapper currentPageName="ClientReports"><ClientReports /></LayoutWrapper>} />
      <Route path="/ClientQRReports" element={<LayoutWrapper currentPageName="ClientQRReports"><ClientQRReports /></LayoutWrapper>} />
      <Route path="/ClientPayrollReport" element={<LayoutWrapper currentPageName="ClientPayrollReport"><ClientPayrollReport /></LayoutWrapper>} />
      <Route path="/ClientTrespass" element={<LayoutWrapper currentPageName="ClientTrespass"><ClientTrespass /></LayoutWrapper>} />
      <Route path="/ClientSchedule" element={<LayoutWrapper currentPageName="ClientSchedule"><ClientSchedule /></LayoutWrapper>} />
      <Route path="/ClientDocuments" element={<LayoutWrapper currentPageName="ClientDocuments"><ClientDocuments /></LayoutWrapper>} />
      <Route path="/ClientFeedback" element={<LayoutWrapper currentPageName="ClientFeedback"><ClientFeedback /></LayoutWrapper>} />
      <Route path="/ClientLocation" element={<LayoutWrapper currentPageName="ClientLocation"><ClientLocation /></LayoutWrapper>} />
      <Route path="/SupervisorDailyCode" element={<LayoutWrapper currentPageName="SupervisorDailyCode"><SupervisorDailyCode /></LayoutWrapper>} />
      <Route path="/AdminSupervisorCodes" element={<LayoutWrapper currentPageName="AdminSupervisorCodes"><AdminSupervisorCodes /></LayoutWrapper>} />
      <Route path="/StudentPortal" element={<LayoutWrapper currentPageName="StudentPortal"><StudentPortal /></LayoutWrapper>} />
      <Route path="/ManageStudents" element={<LayoutWrapper currentPageName="ManageStudents"><ManageStudents /></LayoutWrapper>} />
      <Route path="/ManageCompanyEmployees" element={<LayoutWrapper currentPageName="ManageCompanyEmployees"><ManageCompanyEmployees /></LayoutWrapper>} />
      <Route path="/TrainingRecords" element={<LayoutWrapper currentPageName="TrainingRecords"><TrainingRecords /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

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
  )
}

export default App