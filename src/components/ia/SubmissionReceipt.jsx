import {useEffect,useState} from 'react';
import ComplaintReceipt from '@/components/ComplaintReceipt';
export default function SubmissionReceipt(){
 const [receipt,setReceipt]=useState(null),[status,setStatus]=useState('');
 useEffect(()=>{const receive=e=>{setReceipt(e.detail);setStatus('');try{sessionStorage.setItem('bps:ia-receipt',JSON.stringify(e.detail));}catch{}};window.addEventListener('bps-ia-submission-receipt',receive);return()=>window.removeEventListener('bps-ia-submission-receipt',receive);},[]);
 if(!receipt)return null;
 return <div role="dialog" aria-modal="true" aria-label="Internal Affairs submission receipt" className="fixed inset-0 z-[99999] overflow-y-auto bg-black/80 p-5"><div className="portal-shell mx-auto max-w-2xl"><button type="button" className="float-right rounded bg-slate-800 px-4 py-2 text-white" onClick={()=>setReceipt(null)}>Close receipt</button><ComplaintReceipt receipt={receipt} onNew={()=>setReceipt(null)} onTrack={async()=>{try{const {base44}=await import('@/api/base44Client');const r=await base44.functions.invoke('professionalStandards',{action:'track',reference:receipt.reference,tracking_code:receipt.tracking_code});if(r.data?.error)throw new Error(r.data.error);setStatus(r.data.status+' — '+(r.data.message||''));}catch(e){setStatus(e.message);}}}/>{status&&<p role="status" className="rounded bg-slate-900 p-4 text-white">{status}</p>}</div></div>;
}
