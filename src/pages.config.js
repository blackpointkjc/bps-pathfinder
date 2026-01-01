import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';
import AdminPortal from './pages/AdminPortal';


export const PAGES = {
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
    "AdminPortal": AdminPortal,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};