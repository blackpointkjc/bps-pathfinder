import {useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {getLocalReadAnnouncementIds,markAnnouncementsReadLocally} from '@/lib/announcementReadState';
import {Award,Megaphone,ShieldCheck,X} from 'lucide-react';

const recent=entry=>Number.isFinite(Date.parse(entry.created_date))&&Date.now()-Date.parse(entry.created_date)<30*24*3600*1000;

/** Company-wide official promotion bulletin. A single cached read plus a new
 * Announcement subscription avoids restarting CAD or polluting the API queue.
 */
export default function CommandPromotionBanner({user}){
 const [current,setCurrent]=useState(null);
 const [acknowledging,setAcknowledging]=useState(false);
 useEffect(()=>{
  if(!user?.email)return;
  let live=true;
  const load=async()=>{
   try{
    const rows=await base44.entities.Announcement.filter({priority:'urgent'},'-created_date',35);
    if(!live)return;
    const seen=getLocalReadAnnouncementIds(user.email);
    const next=(rows||[]).find(item=>item.audience==='company'&&String(item.publication_key||'').startsWith('promotion:')&&recent(item)&&!seen.has(String(item.id)));
    setCurrent(next||null);
   }catch(error){console.warn('Promotion bulletin temporarily unavailable',error?.message||error)}
  };
  // The primary CAD workspace loads before optional command notices.
  const startup=window.setTimeout(load,2500);
  let unsubscribe;
  try{unsubscribe=base44.entities.Announcement.subscribe(event=>{
    const data=event?.data||event;
    if(String(data?.publication_key||'').startsWith('promotion:'))void load();
  });}catch{}
  const onOpened=()=>{if(!live)return;setCurrent(previous=>previous&&getLocalReadAnnouncementIds(user.email).has(String(previous.id))?null:previous);};
  window.addEventListener('bps-announcements-opened',onOpened);
  return()=>{live=false;window.clearTimeout(startup);unsubscribe?.();window.removeEventListener('bps-announcements-opened',onOpened)};
 },[user?.email]);
 const acknowledge=async()=>{
  if(!current||acknowledging)return;
  const announcement=current;
  setAcknowledging(true);
  markAnnouncementsReadLocally(user.email,[announcement.id]);
  setCurrent(null);
  window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
  try{
   const existing=await base44.entities.AnnouncementReceipt.filter({announcement_id:announcement.id,user_email:user.email},'-read_at',1);
   if(!existing.length)await base44.entities.AnnouncementReceipt.create({announcement_id:announcement.id,user_email:user.email,read_at:new Date().toISOString()});
  }catch(error){console.warn('Company promotion bulletin receipt pending',error?.message||error)}
  finally{setAcknowledging(false)}
 };
 if(!current)return null;
 return <section role="status" aria-label="Official personnel promotion and change of command" className="relative z-[240] shrink-0 border-y-2 border-amber-400 bg-gradient-to-r from-[#30230d] via-[#553308] to-[#30230d] px-3 py-3 text-white shadow-[0_10px_35px_rgba(0,0,0,.5)] sm:px-6">
  <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-3 sm:flex-nowrap sm:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400 bg-amber-500/20"><Award className="h-7 w-7 text-amber-200"/></div>
   <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.15em] text-amber-200"><Megaphone size={14}/> Official company-wide command announcement</div><h2 className="mt-1 text-sm font-black text-white sm:text-base">{current.title||'Official Promotion & Change of Command'}</h2><p className="mt-1 max-h-24 overflow-auto whitespace-pre-line text-xs leading-relaxed text-amber-50 sm:text-sm">{current.message}</p></div>
   <button type="button" onClick={acknowledge} disabled={acknowledging} className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"><ShieldCheck size={16}/> Acknowledge <X size={13}/></button>
  </div>
 </section>;
}
