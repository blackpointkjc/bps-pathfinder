import React, { useEffect } from 'react';
import { createPageUrl } from './utils';
import { Link, useNavigate } from 'react-router-dom';
import { Radio, Activity, MapPin, Clock } from 'lucide-react';

const ROOT_PAGES = ['CADHome', 'Navigation'];

const NAV_TABS = [
    { label: 'Home', icon: Radio, page: 'CADHome' },
    { label: 'Dispatch', icon: Activity, page: 'DispatchCenter' },
    { label: 'Map', icon: MapPin, page: 'Navigation' },
    { label: 'History', icon: Clock, page: 'CallHistory' },
];

export default function Layout({ children, currentPageName }) {
    const navigate = useNavigate();

    useEffect(() => {
        const path = window.location.pathname.toLowerCase();
        if (path === '/' || path === '/home' || !currentPageName || currentPageName === 'Home') {
            navigate('/cadhome', { replace: true });
        }
    }, [currentPageName]);

    // Navigation page uses its own full-screen layout — no bottom bar
    const isMapPage = currentPageName === 'Navigation';

    return (
        <div
            className="w-full h-full flex flex-col"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}
        >
            <div className={`flex-1 overflow-auto ${!isMapPage ? 'pb-[calc(4rem+env(safe-area-inset-bottom))]' : ''}`}>
                {children}
            </div>

            {/* Persistent bottom nav — hidden on the full-screen map page */}
            {!isMapPage && (
                <nav
                    className="fixed bottom-0 left-0 right-0 z-[9999] bg-slate-900 border-t border-slate-700 flex select-none"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    {NAV_TABS.map(({ label, icon: Icon, page }) => {
                        const isActive = currentPageName === page;
                        return (
                            <Link
                                key={page}
                                to={createPageUrl(page)}
                                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors select-none ${
                                    isActive
                                        ? 'text-blue-400'
                                        : 'text-slate-500 hover:text-slate-300'
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