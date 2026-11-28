import usePropertyAssignmentCalls from '@/hooks/usePropertyAssignmentCalls';
import {useAuth} from '@/lib/AuthContext';
import {canAccessDispatchCenter,canAccessCadAdminPages} from '@/lib/dispatchPermissions';
import useCadMonitorSelection from '@/hooks/useCadMonitorSelection';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, History, Map, RadioTower, Shield, Users } from 'lucide-react';
import { CadClock } from '@/components/dispatch/CadTerminal';
import '@/components/dispatch/cad-center-terminal.css';
import { Navigate,useLocation, useNavigate } from 'react-router-dom';
import { DashboardDataProvider, useDashboardData, useOptionalDashboardData } from '@/lib/DashboardDataContext';
import useCadRoster,{CadRosterProvider} from '@/hooks/useCadRoster';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import CadStatusBar from '@/components/dispatch/cad/CadStatusBar';
import CadCommandPalette from '@/components/dispatch/cad/CadCommandPalette';
import CadResourceBoard from '@/components/dispatch/cad/CadResourceBoard';
import CadIncidentMonitor from '@/components/dispatch/cad/CadIncidentMonitor';
import CadResponseAnalytics from '@/components/dispatch/cad/CadResponseAnalytics';
import { cadScaleValue, readCadDisplaySettings, writeCadDisplaySettings } from '@/lib/cadDisplaySettings';
import { createPageUrl } from '@/utils';
import CommandDashboard from './CommandDashboard';
import Navigation from './Navigation';
import UnitStatus from './UnitStatus';
import BOLOAlerts from './BOLOAlerts';
import CallHistory from './CallHistory';

import OfficerDispatchQueue from './OfficerDispatchQueue';

