import Admin from './pages/Admin';
import Dispatch from './pages/Dispatch';
import Navigation from './pages/Navigation';


export const PAGES = {
    "Admin": Admin,
    "Dispatch": Dispatch,
    "Navigation": Navigation,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};