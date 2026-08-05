/**
 * Route registry for operational CAD pages.
 * Keep this list focused: role-specific standalone views live in App.jsx.
 */
import AdminPortal from './pages/AdminPortal'
import CallHistory from './pages/CallHistory'
import CommandDashboard from './pages/CommandDashboard'
import DispatchCenter from './pages/DispatchCenter'
import Reports from './pages/Reports'
import Navigation from './pages/Navigation'
import Personnel from './pages/Personnel'
import RecordsAssistant from './pages/RecordsAssistant'
import __Layout from './Layout.jsx'

export const PAGES = {
  AdminPortal,
  CallHistory,
  CommandDashboard,
  DispatchCenter,
  Reports,
  Navigation,
  Personnel,
  RecordsAssistant,
}

export const pagesConfig = {
  mainPage: 'CommandDashboard',
  Pages: PAGES,
  Layout: __Layout,
}
