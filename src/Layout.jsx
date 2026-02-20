import React, { useEffect } from 'react';
import { createPageUrl } from './utils';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Activity, MapPin, Clock, ChevronLeft } from 'lucide-react';

const ROOT_PAGES = ['CADHome', 'Navigation'];

const NAV_TABS = [
    { label: 'Home', icon: Radio, page: 'CADHome' },
    { label: 'Dispatch', icon: Activity, page: 'DispatchCenter' },
    { label: 'Map', icon: MapPin, page: 'Navigation' },
    { label: 'History', icon: Clock, page: 'CallHistory' },
];

// Pages considered "root" (show logo, no back button)
const ROOT_PAGE_SET = new Set(['CADHome', 'Navigation']);

export default function Layout({ children, currentPageName }) {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const path = window.location.pathname.toLowerCase();
        if (path === '/' || path === '/home' || !currentPageName || currentPageName === 'Home') {
            navigate('/cadhome', { replace: true });
        }
    }, [currentPageName]);

    const isMapPage = currentPageName === 'Navigation';
    const isRoot = ROOT_PAGE_SET.has(currentPageName);
    const showTopBar = !isMapPage; // Map has its own full-screen header

    return (
        <div
            className="w-full h-full flex flex-col bg-slate-950"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}
        >
            {/* Top Bar */}
            {showTopBar && (
                <header className="flex-none h-12 bg-slate-900 border-b border-slate-800 flex items-center px-3 z-[100] gap-3">
                    {isRoot ? (
                        /* Logo for root screens */
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                                <Radio className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-white font-mono font-bold text-sm tracking-widest">BPS CAD</span>
                        </div>
                    ) : (
                        /* Back button for child screens */
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors min-h-[44px] pr-2"
                        >
                            <ChevronLeft className="w-5 h-5" />
                            <span className="text-sm font-medium">Back</span>
                        </button>
                    )}
                    <div className="flex-1" />
                    <span className="text-slate-400 text-xs font-mono uppercase tracking-wider truncate max-w-[50vw] text-right">
                        {currentPageName?.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                </header>
            )}

            {/* Page content */}
            <div
                className={`flex-1 overflow-auto ${!isMapPage ? 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]' : ''}`}
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={location.pathname}
                        initial={{ x: 24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -24, opacity: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="h-full"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom tab bar — hidden on map */}
            {!isMapPage && (
                <nav
                    className="fixed bottom-0 left-0 right-0 z-[9999] bg-slate-900 border-t border-slate-800 flex select-none"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    {NAV_TABS.map(({ label, icon: Icon, page }) => {
                        const isActive = currentPageName === page;
                        return (
                            <Link
                                key={page}
                                to={createPageUrl(page)}
                                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors select-none ${
                                    isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="text-[10px] font-mono font-semibold">{label}</span>
                            </Link>
                        );
                    })}
                </nav>
            )}
        </div>
    );
}