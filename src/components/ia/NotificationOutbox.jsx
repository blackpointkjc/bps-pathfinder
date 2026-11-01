import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {psCall} from '@/pages/PublicProfessionalStandards';
export default function NotificationOutbox(){
 const [items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{const d=await psCall({action:'notifications'});setItems(d.notifications||[]);};
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
 return <section className="portal-card"><h2>Notification delivery</h2><p>Unsent messages are retained here. <Link to="/OutlookMail">Colonel Hiers: reconnect Microsoft for the IA shared mailbox</Link>, then retry failed notifications.</p>{error&&<p role="alert" className="portal-message portal-error">{error}</p>}{!items.length&&<p>No notifications have been queued.</p>}{items.map(item=><article key={item.id} className="portal-record"><div className="flex flex-wrap justify-between gap-3"><div><strong>{item.subject}</strong><small className="block">{item.to} · {item.status} · {item.attempts||0} attempt(s)</small></div>{item.status!=='sent'&&<button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await psCall({action:'retry_notification',notification_id:item.id});await refresh();if(r.email_sent===false)setError('Delivery still failed. See the connection error on the notification below.');}catch(e){setError(e.message);}finally{setBusy(false);}}}>Retry delivery</button>}</div>{item.last_error&&<p className="text-amber-200">{item.last_error}</p>}</article>)}</section>;
}
