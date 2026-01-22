import React from 'react';

export default function Layout({ children, currentPageName }) {
    // CAD system doesn't need a traditional layout - pages handle their own chrome
    // This keeps the system clean and modular
    return (
        <div className="w-full h-full">
            {children}
        </div>
    );
}