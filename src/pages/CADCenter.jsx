import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, History, LayoutGrid, Map, Radio, RadioTower, Shield, Users } from 'lucide-react';
import { CadClock } from '@/components/dispatch/CadTerminal';
import '@/components/dispatch/cad-center-terminal.css';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardDataProvider, useDashboardData, useOptionalDashboardData } from '@/lib/DashboardDataContext';
import useCadRoster from '@/hooks/useCadRoster';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import CadStatusBar from '@/components/dispatch/cad/CadStatusBar';
import CadCommandPalette from '@/components/dispatch/cad/CadCommandPalette';
import CadResourceBoard from '@/components/dispatch/cad/CadResourceBoard';
import CadIncidentMonitor from '@/components/dispatch/cad/CadIncidentMonitor';
import CadDisplaySettingsDialog from '@/components/dispatch/cad/CadDisplaySettingsDialog';
import CadResponseAnalytics from '@/components/dispatch/cad/CadResponseAnalytics';
import { cadScaleValue, readCadDisplaySettings, writeCadDisplaySettings } from '@/lib/cadDisplaySettings';
import { createPageUrl } from '@/utils';
import CommandDashboard from './CommandDashboard';
import DispatchCenter from './DispatchCenter';
import Navigation from './Navigation';
import UnitStatus from './UnitStatus';
import BOLOAlerts from './BOLOAlerts';
import CallHistory from './CallHistory';

import OfficerDispatchQueue from './OfficerDispatchQueue';

const TOOLS = {
  live: [
    { id: 'command', icon: RadioTower, short: 'Command', label: 'Command Board', component: CommandDashboard },
    { id: 'dispatch', icon: Radio, short: 'Dispatch', label: 'Dispatch Queue', component: DispatchCenter },
    { id: 'officerqueue', icon: ClipboardList, short: 'Field MDT', label: 'Officer Queue', component: OfficerDispatchQueue },
    { id: 'resources', icon: LayoutGrid, short: 'Resources', label: 'Unit & Resource Board' },
    { id: 'map', icon: Map, short: 'Live map', label: 'Live Map', component: Navigation },
    { id: 'units', icon: Users, short: 'Units', label: 'Officer Status', component: UnitStatus },
  ],
  alerts: [{ id: 'bolo', icon: AlertTriangle, short: 'BOLO', label: 'BOLO / Alerts', component: BOLOAlerts }],
  history: [
    { id: 'history', icon: History, short: 'Records', label: 'Call History', component: CallHistory },

  ],
  analysis: [{ id: 'response', icon: Activity, short: 'Analytics', label: 'Response Analytics' }],
};

// Deep-link keys are cleared whenever a workstation is chosen, so a stale
// filter or selected incident never follows the dispatcher to another screen.
const TRANSIENT_PARAMS = ['new', 'open', 'call_id', 'call_number', 'callId', 'lat', 'lng', 'cad_focus', 'cad_unit', 'cad_status'];

