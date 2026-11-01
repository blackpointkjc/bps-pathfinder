import {useEffect,useState} from 'react';
import {psCall} from '@/pages/PublicProfessionalStandards';
export default function ClientReferrals({onOpen}){
 const [rows,setRows]=useState([]),[error,setError]=useState('');
 useEffect(()=>{psCall({action:'client_referrals'}).then(d=>setRows(d.referrals||[])).catch(e=>setError(e.message));},[]);
 return <section className="portal-card"><h2>Client complaints & commendations</h2><p>Historical client feedback flagged as a complaint or commendation is reviewed here. Opening an investigation preserves a link to the original feedback.</p>{error&&<p role="alert" className="portal-message portal-error">{error}</p>}{!rows.length&&<p>No flagged client feedback is awaiting review.</p>}{rows.map(row=><article key={row.id} className="portal-record"><strong>{row.commendation?'Commendation':'Complaint'} · {row.officer_email||'Officer not specified'}</strong><small className="block">{row.location} · {row.shift_date||String(row.created_date||'').slice(0,10)}</small><p>{row.comments}</p><button onClick={()=>onOpen(row)}>Open linked investigation</button></article>)}</section>;
}
