import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'
import PageNotFound from './lib/PageNotFound'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import UserNotRegisteredError from '@/components/UserNotRegisteredError'
import BOLOAlerts from './pages/BOLOAlerts'
import FieldUnitView from './pages/FieldUnitView'

const { Pages, Layout, mainPage } = pagesConfig
const mainPageKey = mainPage ?? Object.keys(Pages)[0]
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>

const LayoutWrapper = ({ children, currentPageName }) => Layout
  ? <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>

const PAGE_ROLES = {
  DispatchCenter: ['dispatch', 'admin'],
  BOLOAlerts: ['admin'],
  CallHistory: ['admin'],
  Personnel: ['admin'],
  Reports: ['admin'],
  AdminPortal: ['admin'],
  RecordsAssistant: ['admin'],
}

const RoleGuard = ({ page, user, children }) => {
  const allowed = PAGE_ROLES[page]
  if (!allowed || allowed.includes(user?.role || 'user')) return children
  return <Navigate to="/CommandDashboard" replace />
}

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth()

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#07101f]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />
    if (authError.type === 'auth_required') {
      navigateToLogin()
      return null
    }
  }

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
              <RoleGuard page={path} user={user}><Page /></RoleGuard>
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/BOLOAlerts" element={
        <LayoutWrapper currentPageName="BOLOAlerts">
          <RoleGuard page="BOLOAlerts" user={user}><BOLOAlerts /></RoleGuard>
        </LayoutWrapper>
      } />
      <Route path="/FieldUnitView" element={
        <LayoutWrapper currentPageName="FieldUnitView">
          <RoleGuard page="FieldUnitView" user={user}><FieldUnitView /></RoleGuard>
        </LayoutWrapper>
      } />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App