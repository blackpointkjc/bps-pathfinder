import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
export function CadTerminalHeader({title,subtitle,icon:Icon,children}){
 return <header className="tac-header cad-terminal-header"><div className="tac-brand">{Icon&&<Icon size={22}/>}<div><small>BLACK POINT / CAD OPERATIONS</small><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></div><div className="tac-header-actions">{children}</div></header>;
}
export function CadRefresh({onClick,busy=false,label='Refresh'}){return <button type="button" disabled={busy} onClick={onClick}><RefreshCw size={15} className={busy?'animate-spin':''}/>{busy?'Updating…':label}</button>;}
export function CadPanelBar({title,children}){return <div className="tac-panel-bar"><span>{title}</span><div>{children}</div></div>;}
export function CadMetricStrip({items}){return <div className="cad-terminal-metrics">{items.map(({label,value,tone='neutral',onClick,selected})=>onClick?<button key={label} type="button" data-tone={tone} aria-pressed={selected} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>:<div key={label} data-tone={tone}><span>{label}</span><strong>{value}</strong></div>)}</div>;}
export function CadStatus({value}){const status=String(value||'Unknown');return <span className="cad-status-chip" data-status={status.toLowerCase()}>{status}</span>;}
export function CadClock(){const [now,setNow]=useState(()=>new Date());useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t)},[]);return <time className="cad-terminal-clock">{now.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour12:false})} ET</time>;}
