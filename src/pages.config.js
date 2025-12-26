import Dispatch from './pages/Dispatch';
import Navigation from './pages/Navigation';
import CallHistory from './pages/CallHistory';


export const PAGES = {
    "Dispatch": Dispatch,
    "Navigation": Navigation,
    "CallHistory": CallHistory,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};