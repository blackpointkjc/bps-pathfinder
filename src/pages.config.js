import CallHistory from './pages/CallHistory';
import Dispatch from './pages/Dispatch';
import Navigation from './pages/Navigation';
import AdminPortal from './pages/AdminPortal';
import DispatchCenter from './pages/DispatchCenter';


export const PAGES = {
    "CallHistory": CallHistory,
    "Dispatch": Dispatch,
    "Navigation": Navigation,
    "AdminPortal": AdminPortal,
    "DispatchCenter": DispatchCenter,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};