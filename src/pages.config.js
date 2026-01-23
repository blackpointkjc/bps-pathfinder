import ActiveCalls from './pages/ActiveCalls';
import AdminPortal from './pages/AdminPortal';
import ArchiveManager from './pages/ArchiveManager';
import AssetManagement from './pages/AssetManagement';
import CADHome from './pages/CADHome';
import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import DispatchLog from './pages/DispatchLog';
import Navigation from './pages/Navigation';
import Personnel from './pages/Personnel';
import Reports from './pages/Reports';
import SystemStatus from './pages/SystemStatus';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActiveCalls": ActiveCalls,
    "AdminPortal": AdminPortal,
    "ArchiveManager": ArchiveManager,
    "AssetManagement": AssetManagement,
    "CADHome": CADHome,
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "DispatchLog": DispatchLog,
    "Navigation": Navigation,
    "Personnel": Personnel,
    "Reports": Reports,
    "SystemStatus": SystemStatus,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
    Layout: __Layout,
};