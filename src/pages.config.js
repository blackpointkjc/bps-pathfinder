/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccountSettings from './pages/AccountSettings';
import ActiveCalls from './pages/ActiveCalls';
import AdminPortal from './pages/AdminPortal';
import ArchiveManager from './pages/ArchiveManager';
import AssetManagement from './pages/AssetManagement';
import CADHome from './pages/CADHome';
import CallHistory from './pages/CallHistory';
import CommandDashboard from './pages/CommandDashboard';
import DispatchCenter from './pages/DispatchCenter';

import LinkedAppSearch from './pages/LinkedAppSearch';
import Navigation from './pages/Navigation';
import Personnel from './pages/Personnel';
import RecordsAssistant from './pages/RecordsAssistant';

import SystemStatus from './pages/SystemStatus.jsx';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountSettings": AccountSettings,
    "ActiveCalls": ActiveCalls,
    "AdminPortal": AdminPortal,
    "ArchiveManager": ArchiveManager,
    "AssetManagement": AssetManagement,
    "CADHome": CADHome,
    "CallHistory": CallHistory,
    "CommandDashboard": CommandDashboard,
    "DispatchCenter": DispatchCenter,

    "LinkedAppSearch": LinkedAppSearch,
    "Navigation": Navigation,
    "Personnel": Personnel,
    "RecordsAssistant": RecordsAssistant,

    "SystemStatus": SystemStatus,
}

export const pagesConfig = {
    mainPage: "CommandDashboard",
    Pages: PAGES,
    Layout: __Layout,
};