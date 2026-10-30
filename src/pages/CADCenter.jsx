import { useEffect, useRef } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import CommandDashboard from './CommandDashboard';
import DispatchCenter from './DispatchCenter';
import Navigation from './Navigation';
import UnitStatus from './UnitStatus';
import BOLOAlerts from './BOLOAlerts';
import CallHistory from './CallHistory';

import OfficerDispatchQueue from './OfficerDispatchQueue';

const TOOLS = {
  live: [
    { id: 'command', label: 'Command Board', component: CommandDashboard },
    { id: 'dispatch', label: 'Dispatch Queue', component: DispatchCenter },
    { id: 'officerqueue', label: 'Officer Queue', component: OfficerDispatchQueue },
    { id: 'map', label: 'Live Map', component: Navigation },
    { id: 'units', label: 'Officer Status', component: UnitStatus },
  ],
  alerts: [{ id: 'bolo', label: 'BOLO / Alerts', component: BOLOAlerts }],
  history: [
    { id: 'history', label: 'Call History', component: CallHistory },

  ],
};

export default function CADCenter({ embedded = false }) {
 const location=useLocation(),navigate=useNavigate();
 const hostRef=useRef(null);
 const params=new URLSearchParams(location.search);
 const section=params.get(embedded?'cad_section':'section')||'live';
 const toolKey=embedded?'cad_tool':'tool';
 const tools=TOOLS[section]||TOOLS.live;
 const active=tools.find(t=>t.id===params.get(toolKey))||tools[0];
 const Component=active.component;
 useEffect(()=>{
  if(!['dispatch','map'].includes(active.id)||!hostRef.current)return;
  const host=hostRef.current;
  const measure=()=>{
    const viewport=host.closest('main[data-page]');
    const bottom=Math.min(window.innerHeight,viewport?.getBoundingClientRect().bottom||window.innerHeight);
    host.style.setProperty('--cad-workspace-height',Math.max(160,bottom-Math.max(0,host.getBoundingClientRect().top)-8)+'px');
  };
  measure();
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
  if(host.parentElement)observer?.observe(host.parentElement);
  window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
 },[active.id]);
 const select=(section,tool)=>{const next=new URLSearchParams(location.search);next.set(embedded?'cad_section':'section',section);next.set(toolKey,tool);['new','open','call_id','call_number','callId','lat','lng'].forEach(key=>next.delete(key));navigate({pathname:location.pathname,search:'?'+next.toString()},{replace:true});};
 return <main ref={hostRef} className={'cad-console-shell'+(active.id==='dispatch'?' cad-shell-dispatch':active.id==='map'?' cad-shell-map':'')}>
  <div className="cad-mobile-workstation-picker min-w-0 border-b border-[#34516c] bg-[#0c1929] p-2 xl:hidden">
   <label htmlFor="cad-mobile-workstation-select" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-cyan-200">CAD Workstation</label>
   <select
     id="cad-mobile-workstation-select"
     aria-label="Choose CAD workstation"
     value={`${section in TOOLS ? section : 'live'}:${active.id}`}
     onChange={event=>{
       const [nextSection,nextTool]=event.target.value.split(':');
       if(TOOLS[nextSection]?.some(item=>item.id===nextTool))select(nextSection,nextTool);
     }}
     className="block min-h-11 w-full min-w-0 rounded-lg border border-[#3a607d] bg-[#12283c] px-3 py-2 text-base font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
   >
     {Object.entries(TOOLS).map(([group,items])=><optgroup key={group} label={group==='live'?'Live CAD':group==='alerts'?'Alerts':'History & Records'}>
       {items.map(item=><option key={item.id} value={`${group}:${item.id}`}>{item.label}</option>)}
     </optgroup>)}
   </select>
  </div>
  <nav className="cad-mode-nav hidden xl:flex" aria-label="CAD workstations">{Object.entries(TOOLS).flatMap(([group,items])=>items.map(item=><button type="button" key={item.id} aria-current={active.id===item.id?'page':undefined} onClick={()=>select(group,item.id)}>{item.label}</button>))}</nav>
  <div className={'cad-active-screen '+(active.id==='dispatch'?'cad-screen-dispatch':active.id==='map'?'cad-screen-map':'')}><Component embedded /></div>
 </main>;
}