const TOOLS = {
  live: [
    { id: 'command', icon: RadioTower, short: 'Command', label: 'Command Board', component: CommandDashboard },
    { id: 'officerqueue', icon: ClipboardList, short: 'Field MDT', label: 'Officer Queue', component: OfficerDispatchQueue },
    { id: 'map', icon: Map, short: 'Live map', label: 'Live Map', component: Navigation },
    { id: 'units', icon: Users, short: 'Units', label: 'Unit Board', component: UnitStatus },
  ],
  resources: [{ id: 'statusboard', icon: Users, short: 'Board', label: 'Unit board', component: CadResourceBoard }],
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
  const {user}=useAuth();
  const dispatchAllowed=canAccessDispatchCenter(user);
  const {ids:monitoredIds,toggle:togglePin}=useCadMonitorSelection(user?.id||user?.email);
  const adminAllowed=canAccessCadAdminPages(user);
  const permittedTools=useMemo(()=>Object.fromEntries(Object.entries(TOOLS).map(([group,items])=>[group,items.filter(item=>(!['history','response'].includes(item.id)||adminAllowed))]).filter(([,items])=>items.length)),[adminAllowed]);
  const location = useLocation();
  const navigate = useNavigate();
  const hostRef = useRef(null);
  const { calls, loading, rateLimited, lastRefresh, manualRefresh } = useDashboardData();
  const {ids:propertyIds}=usePropertyAssignmentCalls(calls);
  const { rows, loading: rosterLoading, error: rosterError, refresh: refreshRoster } = useCadRoster();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [display, setDisplay] = useState(() => readCadDisplaySettings());
  const monitorOpen=display.monitor;

  const units = useMemo(() => rows.filter(isOperationalOfficer), [rows]);
  const params = new URLSearchParams(location.search);
  const detached = params.get('detached') === '1';
  const section = params.get(embedded ? 'cad_section' : 'section') || 'live';
  const toolKey = embedded ? 'cad_tool' : 'tool';
  const tools = permittedTools[section] || permittedTools.live;
  const requestedTool=params.get(toolKey)==='resources'?'units':params.get(toolKey);
  const active = tools.find(tool => tool.id === requestedTool) || tools[0];
  const Component = active.component;
  const scale = cadScaleValue(display.scale);
  const [viewportHeight,setViewportHeight]=useState(null);
  const shellStyle={'--cad-scale':scale,zoom:scale,'--cad-scaled-height':viewportHeight?viewportHeight/scale+'px':undefined};

  const select = (nextSection, tool, extra = {}) => {
    if(tool==='dispatch')return;
    if(['history','response'].includes(tool)&&!adminAllowed)return;
    const next = new URLSearchParams(location.search);
    next.set(embedded ? 'cad_section' : 'section', nextSection);
    next.set(toolKey, tool==='resources'?'units':tool);
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
    setDisplay(previous=>writeCadDisplaySettings(typeof next==='function'?next(previous):next));
  }, []);

  useEffect(()=>{const sync=()=>setDisplay(readCadDisplaySettings());window.addEventListener('storage',sync);window.addEventListener('bps-cad-display-changed',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('bps-cad-display-changed',sync);};},[]);
  const toggleMonitor = () => {
    updateDisplay(previous=>({...previous,monitor:!previous.monitor}));
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
      if (Number.isInteger(index) && index >= 1 && index <= permittedTools.live.length) {
        const tool = permittedTools.live[index - 1];
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
  }, [location.search, refreshAll, permittedTools]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const measure = () => {
      const viewport = host.closest('main[data-page]');
      const bottom = Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom || window.innerHeight);
      const height = Math.max(0, Math.floor(bottom - Math.max(0, host.getBoundingClientRect().top, viewport?.getBoundingClientRect().top || 0) - 2));
      if (height > 0) setViewportHeight(height);
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
  }, [active.id,scale]);

  const workstations = useMemo(
    () => Object.entries(permittedTools).flatMap(([group, items]) => items.map(item => ({ ...item, section: group }))),
    [permittedTools],
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
      detail: 'Show or hide your manually selected incidents',
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
  ].filter(command=>(active.id!=='command'||command.id!=='cmd-detach')&&(command.id!=='cmd-analytics'||adminAllowed)), [monitorOpen, display, refreshAll, location.search,active.id,adminAllowed]);

  // The telemetry strip deep-links into the workstation that owns each counter:
  // incident counts open the command board pre-filtered, resource counts open the
  // unit board on the matching status.
  const openStatusTarget = target => {
    if (!target?.tool) return;
    const extra = target.params || {};
    select('live', target.tool, extra);
  };

  if(requestedTool==='dispatch'&&dispatchAllowed){const next=new URLSearchParams();for(const key of ['call_id','call_number','new','open'])if(params.has(key))next.set(key,params.get(key));return <Navigate replace to={createPageUrl('DispatchCenter')+(next.size?'?'+next.toString():'')}/>;}
  if (detached) {
    return <section ref={hostRef} className="cad-console-shell cad-terminal-shell cad-shell-detached" data-high-zoom={scale>1.24} style={shellStyle}>
      <div className="cad-terminal-systembar">
        <span className="cad-terminal-id"><Shield size={16} /><b>PATHFINDER CAD</b><span> / </span><span>Detached live map</span></span>
        <div className="cad-top-display"><CadClock /></div>
      </div>
      <div className="cad-active-screen cad-terminal-screen cad-screen-map">
        <Navigation embedded />
      </div>
    </section>;
  }

  return <section ref={hostRef} className={'cad-console-shell cad-terminal-shell cad-shell-' + active.id+(active.id==='command'?' cad-command-v2':'')} data-workstation={active.id} data-high-zoom={scale>1.24} style={shellStyle}>
    {monitorOpen && <CadIncidentMonitor calls={calls} loading={loading} onOpen={openCall} onCollapse={toggleMonitor} selectedIds={monitoredIds} onTogglePin={togglePin} propertyIds={propertyIds} />}
    <nav className="cad-terminal-nav" aria-label="CAD workstations">{Object.entries(permittedTools).map(([group, items]) => <div key={group} className="cad-terminal-nav-group" aria-label={group}>{items.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-current={active.id === item.id ? 'page' : undefined} onClick={() => select(group, item.id)} title={item.label}><Icon size={17} /><span className="cad-nav-full">{item.label}</span><span className="cad-nav-short">{item.short}</span></button>; })}</div>)}<button className="cad-nav-monitor" type="button" aria-pressed={monitorOpen} onClick={toggleMonitor}><RadioTower size={15}/><span>Monitor {monitorOpen?'on':'off'}</span></button>{rateLimited&&<span role="status" className="cad-inline-feed-warning">Feed delayed</span>}</nav>
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
      onOpen={openStatusTarget}
      onToggleMonitor={toggleMonitor}
      onDetach={openDetachedMap}
    />
    <div className={'cad-active-screen cad-terminal-screen cad-screen-' + active.id}>
      {active.id === 'units' ? <UnitStatus key={(params.get('cad_status')||'All')+'|'+(params.get('cad_unit')||'')} initialStatus={params.get('cad_status')||'All'} initialUnitSearch={params.get('cad_unit')||''} onOpenCall={openCall}/>        : active.id === 'statusboard'
          ? <CadResourceBoard calls={calls} units={units} loading={loading} rosterLoading={rosterLoading} initialStatus={params.get('cad_status')||'All'} initialUnitSearch={params.get('cad_unit')||''} onOpenCall={openCall} onOpenUnits={() => select('live', 'units')} />
          : active.id === 'response'
          ? <CadResponseAnalytics />
          : active.id==='command' ? <CommandDashboard embedded/> : Component ? <Component embedded /> : null}
    </div>
    <CadCommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      calls={calls}
      units={units}
      workstations={workstations}
      commands={commands}
      onSelectCall={openCall}
      onSelectUnit={unit => select('live', 'units', { cad_unit: unit.unit_number || unit.email || '' })}
      onSelectWorkstation={tool => select(tool.section, tool.id)}
    />
  </section>;
}

export default function CADCenter({ embedded = false }) {
  // One live CAD queue owns the shell. Nested workstations reuse it instead of
  // mounting their own provider.
  const existing = useOptionalDashboardData();
  if (existing) return <CadRosterProvider><CadShell embedded={embedded} /></CadRosterProvider>;
  return <DashboardDataProvider><CadRosterProvider><CadShell embedded={embedded} /></CadRosterProvider></DashboardDataProvider>;
}