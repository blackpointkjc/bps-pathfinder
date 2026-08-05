import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Printer, Shield, Users } from "lucide-react";
import { format } from "date-fns";

export default function VAContactSheet(){
  const {data:users=[],isLoading}=useQuery({queryKey:['vaCompanyContacts'],queryFn:()=>base44.entities.User.list()});
  const officers=useMemo(()=>users.filter(u=>!u.termination_date&&!u.additional_roles?.includes('client')&&!u.additional_roles?.includes('student')&&(u.role==='admin'||u.additional_roles?.includes('officer')||u.additional_roles?.includes('supervisor')||u.additional_roles?.includes('hr')||u.additional_roles?.includes('trainer')||u.additional_roles?.includes('accounting'))).sort((a,b)=>`${a.last_name||''}${a.first_name||''}`.localeCompare(`${b.last_name||''}${b.first_name||''}`)),[users]);
  const groups=useMemo(()=>officers.reduce((m,u)=>{const key=u.division||'Company Staff';(m[key]??=[]).push(u);return m},{}),[officers]);
  if(isLoading)return <div className="p-8 text-center text-slate-400">Loading company contacts…</div>;
  return <div className="min-h-screen p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6 print:max-w-none">
    <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-lg border border-blue-500/40 bg-blue-950/30 p-3"><Shield className="h-8 w-8 text-blue-400"/></div><div><h1 className="text-3xl font-bold">Black Point Protection Contact Sheet</h1><p className="text-slate-400">Company personnel directory</p></div></div><Button variant="outline" className="print:hidden" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4"/>Print</Button></div>
    {Object.entries(groups).sort().map(([division,list])=><Card key={division}><CardContent className="p-0"><div className="border-b border-slate-700 px-4 py-3"><h2 className="text-lg font-bold">{division}</h2><p className="text-xs text-slate-400">{list.length} personnel</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Rank</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Mobile</th><th className="p-3 text-left">Badge</th><th className="p-3 text-left">Unit</th><th className="p-3 text-left">DCJS</th></tr></thead><tbody>{list.map(u=><tr key={u.id} className="border-t border-slate-700/60"><td className="p-3 font-semibold">{u.last_name}, {u.first_name}</td><td className="p-3"><Badge variant="outline">{u.rank||'Employee'}</Badge></td><td className="p-3"><a className="inline-flex items-center gap-1 text-blue-400" href={`mailto:${u.email}`}><Mail className="h-3 w-3"/>{u.email}</a></td><td className="p-3">{u.mobile_phone?<a className="inline-flex items-center gap-1 text-blue-400" href={`tel:${u.mobile_phone}`}><Phone className="h-3 w-3"/>{u.mobile_phone}</a>:'—'}</td><td className="p-3">{u.badge_number||'—'}</td><td className="p-3">{u.unit_number||'—'}</td><td className="p-3">{u.dcjs_expiration?format(new Date(u.dcjs_expiration),'MM/dd/yyyy'):'—'}</td></tr>)}</tbody></table></div></CardContent></Card>)}
    {officers.length===0&&<Card><CardContent className="p-10 text-center"><Users className="mx-auto mb-3 h-12 w-12 text-slate-500"/><p>No active company personnel were found.</p></CardContent></Card>}
  </div></div>;
}