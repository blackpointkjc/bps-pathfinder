import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { stopAllAlerts } from '@/utils/alertUtils';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Radio, Activity, MapPin, Clock, Shield, Users, BarChart2, Settings,
    Home, Zap, FileText, Menu, X, LogOut, ClipboardList
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from './utils';
import CollapsePanelButton from '@/components/CollapsePanelButton';

// Nav item definitions with role requirements
const ALL_NAV = [
    { label: 'COMMAND', section: true },
    { label: 'Command Center', icon: Home, page: 'CommandDashboard', roles: ['user', 'dispatch', 'admin'] },
    { label: 'Live Map', icon: MapPin, page: 'Navigation', roles: ['user', 'dispatch', 'admin'] },
    { label: 'DISPATCH', section: true, roles: ['dispatch', 'admin'] },
    { label: 'Dispatch Center', icon: Zap, page: 'DispatchCenter', roles: ['dispatch', 'admin'] },
    { label: 'BOLO / Alerts', icon: Radio, page: 'BOLOAlerts', roles: ['dispatch', 'admin'] },
    { label: 'Call History', icon: Clock, page: 'CallHistory', roles: ['dispatch', 'admin'] },
    { label: 'Field Unit View', icon: Shield, page: 'FieldUnitView', roles: ['user', 'dispatch', 'admin'] },
    { label: 'OPERATIONS', section: true, roles: ['admin'] },
    { label: 'Personnel', icon: Users, page: 'Personnel', roles: ['admin'] },
    { label: 'Dispatch Log', icon: FileText, page: 'DispatchLog', roles: ['admin'] },
    { label: 'Reports', icon: BarChart2, page: 'Reports', roles: ['admin'] },
    { label: 'Supervisor Review', icon: ClipboardList, page: 'SupervisorReview', roles: ['admin'] },
    { label: 'System Status', icon: Activity, page: 'SystemStatus', roles: ['admin'] },
    { label: 'SYSTEM', section: true, roles: ['admin'] },
    { label: 'Admin Portal', icon: Shield, page: 'AdminPortal', roles: ['admin'] },
];

const FULLSCREEN_PAGES = new Set(['Navigation']);

function getNavItems(role) {
    const effectiveRole = role === 'admin' ? 'admin' : role === 'dispatch' ? 'dispatch' : 'user';
    return ALL_NAV.filter(item => !item.roles || item.roles.includes(effectiveRole));
}

function buildSections(items) {
    const sections = [];
    let current = null;
    for (const item of items) {
        if (item.section) {
            current = { label: item.label, items: [] };
            sections.push(current);
        } else if (current) {
            current.items.push(item);
        }
    }
    return sections.filter(s => s.items.length > 0);
}

