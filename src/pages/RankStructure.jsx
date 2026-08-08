import { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Shield, Users, GitBranch, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);
const rankIndex = rank => { const i=RANKS.indexOf(rank); return i < 0 ? 99 : i; };
const rolesOf = user => new Set((user?.additional_roles || []).map(r=>String(r).toLowerCase()));
const displayName = user => `${user?.rank || 'Officer'} ${user?.last_name || user?.first_name || user?.email || ''}`.trim();
const isOperational = user => {
  const roles=rolesOf(user);
  return !user?.termination_date && RANKS.includes(user?.rank) && roles.has('officer') && roles.has('cad_access');
};

function PersonCard({ person, users }) {
  const supervisor = users.find(u=>u.id===person.supervisor_id);
  const next = users.find(u=>u.id===person.next_level_supervisor_id);
  return <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
    <div className="flex items-center gap-3">
      {person.profile_photo_url ? <img src={person.profile_photo_url} alt="" className="h-10 w-10 rounded-full object-cover"/> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-black">{person.first_name?.[0]}{person.last_name?.[0]}</div>}
      <div className="min-w-0 flex-1"><div className="truncate font-bold text-white">{displayName(person)}</div><div className="text-xs text-slate-500">Unit {person.unit_number || '—'} · {person.division || 'No division'}</div></div>
      <Badge className="bg-blue-950 text-blue-300">{person.platoon === 'Command' ? 'Command' : `Platoon ${person.platoon || '—'}`}</Badge>
    </div>
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-900 p-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reports To</div><div className="mt-1 font-semibold text-slate-200">{supervisor ? displayName(supervisor) : person.supervisor_name || 'Not assigned'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Next Level</div><div className="mt-1 font-semibold text-slate-200">{next ? displayName(next) : person.next_level_supervisor_name || '—'}</div></div></div>
  </div>;
}

function PlatoonBranch({ letter, users, allUsers }) {
  const branch = users.filter(u=>u.platoon===letter).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999));
  const ranks = RANKS.filter(r=>!COMMAND_RANKS.has(r));
  return <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
    <div className="border-b border-slate-700 bg-gradient-to-r from-blue-950/70 to-slate-950 p-4"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-blue-400"/><h2 className="text-xl font-black">PLATOON {letter}</h2><Badge variant="outline" className="ml-auto border-blue-700 text-blue-300">{branch.length} PERSONNEL</Badge></div></div>
    <div className="space-y-4 p-4">{ranks.map(rank=>{const people=branch.filter(u=>u.rank===rank);if(!people.length)return null;return <div key={rank}><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><ArrowDown className="h-3.5 w-3.5"/>{rank}</div><div className="space-y-2">{people.map(person=><PersonCard key={person.id} person={person} users={allUsers}/>)}</div></div>})}{branch.length===0&&<div className="py-10 text-center text-sm text-slate-600">No personnel assigned to Platoon {letter}.</div>}</div>
  </section>;
}

export default function RankStructure(){
  const {data:user}=useQuery({queryKey:['currentUser'],queryFn:()=>base44.auth.me()});
  const {data:users=[]}=useQuery({queryKey:['allUsersRank'],queryFn:()=>base44.entities.User.list()});
  const roles=rolesOf(user);
  const allowed=user?.role==='admin'||roles.has('officer')||roles.has('cad_access')||roles.has('supervisor')||roles.has('full_access');
  const active=useMemo(()=>users.filter(isOperational).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999)),[users]);
  const command=active.filter(u=>COMMAND_RANKS.has(u.rank));
  if(!allowed) return <div className="p-8 text-center"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><h2 className="text-xl font-bold">Access Required</h2></div>;
  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><Shield className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black tracking-wide">RANK STRUCTURE & CHAIN OF COMMAND</h1><p className="text-sm text-slate-400">Shared command oversees both platoons. Each branch displays the assigned reporting chain.</p></div></div></div>

    <section className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4"><div className="mb-4 text-center"><div className="text-xs font-black uppercase tracking-[.25em] text-amber-300">Shared Command</div><div className="mt-1 text-sm text-slate-400">Colonel · Lt Colonel · Major — oversight of Platoon A and Platoon B</div></div><div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-3">{command.map(person=><PersonCard key={person.id} person={{...person,platoon:'Command'}} users={active}/>)}</div>{!command.length&&<div className="text-center text-sm text-slate-600">No shared-command personnel assigned.</div>}</section>

    <div className="relative py-3"><div className="mx-auto h-8 w-px bg-amber-500/50"/><div className="mx-auto h-px w-1/2 bg-amber-500/40"/><div className="grid grid-cols-2"><div className="mx-auto h-7 w-px bg-amber-500/40"/><div className="mx-auto h-7 w-px bg-amber-500/40"/></div></div>

    <div className="grid gap-5 xl:grid-cols-2"><PlatoonBranch letter="A" users={active} allUsers={active}/><PlatoonBranch letter="B" users={active} allUsers={active}/></div>
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400"><Users className="mr-2 inline h-4 w-4"/>The reporting chain is maintained from Admin → Platoon & Chain Assignments. Colonel, Lt Colonel, and Major remain above both platoons rather than belonging to only one branch.</div>
  </div></div>;
}
