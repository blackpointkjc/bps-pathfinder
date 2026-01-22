import AdminPortal from './pages/AdminPortal';
import AssetManagement from './pages/AssetManagement';
import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';
import CADHome from './pages/CADHome';
import ActiveCalls from './pages/ActiveCalls';
import Units from './pages/Units';
import DispatchLog from './pages/DispatchLog';
import Reports from './pages/Reports';
import Personnel from './pages/Personnel';
import SystemStatus from './pages/SystemStatus';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminPortal": AdminPortal,
    "AssetManagement": AssetManagement,
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
    "CADHome": CADHome,
    "ActiveCalls": ActiveCalls,
    "Units": Units,
    "DispatchLog": DispatchLog,
    "Reports": Reports,
    "Personnel": Personnel,
    "SystemStatus": SystemStatus,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
    Layout: __Layout,
};