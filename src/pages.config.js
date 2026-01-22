import AdminPortal from './pages/AdminPortal';
import AssetManagement from './pages/AssetManagement';
import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';
import CADHome from './pages/CADHome';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminPortal": AdminPortal,
    "AssetManagement": AssetManagement,
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
    "CADHome": CADHome,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
    Layout: __Layout,
};