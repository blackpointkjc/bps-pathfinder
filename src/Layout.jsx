import React, { useEffect } from 'react';

export default function Layout({ children, currentPageName }) {
    // Redirect to CADHome on initial load if on root/home
    useEffect(() => {
        if (!currentPageName || currentPageName === 'Home') {
            window.location.href = '/cadhome';
        }
    }, [currentPageName]);

    return (
        <div className="w-full h-full">
            {children}
        </div>
    );
}