export default function Layout({ children, currentPageName }) {
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userRole, setUserRole] = useState('user');
    const [activeAlert, setActiveAlert] = useState(null);
    const [systemOutages, setSystemOutages] = useState([]);

    useEffect(() => {
        const loadOutages = async () => {
            try {
                const outages = await base44.entities.SystemOutage.filter({ resolved_at: null });
                setSystemOutages(outages || []);
            } catch {}
        };
        loadOutages();
        const interval = setInterval(loadOutages, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handler = (e) => setActiveAlert(e.detail);
        const clearHandler = () => setActiveAlert(null);
        window.addEventListener('bps-new-call', handler);
        window.addEventListener('bps-alert-cleared', clearHandler);
        return () => {
            window.removeEventListener('bps-new-call', handler);
            window.removeEventListener('bps-alert-cleared', clearHandler);
        };
    }, []);

    const handleAcknowledge = () => {
        stopAllAlerts();
        setActiveAlert(null);
    };

    useEffect(() => {
        base44.auth.me().then(user => {
            if (user?.role) setUserRole(user.role);
        }).catch(() => {});
    }, []);

    const isFullscreen = FULLSCREEN_PAGES.has(currentPageName);
    if (isFullscreen) return (
        <div className="w-full h-full relative">
            {activeAlert && (
                <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center gap-3 px-4 py-2 bg-red-900/95 border-b-2 border-red-500 animate-pulse">
                    <span className="text-red-300 text-xs font-mono font-bold flex-shrink-0">🚨 NEW CALL:</span>
                    <span className="text-white text-xs font-mono truncate flex-1">{activeAlert.incident} @ {activeAlert.location}</span>
                    <button onClick={handleAcknowledge}
                        className="flex-shrink-0 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold rounded border border-red-400">
                        ACKNOWLEDGE
                    </button>
                </div>
            )}
            {children}
        </div>
    );

    const navSections = buildSections(getNavItems(userRole));

    const handleLogout = () => base44.auth.logout('/');

    const NavContent = ({ onNav }) => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className={`flex items-center gap-3 px-3 py-3 border-b border-slate-800 flex-shrink-0 ${collapsed ? 'justify-center' : ''}`}>
                <div className="relative flex-shrink-0">
                    <img src="https://media.base44.com/images/public/694de31c7e0f5645fb95de52/e9bbe2fdb_image.png" alt="KIC Security Services" className="w-10 h-10" style={{ mixBlendMode: 'multiply' }} />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-slate-900 animate-pulse hidden" />
                </div>
                {!collapsed && (
                    <div className="min-w-0">
                        <div className="text-gold font-black text-sm tracking-[0.2em] font-mono leading-none">BPS CAD</div>
                        <div className="text-slate-500 text-[9px] font-mono tracking-[0.15em] mt-0.5">COMMAND &amp; DISPATCH</div>
                        <div className="flex items-center gap-1 mt-1">
                            <span className="w-1 h-1 rounded-full bg-green-500" />
                            <span className="text-green-400 text-[8px] font-mono tracking-widest">SYSTEM ONLINE</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
                {navSections.map(section => (
                    <div key={section.label}>
                        {!collapsed && (
                            <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                                <div className="h-px flex-1 bg-slate-800" />
                                <span className="text-[9px] font-black text-gold/70 tracking-[0.3em] font-mono uppercase">{section.label}</span>
                                <div className="h-px flex-1 bg-slate-800" />
                            </div>
                        )}
                        {collapsed && <div className="h-px bg-slate-800 mx-2 my-2" />}
                        <div className="space-y-0.5">
                            {section.items.map(({ label, icon: Icon, page }) => {
                                const isActive = currentPageName === page;
                                return (
                                    <Link
                                        key={page}
                                        to={createPageUrl(page)}
                                        onClick={() => onNav?.()}
                                        title={collapsed ? label : undefined}
                                        className={`group flex items-center gap-3 px-3 py-2 rounded transition-all select-none relative ${
                                            isActive
                                                ? 'bg-gold/20 text-gold border border-gold/50 shadow-[inset_3px_0_0_0_hsl(var(--gold))]'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
                                        } ${collapsed ? 'justify-center' : ''}`}
                                    >
                                        {isActive && !collapsed && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold rounded-r" />
                                        )}
                                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-gold' : 'text-slate-500 group-hover:text-slate-300'}`} />
                                        {!collapsed && <span className={`text-xs font-mono tracking-wide ${isActive ? 'font-bold text-gold' : ''}`}>{label}</span>}
                                        {isActive && !collapsed && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className={`border-t border-slate-800 p-3 flex-shrink-0 ${collapsed ? 'flex flex-col items-center' : ''}`}>
                {!collapsed && (
                    <div className="flex gap-3 px-3 py-1.5 mb-1">
                        <Link to="/About" className="text-slate-500 hover:text-slate-300 text-[10px] font-mono transition-colors">About</Link>
                        <Link to="/Contact" className="text-slate-500 hover:text-slate-300 text-[10px] font-mono transition-colors">Contact</Link>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/10 transition-all w-full"
                >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-mono">Sign Out</span>}
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 flex bg-slate-950 overflow-hidden">
            {/* Desktop Sidebar */}
            <div
                style={{ width: collapsed ? 64 : 220, transition: 'width 0.2s' }}
                className="hidden md:flex flex-col bg-slate-900 border-r border-slate-800 flex-shrink-0 relative z-30 h-full"
            >
                <NavContent />
                <div className="absolute top-1/2 -translate-y-1/2 -right-3 z-40">
                    <CollapsePanelButton isOpen={!collapsed} onClick={() => setCollapsed(c => !c)} className="w-5 h-16 bg-[#0d1220]/90 backdrop-blur border border-l-0 border-[#1e2d4a] rounded-r-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-[#1a2535] transition-all" />
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="md:hidden fixed inset-0 bg-black/60 z-40"
                            onClick={() => setMobileOpen(false)}
                        />
                        <motion.div
                            initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
                            transition={{ duration: 0.2 }}
                            className="md:hidden fixed left-0 top-0 bottom-0 w-60 bg-slate-900 border-r border-slate-800 z-50 flex flex-col"
                        >
                            <button onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                            <NavContent onNav={() => setMobileOpen(false)} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
                {/* Top Command Bar */}
                <header className="flex-none h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-3 z-20">
                    <button onClick={() => setMobileOpen(true)} className="md:hidden text-slate-400 hover:text-white">
                        <Menu className="w-5 h-5" />
                    </button>

                    <div className="flex-1" />
                    {systemOutages.length === 0 ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-400 font-mono text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            ALL SYSTEMS OPERATIONAL
                        </div>
                    ) : systemOutages.some(o => o.severity === 'outage') ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/30 rounded text-red-400 font-mono text-[10px] font-bold animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            {systemOutages.length} SYSTEM OUTAGE{systemOutages.length > 1 ? 'S' : ''}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400 font-mono text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                            {systemOutages.length} SYSTEM ISSUE{systemOutages.length > 1 ? 'S' : ''}
                        </div>
                    )}
                    <Link to={createPageUrl('AdminPortal')} className="text-slate-400 hover:text-gold transition-colors">
                        <Settings className="w-5 h-5" />
                    </Link>
                </header>

                {/* Global Alert Banner */}
                {activeAlert && (
                    <div className="flex-none flex items-center gap-3 px-4 py-2 bg-red-900/90 border-b-2 border-red-500 animate-pulse z-50">
                        <span className="text-red-300 text-xs font-mono font-bold flex-shrink-0">🚨 NEW CALL:</span>
                        <span className="text-white text-xs font-mono truncate flex-1">{activeAlert.incident} @ {activeAlert.location}</span>
                        <button onClick={handleAcknowledge}
                            className="flex-shrink-0 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold rounded border border-red-400">
                            ACKNOWLEDGE
                        </button>
                    </div>
                )}

                {/* Page Content */}
                <main className="flex-1 overflow-auto min-h-0">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="h-full"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}