import AdminPortal from './pages/AdminPortal';
import CallHistory from './pages/CallHistory';
import UnitManagement from './pages/UnitManagement';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';


export const PAGES = {
    "AdminPortal": AdminPortal,
    "CallHistory": CallHistory,
    "UnitManagement": UnitManagement,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};