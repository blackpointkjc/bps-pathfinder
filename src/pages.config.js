import CallHistory from './pages/CallHistory';
import DispatchCenter from './pages/DispatchCenter';
import AdminPortal from './pages/AdminPortal';
import Navigation from './pages/Navigation';


export const PAGES = {
    "CallHistory": CallHistory,
    "DispatchCenter": DispatchCenter,
    "AdminPortal": AdminPortal,
    "Navigation": Navigation,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};