import AdminPortal from './pages/AdminPortal';
import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';
import UnitManagement from './pages/UnitManagement';


export const PAGES = {
    "AdminPortal": AdminPortal,
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
    "UnitManagement": UnitManagement,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};