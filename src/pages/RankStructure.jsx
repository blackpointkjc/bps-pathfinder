import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Shield, Users, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const rankIndex = r => { const i=RANKS.indexOf(r); return i < 0 ? 99 : i; };

export default function RankStructure(){
  const {data:user}=useQuery({queryKey:['currentUser'],queryFn:()=>base44.auth.me()});
  const {data:users=[]}=useQuery({queryKey:['allUsersRank'],queryFn:()=>base44.entities.User.list()});
  const roles=new Set((user?.additional_roles||[]).map(r=>String(r).toLowerCase()));
  const allowed=user?.role==='admin'||roles.has('officer')||roles.has('cad_access')||roles.has('supervisor')||roles.has('full_access');
  const active=useMemo(()=>users.filter(u=>!u.termination_date&&RANKS.includes(u.rank)).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999)),[users]);
  if(!allowed) return <div className="p-8 text-center"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><h2 className="text-xl font-bold">Access Required</h2></div>;
  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><Shield className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black tracking-wide">RANK STRUCTURE</h1><p className="text-sm text-slate-400">Current chain of command and operational personnel</p></div></div></div>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">{RANKS.map((r,i)=><React.Fragment key={r}><Badge variant="outline" className="border-slate-700 bg-slate-950 px-3 py-1 text-slate-200">{r}</Badge>{i<RANKS.length-1&&<ChevronRight className="h-3 w-3 text-slate-600"/>}</React.Fragment>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">{RANKS.map(rank=>{const list=active.filter(u=>u.rank===rank);return <section key={rank} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="flex items-center border-b border-slate-800 bg-slate-900/90 px-4 py-3"><div><div className="text-sm font-black text-amber-300">{rank.toUpperCase()}</div><div className="text-[10px] text-slate-500">{list.length} PERSONNEL</div></div></div><div className="divide-y divide-slate-800">{list.length===0?<div className="p-4 text-xs text-slate-600">No active personnel assigned.</div>:list.map(o=><div key={o.id} className="flex flex-col gap-3 p-3 hover:bg-slate-800/50 sm:flex-row sm:items-center">{o.profile_photo_url?<img src={o.profile_photo_url} className="h-10 w-10 rounded-full object-cover"/>:<div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-black">{o.first_name?.[0]}{o.last_name?.[0]}</div>}<div className="min-w-0 flex-1"><div className="font-bold">{o.first_name} {o.last_name}</div><div className="text-xs text-slate-500">{o.division||'No division assigned'}</div></div>{o.unit_number&&<Badge className="w-fit bg-blue-950 text-blue-300 sm:ml-auto">Officer #{o.unit_number}</Badge>}</div>)}</div></section>})}</div>
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400"><Users className="mr-2 inline h-4 w-4"/>This page reflects active personnel records and updates as assignments change.</div>
  </div></div>;
}
