import AssetManagement from './pages/AssetManagement';
import CallHistory from './pages/CallHistory';
import AdminPortal from './pages/AdminPortal';
import ArchiveManager from './pages/ArchiveManager';
import Reports from './pages/Reports';
import SystemStatus from './pages/SystemStatus';
import CADHome from './pages/CADHome';
import Navigation from './pages/Navigation';
import ActiveCalls from './pages/ActiveCalls';
import DispatchCenter from './pages/DispatchCenter';
import DispatchLog from './pages/DispatchLog';
import Personnel from './pages/Personnel';
import Units from './pages/Units';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AssetManagement": AssetManagement,
    "CallHistory": CallHistory,
    "AdminPortal": AdminPortal,
    "ArchiveManager": ArchiveManager,
    "Reports": Reports,
    "SystemStatus": SystemStatus,
    "CADHome": CADHome,
    "Navigation": Navigation,
    "ActiveCalls": ActiveCalls,
    "DispatchCenter": DispatchCenter,
    "DispatchLog": DispatchLog,
    "Personnel": Personnel,
    "Units": Units,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
    Layout: __Layout,
};