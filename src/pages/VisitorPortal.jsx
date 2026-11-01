import {Link} from 'react-router-dom';
import {useAuth} from '@/lib/AuthContext';
import '@/components/portal.css';
export default function VisitorPortal(){
 const {user,logout}=useAuth();
 return <main className="portal-shell min-h-full"><div className="portal-wrap"><p className="portal-eyebrow">BPS Pathfinder</p><h1>Visitor Portal</h1><section className="portal-card"><h2>Welcome, {user?.first_name||user?.full_name||'Visitor'}</h2><p>Your visitor account is approved. Visitor access includes public services and contact information. Staff operations and investigations require a separate authorized assignment.</p><div className="portal-actions"><Link className="portal-button" to="/IAFORM">Complaints, commendations & tracking</Link><a className="portal-button portal-secondary" href="mailto:info@blackpointkjc.com">Contact Black Point</a><button className="portal-secondary" onClick={()=>logout(true)}>Sign out</button></div></section></div></main>;
}