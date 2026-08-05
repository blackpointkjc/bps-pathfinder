import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, BarChart3, Bot, ChevronLeft, ChevronRight, Clock3, FileWarning,
  Gauge, LogOut, Map, Menu, Radio, Shield, Siren, Users, X
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from './utils';
import { stopAllAlerts } from '@/utils/alertUtils';

const NAV_GROUPS = [
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Command', page: 'CommandDashboard', icon: Gauge, roles: ['user', 'dispatch', 'admin'] },
      { label: 'Dispatch', page: 'DispatchCenter', icon: Radio, roles: ['dispatch', 'admin'] },
      { label: 'Live Map', page: 'Navigation', icon: Map, roles: ['user', 'dispatch', 'admin'] },
      { label: 'Field Unit', page: 'FieldUnitView', icon: Shield, roles: ['user', 'dispatch', 'admin'] },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { label: 'Call History', page: 'CallHistory', icon: Clock3, roles: ['dispatch', 'admin'] },
      { label: 'BOLO / Alerts', page: 'BOLOAlerts', icon: FileWarning, roles: ['dispatch', 'admin'] },
      { label: 'Records AI', page: 'RecordsAssistant', icon: Bot, roles: ['admin'] },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { label: 'Personnel', page: 'Personnel', icon: Users, roles: ['admin'] },
      { label: 'Reports', page: 'Reports', icon: BarChart3, roles: ['admin'] },
      { label: 'Admin Control', page: 'AdminPortal', icon: Activity, roles: ['admin'] },
    ],
  },
];

const FULLSCREEN_PAGES = new Set(['Navigation']);

