import { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Shield, GitBranch } from 'lucide-react';
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
  return <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
    <div className="flex items-start gap-3">
      {person.profile_photo_url ? <img src={person.profile_photo_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover"/> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-black">{person.first_name?.[0]}{person.last_name?.[0]}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="break-words text-base font-black leading-5 text-white sm:text-lg">{displayName(person)}</div>
            <div className="mt-1 break-words text-xs leading-4 text-slate-400">Unit {person.unit_number || '—'} · {person.division || 'No division'}</div>
          </div>
          <Badge className="w-fit shrink-0 bg-blue-950 text-blue-300">{person.platoon === 'Command' ? 'Command' : `Platoon ${person.platoon || '—'}`}</Badge>
        </div>
      </div>
    </div>
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-900 p-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reports To</div><div className="mt-1 font-semibold text-slate-200">{supervisor ? displayName(supervisor) : person.supervisor_name || 'Top of Command'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reports To Rank</div><div className="mt-1 font-semibold leading-5 text-slate-200">{supervisor?.rank || (person.rank === 'Colonel' ? 'Top of Command' : 'Not assigned')}</div></div></div>
  </div>;
}

function TreeNode({ person, branch, allUsers, depth = 0 }) {
  const children = branch.filter(user => user.supervisor_id === person.id).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999));
  return <div className={depth ? 'ml-4 border-l border-slate-700 pl-4 sm:ml-6 sm:pl-5' : ''}>
    <PersonCard person={person} users={allUsers}/>
    {children.length > 0 && <div className="mt-2 space-y-2">{children.map(child=><TreeNode key={child.id} person={child} branch={branch} allUsers={allUsers} depth={depth+1}/>)}</div>}
  </div>;
}

function PlatoonBranch({ letter, users, allUsers }) {
  const branch = users.filter(u=>u.platoon===letter).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999));
  const branchIds = new Set(branch.map(user=>user.id));
  const roots = branch.filter(user => !user.supervisor_id || !branchIds.has(user.supervisor_id));
  return <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
    <div className="border-b border-slate-700 bg-gradient-to-r from-blue-950/70 to-slate-950 p-4"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-blue-400"/><h2 className="text-xl font-black">PLATOON {letter}</h2><Badge variant="outline" className="ml-auto border-blue-700 text-blue-300">{branch.length} PERSONNEL</Badge></div></div>
    <div className="space-y-4 p-4">{roots.map(person=><TreeNode key={person.id} person={person} branch={branch} allUsers={allUsers}/>)}{branch.length===0&&<div className="py-10 text-center text-sm text-slate-600">No personnel assigned to Platoon {letter}.</div>}</div>
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
  </div></div>;
}
