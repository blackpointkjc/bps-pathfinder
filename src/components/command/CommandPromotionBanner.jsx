import {useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {markAnnouncementsReadLocally} from '@/lib/announcementReadState';
import {Award,ShieldCheck,Megaphone} from 'lucide-react';

/** Read-and-acknowledge modal for published promotions. It is deliberately
 * not an app-header banner and cannot be dismissed without a saved receipt.
 * No advance scheduled promotions are fetched or shown to employees.
 */
export default function CommandPromotionBanner({user}){
 const [notice,setNotice]=useState(null);
 const [acknowledging,setAcknowledging]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!user?.email)return;
  let live=true;
  const load=async()=>{
   try{
    const items=await base44.entities.Announcement.filter({priority:'urgent'},'-created_date',50);
    if(!live)return;
    const events=(items||[]).filter(item=>item.audience==='company'&&String(item.publication_key||'').startsWith('promotion:'));
    const published=events.filter(item=>Number.isFinite(Date.parse(item.created_date))&&Date.now()>=Date.parse(item.created_date));
    for(const item of published){
      const receipts=await base44.entities.AnnouncementReceipt.filter({announcement_id:item.id,user_email:user.email},'-read_at',1);
      if(!live)return;
      if(!(receipts||[]).length){setNotice(item);return;}
    }
    setNotice(null);
   }catch(e){console.warn('Promotion acknowledgment lookup unavailable',e?.message||e);}
  };
  const t=window.setTimeout(load,900);
  const focus=()=>{if(document.visibilityState==='visible')void load();};
  const online=()=>void load();
  let unsubscribe;
  try{unsubscribe=base44.entities.Announcement.subscribe(event=>{const row=event?.data||event;
   if(String(row?.publication_key||'').startsWith('promotion:'))void load();
  });}catch{}
  document.addEventListener('visibilitychange',focus);
  window.addEventListener('focus',online);
  window.addEventListener('online',online);
  return()=>{live=false;window.clearTimeout(t);unsubscribe?.();document.removeEventListener('visibilitychange',focus);window.removeEventListener('focus',online);window.removeEventListener('online',online)};
 },[user?.email]);
 useEffect(()=>{
  if(!notice)return;
  const prevent=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}};
  document.addEventListener('keydown',prevent,true);
  return()=>document.removeEventListener('keydown',prevent,true);
 },[notice]);
 const acknowledge=async()=>{
  if(!notice||acknowledging||!user?.email)return;
  setAcknowledging(true);setError('');
  try{
   const existing=await base44.entities.AnnouncementReceipt.filter({announcement_id:notice.id,user_email:user.email},'-read_at',1);
   if(!existing?.length)await base44.entities.AnnouncementReceipt.create({announcement_id:notice.id,user_email:user.email,read_at:new Date().toISOString()});
   // Confirm the server receipt BEFORE clearing the mandatory popup.
   const confirmed=await base44.entities.AnnouncementReceipt.filter({announcement_id:notice.id,user_email:user.email},'-read_at',1);
   if(!confirmed?.length)throw new Error('Acknowledgment was not saved; please retry.');
   markAnnouncementsReadLocally(user.email,[notice.id]);
   setNotice(null);
   window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
  }catch(e){setError(e?.response?.data?.error||e.message||'Acknowledgment could not be saved.');}
  finally{setAcknowledging(false)}
 };
 if(!notice)return null;
 return <div role="presentation" className="fixed inset-0 z-[99999] flex items-center justify-center overflow-auto bg-black/90 p-3 backdrop-blur-sm sm:p-6">
  <section role="alertdialog" aria-modal="true" aria-labelledby="official-promotion-modal-title" aria-describedby="official-promotion-modal-message" className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border-2 border-amber-400 bg-[#101c30] text-white shadow-2xl">
   <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700 p-5 text-center text-slate-950"><Award className="mx-auto h-12 w-12"/><div className="mt-1 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest"><Megaphone size={14}/> Official company announcement</div><h2 id="official-promotion-modal-title" className="mt-2 text-xl font-black sm:text-2xl">Promotion & Change of Command</h2></div>
   <div className="max-h-[55vh] space-y-4 overflow-y-auto p-5 sm:p-7"><h3 className="text-lg font-bold text-amber-200">{notice.title}</h3>{notice.photo_url&&<img alt="Newly promoted officer portrait" src={notice.photo_url} className="mx-auto h-36 w-36 rounded-xl border border-amber-500 object-cover"/>}<div id="official-promotion-modal-message" className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100 sm:text-base">{notice.message}</div><p className="border-t border-slate-700 pt-3 text-xs font-semibold text-amber-200">Company personnel must read and acknowledge this promotion before continuing. Your acknowledgment is saved to Pathfinder.</p>{error&&<p role="alert" className="rounded border border-red-600 bg-red-950/50 p-3 text-xs text-red-200">{error}</p>}</div>
   <div className="border-t border-amber-700/50 bg-slate-950 p-4 sm:p-5"><button type="button" onClick={acknowledge} disabled={acknowledging} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"><ShieldCheck size={20}/>{acknowledging?'Saving your read receipt…':'I have read and acknowledge this official announcement'}</button></div>
  </section>
 </div>;
}
