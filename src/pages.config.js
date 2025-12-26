import Navigation from './pages/Navigation';
import Dispatch from './pages/Dispatch';
import Admin from './pages/Admin';


export const PAGES = {
    "Navigation": Navigation,
    "Dispatch": Dispatch,
    "Admin": Admin,
}

export const pagesConfig = {
    mainPage: "Navigation",
    Pages: PAGES,
};