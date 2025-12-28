import CallHistory from './pages/CallHistory';
import Dispatch from './pages/Dispatch';
import Navigation from './pages/Navigation';
import AdminPortal from './pages/AdminPortal';


export const PAGES = {
    "CallHistory": CallHistory,
    "Dispatch": Dispatch,
    "Navigation": Navigation,
    "AdminPortal": AdminPortal,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};