import AssetManagement from './pages/AssetManagement';
import CallHistory from './pages/CallHistory';
import Navigation from './pages/Navigation';
import DispatchCenter from './pages/DispatchCenter';
import AdminPortal from './pages/AdminPortal';


export const PAGES = {
    "AssetManagement": AssetManagement,
    "CallHistory": CallHistory,
    "Navigation": Navigation,
    "DispatchCenter": DispatchCenter,
    "AdminPortal": AdminPortal,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};