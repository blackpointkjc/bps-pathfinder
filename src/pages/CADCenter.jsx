import { useEffect, useMemo, useRef, useState } from 'react';
import { RadioTower, Radio, ClipboardList, Map, Users, AlertTriangle, History, Shield } from 'lucide-react';
import {CadClock} from '@/components/dispatch/CadTerminal';
import '@/components/dispatch/cad-center-terminal.css';
import { useLocation,useNavigate } from 'react-router-dom';
import { DashboardDataProvider, useDashboardData } from '@/lib/DashboardDataContext';
import useCadRoster from '@/hooks/useCadRoster';
import CadStatusBar from '@/components/dispatch/cad/CadStatusBar';
import CadCommandPalette from '@/components/dispatch/cad/CadCommandPalette';
import CadResourceBoard from '@/components/dispatch/cad/CadResourceBoard';
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
    { id: 'map', icon: Map, short: 'Live map', label: 'Live Map', component: Navigation },
    { id: 'units', icon: Users, short: 'Units', label: 'Officer Status', component: UnitStatus },
  ],
  resources: [{ id: 'statusboard', icon: Users, short: 'Board', label: 'Unit board', component: CadResourceBoard }],
  alerts: [{ id: 'bolo', icon: AlertTriangle, short: 'BOLO', label: 'BOLO / Alerts', component: BOLOAlerts }],
  history: [
    { id: 'history', icon: History, short: 'Records', label: 'Call History', component: CallHistory },

  ],
};

const FLAT_TOOLS = Object.entries(TOOLS).flatMap(([group, items]) => items.map(item => ({ ...item, group })));

function CadCenterShell({ embedded = false }) {
 const location=useLocation(),navigate=useNavigate();
 const hostRef=useRef(null);
 const [paletteOpen,setPaletteOpen]=useState(false);
 const {calls,loading,rateLimited,manualRefresh}=useDashboardData();
 const {rows:units,refresh:refreshRoster}=useCadRoster();
 const params=new URLSearchParams(location.search);
 const section=params.get(embedded?'cad_section':'section')||'live';
 const toolKey=embedded?'cad_tool':'tool';
 const tools=TOOLS[section]||TOOLS.live;
 const active=tools.find(t=>t.id===params.get(toolKey))||tools[0];
 const Component=active.component;
 const workstations=useMemo(()=>FLAT_TOOLS.map(({id,label,short,group})=>({id,label,short,group})),[]);
 useEffect(()=>{
  if(!hostRef.current)return;
  const host=hostRef.current;
  const measure=()=>{
    const viewport=host.closest('main[data-page]');
    const bottom=Math.min(window.innerHeight,viewport?.getBoundingClientRect().bottom||window.innerHeight);
    const height=Math.max(0,Math.floor(bottom-Math.max(0,host.getBoundingClientRect().top,viewport?.getBoundingClientRect().top||0)-2));
    if(height>0)host.style.setProperty('--cad-workspace-height',height+'px');
  };
  measure();
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
  if(host.parentElement)observer?.observe(host.parentElement);
  window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
 },[active.id]);
 const select=(section,tool,focus)=>{
  const next=new URLSearchParams(location.search);next.set(embedded?'cad_section':'section',section);next.set(toolKey,tool);['new','open','call_id','call_number','callId','lat','lng','cad_focus'].forEach(key=>next.delete(key));
  if(focus&&focus!=='all')next.set('cad_focus',focus);
  navigate({pathname:location.pathname,search:'?'+next.toString()},{replace:true});
 };
 const openCall=call=>{
  if(!call?.id)return;
  const next=new URLSearchParams(location.search);next.set(embedded?'cad_section':'section','live');next.set(toolKey,'command');
  ['new','open','call_number','callId','lat','lng','cad_focus'].forEach(key=>next.delete(key));
  next.set('call_id',String(call.id));
  navigate({pathname:location.pathname,search:'?'+next.toString()},{replace:true});
 };
 const openStation=(station,focus)=>select(station==='statusboard'?'resources':'live',station,focus);
 // Keyboard-first operation: Ctrl/Cmd+K opens the command search, Alt+number
 // jumps straight to a workstation, Escape dismisses the palette.
 useEffect(()=>{
  const onKeyDown=event=>{
   if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){event.preventDefault();setPaletteOpen(open=>!open);return;}
   if(event.key==='Escape'){setPaletteOpen(false);return;}
   const target=event.target;
   const typing=/^(input|textarea|select)$/i.test(target?.tagName||'')||target?.isContentEditable;
   if(typing||!event.altKey||!/^[1-9]$/.test(String(event.key)))return;
   const station=FLAT_TOOLS[Number(event.key)-1];
   if(!station)return;
   event.preventDefault();
   select(station.group,station.id);
  };
  window.addEventListener('keydown',onKeyDown);
  return()=>window.removeEventListener('keydown',onKeyDown);
 },[location.search,location.pathname,embedded]);
 return <section ref={hostRef} className={'cad-console-shell cad-terminal-shell cad-shell-'+active.id} data-workstation={active.id}>
   <div className="cad-terminal-systembar"><span className="cad-terminal-id"><Shield size={16}/><b>PATHFINDER CAD</b><span> / </span><span>{active.label}</span></span><CadClock/></div>
   <nav className="cad-terminal-nav" aria-label="CAD workstations">{Object.entries(TOOLS).map(([group,items])=><div key={group} className="cad-terminal-nav-group" aria-label={group}>{items.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} aria-current={active.id===item.id?'page':undefined} onClick={()=>select(group,item.id)} title={item.label}><Icon size={17}/><span className="cad-nav-full">{item.label}</span><span className="cad-nav-short">{item.short}</span></button>})}</div>)}</nav>
   <CadStatusBar calls={calls} units={units} loading={loading} rateLimited={rateLimited} activeWorkstation={active.id} onSearch={()=>setPaletteOpen(true)} onOpenWorkstation={openStation} onRefresh={()=>{manualRefresh();refreshRoster(true);}}/>
   <div className={'cad-active-screen cad-terminal-screen cad-screen-'+active.id}>{active.id==='statusboard'?<CadResourceBoard calls={calls} onOpenCall={openCall}/>:<Component embedded />}</div>
   <CadCommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} calls={calls} units={units} workstations={workstations} onSelectCall={openCall} onSelectUnit={()=>select('resources','statusboard')} onSelectWorkstation={station=>select(station.group,station.id)}/>
 </section>;
}

export default function CADCenter({ embedded = false }) {
 return <DashboardDataProvider><CadCenterShell embedded={embedded} /></DashboardDataProvider>;
}