function roleName(user) {
  if (user?.role === 'admin') return 'SYSTEM ADMIN';
  if (user?.role === 'dispatch') return 'DISPATCH';
  return 'FIELD UNIT';
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [outages, setOutages] = useState([]);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const load = () => base44.entities.SystemOutage.filter({ resolved_at: null })
      .then(data => setOutages(data || []))
      .catch(() => setOutages([]));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onAlert = event => setActiveAlert(event.detail);
    const onClear = () => setActiveAlert(null);
    window.addEventListener('bps-new-call', onAlert);
    window.addEventListener('bps-alert-cleared', onClear);
    return () => {
      window.removeEventListener('bps-new-call', onAlert);
      window.removeEventListener('bps-alert-cleared', onClear);
    };
  }, []);

  const groups = useMemo(() => {
    const role = user?.role === 'admin' ? 'admin' : user?.role === 'dispatch' ? 'dispatch' : 'user';
    return NAV_GROUPS
      .map(group => ({ ...group, items: group.items.filter(item => item.roles.includes(role)) }))
      .filter(group => group.items.length);
  }, [user?.role]);

  const acknowledge = () => {
    stopAllAlerts();
    setActiveAlert(null);
  };

  if (FULLSCREEN_PAGES.has(currentPageName)) {
    return <div className="h-full w-full bg-[#050a12]">{children}</div>;
  }

  const Sidebar = ({ mobile = false }) => (
    <div className="flex h-full flex-col bg-[#08111f]">
      <div className="h-16 border-b border-[#1c3049] px-3 flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded bg-[#12315a] border border-[#2c5d91]">
          <Shield className="h-5 w-5 text-[#8cc7ff]" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#08111f] bg-emerald-400" />
        </div>
        {(!collapsed || mobile) && (
          <div className="min-w-0">
            <div className="text-[12px] font-black tracking-[0.18em] text-white">BPS PATHFINDER</div>
            <div className="text-[9px] tracking-[0.2em] text-[#6f8aa8]">PUBLIC SAFETY CAD</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map(group => (
          <div key={group.label} className="mb-4">
            {(!collapsed || mobile) && (
              <div className="px-2 pb-1.5 text-[9px] font-bold tracking-[0.22em] text-[#54708f]">{group.label}</div>
            )}
            <div className="space-y-1">
              {group.items.map(({ label, page, icon: Icon }) => {
                const active = currentPageName === page;
                return (
                  <Link
                    key={page}
                    to={createPageUrl(page)}
                    title={collapsed && !mobile ? label : undefined}
                    onClick={() => mobile && setMobileOpen(false)}
                    className={`relative flex h-10 items-center gap-3 rounded px-3 transition-colors ${
                      active
                        ? 'bg-[#14345c] text-white border border-[#2d6095]'
                        : 'text-[#8ea4bc] border border-transparent hover:bg-[#101f32] hover:text-white'
                    } ${collapsed && !mobile ? 'justify-center px-0' : ''}`}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#55aaff]" />}
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#76bcff]' : 'text-[#6683a0]'}`} />
                    {(!collapsed || mobile) && <span className="text-[11px] font-bold tracking-wide">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#1c3049] p-2">
        {(!collapsed || mobile) && (
          <div className="mb-2 rounded border border-[#1c3049] bg-[#0c1828] px-3 py-2">
            <div className="text-[9px] tracking-widest text-[#597491]">{roleName(user)}</div>
            <div className="truncate text-[11px] font-bold text-white">{[user?.rank, user?.last_name].filter(Boolean).join(' ') || user?.full_name || user?.email || 'AUTHORIZED USER'}</div>
            <div className="mt-1 text-[9px] text-emerald-400">● SECURE SESSION</div>
          </div>
        )}
        <button onClick={() => base44.auth.logout('/')} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-[#8399b0] hover:bg-red-950/30 hover:text-red-300 ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
          <LogOut className="h-4 w-4" />
          {(!collapsed || mobile) && <span className="text-[11px] font-bold">SIGN OUT</span>}
        </button>
      </div>
    </div>
  );

  const criticalOutage = outages.some(item => item.severity === 'outage');

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[#050a12] text-white cad-app">
      <aside className="hidden md:flex relative flex-col border-r border-[#1c3049]" style={{ width: collapsed ? 64 : 224, transition: 'width .18s ease' }}>
        <Sidebar />
        <button
          onClick={() => setCollapsed(value => !value)}
          className="absolute -right-3 top-20 z-40 flex h-8 w-6 items-center justify-center rounded border border-[#294867] bg-[#0b1726] text-[#7892ac] hover:text-white"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/70 md:hidden" onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} className="fixed inset-y-0 left-0 z-50 w-64 border-r border-[#1c3049] md:hidden">
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 text-[#8199b2]"><X className="h-4 w-4" /></button>
              <Sidebar mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#1c3049] bg-[#091321] px-3">
          <button onClick={() => setMobileOpen(true)} className="md:hidden text-[#8fa8c2]"><Menu className="h-4 w-4" /></button>
          <div className="flex items-center gap-2">
            <Siren className="h-4 w-4 text-[#5aabff]" />
            <span className="text-[11px] font-black tracking-[0.16em]">{(currentPageName || 'COMMAND').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}</span>
          </div>
          <div className="h-4 w-px bg-[#223852]" />
          <span className="hidden text-[9px] tracking-widest text-[#607c98] sm:block">REGIONAL OPERATIONS NETWORK</span>
          <div className="flex-1" />
          <Link to={createPageUrl('AdminPortal')} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[9px] font-bold ${
            criticalOutage ? 'border-red-600/60 bg-red-950/40 text-red-300' : outages.length ? 'border-amber-600/50 bg-amber-950/30 text-amber-300' : 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300'
          }`}>
            <Activity className="h-3 w-3" />
            {criticalOutage ? 'SYSTEM OUTAGE' : outages.length ? 'SYSTEM DEGRADED' : 'SYSTEM NORMAL'}
          </Link>
          <div className="hidden text-right font-mono sm:block">
            <div className="text-[11px] font-bold text-white">{clock.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' })}</div>
            <div className="text-[8px] tracking-widest text-[#607c98]">EASTERN TIME</div>
          </div>
        </header>

        {activeAlert && (
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-red-600 bg-red-950/80 px-3">
            <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-red-300"><Siren className="h-3.5 w-3.5" /> PRIORITY ALERT</span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white">{activeAlert.incident} — {activeAlert.location}</span>
            <button onClick={acknowledge} className="rounded border border-red-500 bg-red-700 px-3 py-1 text-[9px] font-black">ACKNOWLEDGE</button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-auto bg-[#060c15]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .12 }} className="h-full">
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </section>
    </div>
  );
}