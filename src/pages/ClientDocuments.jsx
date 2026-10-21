import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getClientPortalUser,getClientPreviewId } from '@/utils/clientPreview';
import { listDirectoryLocations,listDirectoryUsers } from '@/lib/appDirectory';
import SiteChainOfCommand from '@/components/SiteChainOfCommand';
import PostOrderInstructions from '@/components/PostOrderInstructions';
import { uniqueCompanySections } from '@/lib/postOrderContent';
import { BookOpen,MapPin,Phone,Shield,FileText } from 'lucide-react';
const siteKey=value=>String(value||'').trim().toLowerCase();
function Contact({title,value,phone=false}){
 if(!value)return null;
 return <div className="rounded-xl border border-slate-700 bg-slate-950 p-4"><p className="text-xs text-slate-400">{title}</p>{phone?<a href={'tel:'+value} className="mt-2 flex items-center gap-2 text-sm font-semibold text-cyan-200"><Phone className="h-4 w-4"/>{value}</a>:<p className="mt-2 whitespace-pre-wrap text-sm text-white">{value}</p>}</div>;
}
export default function ClientDocuments(){
 const [selectedSite,setSelectedSite]=useState(''),[view,setView]=useState('instructions');
 const preview=getClientPreviewId();
 const {data:user}=useQuery({queryKey:['clientPortalUser',preview],queryFn:getClientPortalUser,staleTime:60000});
 const assigned=[...new Set([...(user?.assigned_locations||[]),...(user?.assigned_sites||[]),user?.assigned_location].filter(Boolean))];
 const orderQuery=useQuery({queryKey:['clientPostOrderLibrary',user?.id,preview,assigned.join('|')],enabled:!!user,queryFn:async()=>{
  const rows=await base44.entities.PostOrder.list('-updated_date',1000);
  const allowed=new Set(assigned.map(siteKey)),seen=new Set();
  return rows.filter(row=>allowed.has(siteKey(row.site_name))).filter(row=>{const k=siteKey(row.site_name);if(seen.has(k))return false;seen.add(k);return true;});
 },staleTime:60000});
 const companyQuery=useQuery({queryKey:['generalPostOrders'],queryFn:()=>base44.entities.GeneralPostOrder.list('sort_order'),enabled:!!user,staleTime:60000});
 const {data:users=[]}=useQuery({queryKey:['clientPostOrderChainUsers'],queryFn:()=>listDirectoryUsers(),enabled:!!user,staleTime:60000});
 const {data:locations=[]}=useQuery({queryKey:['clientPostOrderChainLocations'],queryFn:()=>listDirectoryLocations(),enabled:!!user,staleTime:60000});
 const orders=orderQuery.data||[],order=orders.find(row=>row.site_name===selectedSite)||orders[0];
 const general=uniqueCompanySections(companyQuery.data||[]),location=locations.find(row=>siteKey(row.site_name)===siteKey(order?.site_name));
 const failed=view==='company'?companyQuery.error:orderQuery.error;
 const pending=view==='company'?companyQuery.isPending:orderQuery.isPending;
 return <div className="min-h-full bg-[#080f1b] p-4 text-slate-100 md:p-6"><div className="mx-auto max-w-[1440px]">
  <header className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-cyan-300">Client services / Reference library</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight"><BookOpen className="h-7 w-7 text-cyan-300"/>Post Orders</h1><p className="mt-2 text-sm text-slate-400">Property instructions, supervisor contacts and shared company standards.</p></div><button type="button" onClick={()=>{orderQuery.refetch();companyQuery.refetch();}} className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm">Refresh library</button></header>
  <nav aria-label="Document library" className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-700 bg-slate-900 p-2">{[['instructions','Property instructions'],['contacts','Contacts & command'],['company','Company orders & emergency plan']].map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)} className="rounded-lg px-4 py-3 text-sm font-medium text-slate-300 aria-pressed:bg-cyan-900 aria-pressed:text-white hover:bg-slate-800">{label}</button>)}</nav>
  {failed&&<div role="alert" className="mb-4 rounded-xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-100">The document library could not refresh: {failed.message}. Use Refresh library to retry.</div>}
  {pending?<p role="status" className="p-10 text-center text-slate-400">Loading documents…</p>:view==='company'?<section className="space-y-4"><header className="rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Black Point company orders</h2><p className="mt-2 text-sm text-slate-400">Shared standards for all properties · {general.length} sections</p></header>{general.map(section=><details key={section.id||section.section_key} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold">{section.section_title}</summary><p className="whitespace-pre-wrap border-t border-slate-700 px-5 py-5 text-sm leading-7 text-slate-300">{section.content}</p></details>)}{!general.length&&!failed&&<p className="p-8 text-center text-slate-400">No company instructions have been published.</p>}</section>:
  <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="rounded-xl border border-slate-700 bg-slate-900 p-3 lg:sticky lg:top-4"><h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your properties</h2><div className="space-y-1">{orders.map(row=><button type="button" key={row.id} aria-pressed={order?.id===row.id} onClick={()=>setSelectedSite(row.site_name)} className="w-full rounded-lg border border-transparent p-3 text-left aria-pressed:border-cyan-700 aria-pressed:bg-cyan-950/40 hover:bg-slate-800"><span className="block text-sm font-semibold text-white">{row.site_name}</span><span className="mt-1 block text-xs leading-relaxed text-slate-400">{row.site_address}</span></button>)}</div>{!orders.length&&<p className="p-3 text-sm text-slate-400">No property orders are available in your portfolio.</p>}</aside>
  <main className="min-w-0 space-y-4">{order?<><header className="rounded-xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{order.site_name}</h2><span className="rounded-full border border-slate-600 px-3 py-1 text-xs text-cyan-200">{order.post_type==='concealed_carry'?'Concealed carry':order.post_type==='unarmed'?'Unarmed post':'Armed post'}</span></div><p className="mt-2 flex items-center gap-2 text-sm text-slate-400"><MapPin className="h-4 w-4"/>{order.site_address}</p></header>
   {view==='instructions'?<><PostOrderInstructions order={order}/>{order.access_codes&&<Contact title="Property access" value={order.access_codes}/>} {order.site_map_url&&<details className="rounded-xl border border-slate-700 bg-slate-900 p-4"><summary className="cursor-pointer text-sm font-semibold">Property map</summary><img src={order.site_map_url} alt={order.site_name+' map'} className="mx-auto mt-4 max-h-[650px] max-w-full rounded-lg object-contain"/></details>}</>:
   <><section className="rounded-xl border border-slate-700 bg-slate-900 p-5"><h3 className="mb-4 flex items-center gap-2 font-semibold"><Shield className="h-5 w-5 text-cyan-300"/>Site chain of command</h3><SiteChainOfCommand assignedSupervisors={location?location.assigned_supervisors||[]:order.assigned_supervisors||[]} users={users}/></section><div className="grid gap-3 sm:grid-cols-2"><Contact title="Property manager" value={order.property_manager_name}/><Contact title="Property manager phone" value={order.property_manager_phone} phone/><Contact title="Maintenance" value={order.maintenance_contact} phone/><Contact title="Emergency services" value={order.emergency_police||'911'} phone/><Contact title="Non-emergency police" value={order.non_emergency_police} phone/><Contact title="Police precinct" value={order.police_precinct_address}/><Contact title="Additional contacts" value={order.additional_contacts}/></div></>}
  </>:<div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-400"><FileText className="mx-auto mb-3 h-8 w-8"/>{failed?'Property orders are temporarily unavailable.':'Select Company orders to read the shared operating standards.'}</div>}</main></div>}
 </div></div>;
}
