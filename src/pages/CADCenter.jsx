import { useLocation,useNavigate } from 'react-router-dom';
import '@/components/dispatch/cad-console.css';
import CommandDashboard from './CommandDashboard';
import DispatchCenter from './DispatchCenter';
import Navigation from './Navigation';
import UnitStatus from './UnitStatus';
import BOLOAlerts from './BOLOAlerts';
import CallHistory from './CallHistory';
import RecordsAssistant from './RecordsAssistant';
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
    { id: 'records', label: 'Records AI', component: RecordsAssistant },
  ],
};

export default function CADCenter({ embedded = false }) {
 const location=useLocation(),navigate=useNavigate();
 const params=new URLSearchParams(location.search);
 const section=params.get(embedded?'cad_section':'section')||'live';
 const toolKey=embedded?'cad_tool':'tool';
 const tools=TOOLS[section]||TOOLS.live;
 const active=tools.find(t=>t.id===params.get(toolKey))||tools[0];
 const Component=active.component;
 const select=(section,tool)=>{const next=new URLSearchParams(location.search);next.set(embedded?'cad_section':'section',section);next.set(toolKey,tool);navigate({pathname:location.pathname,search:'?'+next.toString()},{replace:true});};
 return <main className="cad-console-shell">
  <header className="cad-system-header"><div><span className="cad-insignia">BPS</span><strong>PATHFINDER <small>COMPUTER AIDED DISPATCH</small></strong></div><span className="cad-system-label">OPERATIONS / COMMAND & CONTROL</span></header>
  <nav className="cad-mode-nav" aria-label="CAD workstations">{Object.entries(TOOLS).flatMap(([group,items])=>items.map(item=><button type="button" key={item.id} aria-current={active.id===item.id?'page':undefined} onClick={()=>select(group,item.id)}>{item.label}</button>))}</nav>
  <div className={'cad-active-screen '+(active.id==='dispatch'?'cad-screen-dispatch':'')}><Component embedded /></div>
 </main>;
}