function CadShell({ embedded = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const hostRef = useRef(null);
  const { calls, loading, rateLimited, lastRefresh, manualRefresh } = useDashboardData();
  const { rows, loading: rosterLoading, error: rosterError, refresh: refreshRoster } = useCadRoster();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [display, setDisplay] = useState(() => readCadDisplaySettings());
  const [monitorOpen, setMonitorOpen] = useState(() => readCadDisplaySettings().monitor);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const units = useMemo(() => rows.filter(isOperationalOfficer), [rows]);
  const params = new URLSearchParams(location.search);
  const detached = params.get('detached') === '1';
  const section = params.get(embedded ? 'cad_section' : 'section') || 'live';
  const toolKey = embedded ? 'cad_tool' : 'tool';
  const tools = TOOLS[section] || TOOLS.live;
  const active = tools.find(tool => tool.id === params.get(toolKey)) || tools[0];
  const Component = active.component;
  const scale = cadScaleValue(display.scale);

  const select = (nextSection, tool, extra = {}) => {
    const next = new URLSearchParams(location.search);
    next.set(embedded ? 'cad_section' : 'section', nextSection);
    next.set(toolKey, tool);
    TRANSIENT_PARAMS.forEach(key => next.delete(key));
    Object.entries(extra).forEach(([key, value]) => {
      if (value != null && value !== '') next.set(key, String(value));
    });
    navigate({ pathname: location.pathname, search: '?' + next.toString() }, { replace: true });
  };

  const openCall = call => {
    if (call?.id) select('live', 'command', { call_id: call.id });
  };

  const refreshAll = useCallback(() => {
    manualRefresh();
    refreshRoster(true);
  }, [manualRefresh, refreshRoster]);

  const updateDisplay = useCallback(next => {
    setDisplay(writeCadDisplaySettings(next));
  }, []);

  const toggleMonitor = () => {
    const next = !monitorOpen;
    setMonitorOpen(next);
    updateDisplay({ ...display, monitor: next });
  };

  // A detached map runs in its own browser window, so a dispatcher can keep the
  // tactical picture on a second monitor while the queue stays on the first.
  const openDetachedMap = () => {
    const popup = window.open(
      `${createPageUrl('CADCenter')}?section=live&tool=map&detached=1`,
      'pathfinder-cad-map',
      'popup=yes,width=1500,height=950',
    );
    popup?.focus?.();
  };

  // CommandCentral keyboard model: Ctrl/Cmd + K opens quick find from any
  // screen, Alt + 1-6 jumps between live workstations and Alt + R refreshes.
  useEffect(() => {
    const onKeyDown = event => {
      const key = String(event.key || '');
      if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const index = Number(key);
      if (Number.isInteger(index) && index >= 1 && index <= TOOLS.live.length) {
        const tool = TOOLS.live[index - 1];
        if (tool) {
          event.preventDefault();
          select('live', tool.id);
        }
        return;
      }
      if (key.toLowerCase() === 'r') {
        event.preventDefault();
        refreshAll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [location.search, refreshAll]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const measure = () => {
      const viewport = host.closest('main[data-page]');
      const bottom = Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom || window.innerHeight);
      const height = Math.max(0, Math.floor(bottom - Math.max(0, host.getBoundingClientRect().top, viewport?.getBoundingClientRect().top || 0) - 2));
      if (height > 0) host.style.setProperty('--cad-workspace-height', height + 'px');
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (host.parentElement) observer?.observe(host.parentElement);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [active.id]);

  const workstations = useMemo(
    () => Object.entries(TOOLS).flatMap(([group, items]) => items.map(item => ({ ...item, section: group }))),
    [],
  );

  const commands = useMemo(() => [
    {
      id: 'cmd-refresh',
      label: 'Refresh CAD feed and unit roster',
      detail: 'Reload live calls, units and connection health',
      run: refreshAll,
    },
    {
      id: 'cmd-monitor',
      label: monitorOpen ? 'Hide incident monitor' : 'Show incident monitor',
      detail: 'Pending and at-risk incidents across every workstation',
      run: toggleMonitor,
    },
    {
      id: 'cmd-detach',
      label: 'Detach live map window',
      detail: 'Open the tactical map on a second monitor',
      run: openDetachedMap,
    },
    {
      id: 'cmd-analytics',
      label: 'Response analytics',
      detail: 'Dispatch, acknowledgement, arrival and clearance times',
      run: () => select('analysis', 'response'),
    },
    {
      id: 'cmd-display',
      label: 'CAD display settings',
      detail: 'Scaling, incident monitor and workspace layout',
      run: () => setSettingsOpen(true),
    },
  ], [monitorOpen, display, refreshAll]);

  if (detached) {
    return <section className="cad-console-shell cad-terminal-shell cad-shell-detached" style={{ '--cad-scale': scale }}>
      <div className="cad-terminal-systembar">
        <span className="cad-terminal-id"><Shield size={16} /><b>PATHFINDER CAD</b><span> / </span><span>Detached live map</span></span>
        <CadClock />
      </div>
      <div className="cad-active-screen cad-terminal-screen cad-screen-map">
        <Navigation embedded />
      </div>
    </section>;
  }

  return <section ref={hostRef} className={'cad-console-shell cad-terminal-shell cad-shell-' + active.id} data-workstation={active.id} style={{ '--cad-scale': scale }}>
    <div className="cad-terminal-systembar"><span className="cad-terminal-id"><Shield size={16} /><b>PATHFINDER CAD</b><span> / </span><span>{active.label}</span></span><CadClock /></div>
    <CadStatusBar
      calls={calls}
      units={units}
      loading={loading}
      rateLimited={rateLimited}
      lastRefresh={lastRefresh}
      rosterError={rosterError}
      monitorOpen={monitorOpen}
      onRefresh={refreshAll}
      onFind={() => setPaletteOpen(true)}
      onOpen={target => select('live', target.tool, target.params || {})}
      onToggleMonitor={toggleMonitor}
      onDetach={openDetachedMap}
      onSettings={() => setSettingsOpen(true)}
    />
    {monitorOpen && active.id!=='command' && <CadIncidentMonitor calls={calls} loading={loading} onOpen={openCall} onCollapse={toggleMonitor} />}
    <nav className="cad-terminal-nav" aria-label="CAD workstations">{Object.entries(TOOLS).map(([group, items]) => <div key={group} className="cad-terminal-nav-group" aria-label={group}>{items.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-current={active.id === item.id ? 'page' : undefined} onClick={() => select(group, item.id)} title={item.label}><Icon size={17} /><span className="cad-nav-full">{item.label}</span><span className="cad-nav-short">{item.short}</span></button>; })}</div>)}</nav>
    <div className={'cad-active-screen cad-terminal-screen cad-screen-' + active.id}>
      {active.id === 'resources'
        ? <CadResourceBoard
            key={(params.get('cad_status') || 'All') + '|' + (params.get('cad_unit') || '')}
            calls={calls}
            units={units}
            loading={loading}
            rosterLoading={rosterLoading}
            initialStatus={params.get('cad_status') || 'All'}
            initialUnitSearch={params.get('cad_unit') || ''}
            onOpenCall={openCall}
            onOpenUnits={() => select('live', 'units')}
          />
        : active.id === 'response'
          ? <CadResponseAnalytics />
          : Component ? <Component embedded /> : null}
    </div>
    <CadCommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      calls={calls}
      units={units}
      workstations={workstations}
      commands={commands}
      onSelectCall={openCall}
      onSelectUnit={unit => select('live', 'resources', { cad_unit: unit.unit_number || unit.email || '' })}
      onSelectWorkstation={tool => select(tool.section, tool.id)}
    />
    <CadDisplaySettingsDialog
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      settings={display}
      onChange={next => {
        updateDisplay(next);
        setMonitorOpen(next.monitor);
      }}
    />
  </section>;
}

export default function CADCenter({ embedded = false }) {
  // One live CAD queue owns the shell. Nested workstations reuse it instead of
  // mounting their own provider.
  const existing = useOptionalDashboardData();
  if (existing) return <CadShell embedded={embedded} />;
  return <DashboardDataProvider><CadShell embedded={embedded} /></DashboardDataProvider>;
}