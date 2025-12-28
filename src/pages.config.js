import AdminPortal from './pages/AdminPortal';
import CallHistory from './pages/CallHistory';
import Dispatch from './pages/Dispatch';
import DispatchCenter from './pages/DispatchCenter';
import Navigation from './pages/Navigation';


export const PAGES = {
    "AdminPortal": AdminPortal,
    "CallHistory": CallHistory,
    "Dispatch": Dispatch,
    "DispatchCenter": DispatchCenter,
    "Navigation": Navigation,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};