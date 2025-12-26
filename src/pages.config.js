import CallHistory from './pages/CallHistory';
import Dispatch from './pages/Dispatch';
import Navigation from './pages/Navigation';


export const PAGES = {
    "CallHistory": CallHistory,
    "Dispatch": Dispatch,
    "Navigation": Navigation,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};