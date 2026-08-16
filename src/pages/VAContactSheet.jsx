import{useMemo}from'react';
import{base44}from'@/api/base44Client';
import{useQuery}from'@tanstack/react-query';
import{Card,CardContent}from'@/components/ui/card';
import{Button}from'@/components/ui/button';
import{Badge}from'@/components/ui/badge';
import{Mail,Phone,Printer,Shield,Users,Building2}from'lucide-react';
import{isOperationalOfficer}from'@/lib/directoryUtils';
import { listDirectoryUsers } from '@/lib/appDirectory';

const OPERATIONAL_RANKS=['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const rankOrder=r=>{const i=OPERATIONAL_RANKS.indexOf(r);return i<0?99:i};
const has=(u,r)=>(u.additional_roles||[]).map(x=>String(x).toLowerCase()).includes(r);

export default function VAContactSheet(){
 const{data:users=[],isLoading}=useQuery({queryKey:['vaCompanyContacts'],queryFn:()=>listDirectoryUsers()});
 const operational=useMemo(()=>users.filter(u=>isOperationalOfficer(u)&&OPERATIONAL_RANKS.includes(u.rank)).sort((a,b)=>rankOrder(a.rank)-rankOrder(b.rank)||String(a.last_name||'').localeCompare(String(b.last_name||''))),[users]);
 const staff=useMemo(()=>users.filter(u=>{if(u.termination_date||isOperationalOfficer(u))return false;return has(u,'hr')||has(u,'support_staff')||has(u,'support')||has(u,'company_staff')||['human resources','support staff','company staff'].includes(String(u.rank||'').toLowerCase())}).sort((a,b)=>String(a.last_name||'').localeCompare(String(b.last_name||''))),[users]);
 const divisionGroups=useMemo(()=>operational.reduce((g,u)=>{const k=u.division||'Unassigned Division';(g[k]??=[]).push(u);return g},{}),[operational]);
 if(isLoading)return <div className="p-8 text-center text-slate-400">Loading contacts…</div>;
 const Person=({u})=><div className="grid gap-3 border-t border-slate-800 p-3 first:border-t-0 sm:grid-cols-2 md:grid-cols-[1.2fr_1fr_1.4fr_1fr_.7fr] md:items-center"><div><div className="font-bold text-white">{u.last_name}, {u.first_name}</div><div className="text-[10px] text-slate-500">{u.division||'Unassigned Division'}</div></div><div><Badge variant="outline" className="border-slate-700 text-slate-300">{u.rank||'Company Staff'}</Badge></div><a href={`mailto:${u.email}`} className="flex min-w-0 items-center gap-1 break-all text-xs text-blue-400 sm:break-normal"><Mail className="h-3 w-3 shrink-0"/><span className="min-w-0 sm:truncate">{u.email}</span></a><div className="min-w-0">{u.mobile_phone?<a href={`tel:${u.mobile_phone}`} className="flex items-center gap-1 break-all text-xs text-blue-400 sm:break-normal"><Phone className="h-3 w-3 shrink-0"/>{u.mobile_phone}</a>:<span className="text-xs text-slate-500">—</span>}</div><div className="text-xs text-slate-400">{u.unit_number?`Officer #${u.unit_number}`:'—'}</div></div>;
 return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="rounded-xl border border-blue-500/30 bg-blue-950/30 p-3"><Shield className="h-7 w-7 text-blue-400"/></div><div><h1 className="text-2xl font-black">VA CONTACT SHEET</h1><p className="text-sm text-slate-400">Operational personnel and company staff directory</p></div><Button variant="outline" className="ml-auto print:hidden" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4"/>Print</Button></div>
  {Object.entries(divisionGroups).sort(([a],[b])=>a.localeCompare(b)).map(([division,list])=><Card key={division} className="overflow-hidden border-slate-800 bg-slate-900 text-white"><CardContent className="p-0"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Building2 className="h-4 w-4 text-blue-400"/><div><h2 className="font-black">{division}</h2><p className="text-[10px] text-slate-500">OPERATIONAL PERSONNEL · ACTIVE OFFICER / SUPERVISOR ACCOUNTS</p></div><Badge className="ml-auto bg-blue-950 text-blue-300">{list.length}</Badge></div><div className="hidden border-b border-slate-800 px-3 py-2 text-[9px] font-bold tracking-widest text-slate-500 md:grid md:grid-cols-[1.2fr_1fr_1.4fr_1fr_.7fr]"><span>NAME</span><span>RANK</span><span>EMAIL</span><span>MOBILE</span><span>OFFICER #</span></div>{list.map(u=><Person key={u.id} u={u}/>)}</CardContent></Card>)}
  <Card className="overflow-hidden border-slate-800 bg-slate-900 text-white"><CardContent className="p-0"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Users className="h-4 w-4 text-amber-400"/><div><h2 className="font-black">HUMAN RESOURCES / SUPPORT / COMPANY STAFF</h2><p className="text-[10px] text-slate-500">Listed below operational divisions; each record shows only its assigned division.</p></div><Badge className="ml-auto bg-amber-950 text-amber-300">{staff.length}</Badge></div>{staff.length?staff.map(u=><Person key={u.id} u={u}/>):<div className="p-4 text-xs text-slate-500">No staff records match these roles.</div>}</CardContent></Card>
 </div></div>;
}
