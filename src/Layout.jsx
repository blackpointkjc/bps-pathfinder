import React, { useEffect } from 'react';

export default function Layout({ children, currentPageName }) {
    // Redirect to CADHome on initial load
    useEffect(() => {
        const path = window.location.pathname.toLowerCase();
        if (path === '/' || path === '/home' || !currentPageName || currentPageName === 'Home') {
            window.location.replace('/cadhome');
        }
    }, [currentPageName]);

    return (
        <div className="w-full h-full">
            {children}
        </div>
    );
}