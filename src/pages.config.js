import AdminPortal from './pages/AdminPortal';
import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';
import AssetManagement from './pages/AssetManagement';


export const PAGES = {
    "AdminPortal": AdminPortal,
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
    "AssetManagement": AssetManagement,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};