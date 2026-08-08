import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Shield, GitBranch, Mail, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);
const rankIndex = rank => { const i=RANKS.indexOf(rank); return i < 0 ? 99 : i; };
const rolesOf = user => new Set((user?.additional_roles || []).map(r=>String(r).toLowerCase()));
const displayName = user => `${user?.rank || 'Officer'} ${user?.last_name || user?.first_name || user?.email || ''}`.trim();
const isOperational = user => {
  const roles=rolesOf(user);
  return !user?.termination_date && RANKS.includes(user?.rank) && roles.has('officer') && roles.has('cad_access');
};

function PersonCard({ person, users, onOpen, compact = false }) {
  const supervisor = users.find(u=>u.id===person.supervisor_id);
  const supervisorText = supervisor ? displayName(supervisor) : person.rank === 'Colonel' ? 'Top of Command' : 'Awaiting assignment';
  return <button type="button" onClick={()=>onOpen?.(person)} className={`w-full rounded-xl border border-slate-700 bg-slate-950/95 text-left shadow-lg shadow-black/20 transition hover:border-blue-500/70 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${compact ? 'max-w-[310px] p-3' : 'max-w-[360px] p-4'}`}>
    <div className="flex items-start gap-3">
      {person.profile_photo_url ? <img src={person.profile_photo_url} alt="" className={`${compact?'h-12 w-12':'h-14 w-14'} shrink-0 rounded-full border border-slate-700 object-cover`}/> : <div className={`flex ${compact?'h-12 w-12':'h-14 w-14'} shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-black`}>{person.first_name?.[0]}{person.last_name?.[0]}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="break-words text-base font-black leading-5 text-white">{displayName(person)}</div><div className="mt-1 text-xs text-slate-400">Unit {person.unit_number || '—'} · {person.division || 'No division'}</div></div>
          <Badge className="shrink-0 bg-blue-950 text-blue-300">{person.platoon === 'Command' ? 'Command' : `Platoon ${person.platoon || '—'}`}</Badge>
        </div>
      </div>
    </div>
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Supervisor</div><div className="mt-1 text-xs font-semibold text-slate-200">{supervisorText}</div></div>
    {!compact && <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-500">Email</div><div className="mt-1 break-all leading-5 text-slate-300">{person.email || '—'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-500">Mobile</div><div className="mt-1 text-slate-300">{person.mobile_phone || '—'}</div></div></div>}
  </button>;
}

function OfficerDialog({ person, users, open, onOpenChange }) {
  if(!person) return null;
  const supervisor=users.find(u=>u.id===person.supervisor_id);
  const directReports=users.filter(u=>u.supervisor_id===person.id);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Personnel Information</DialogTitle></DialogHeader><div className="space-y-4"><div className="flex items-center gap-4">{person.profile_photo_url?<img src={person.profile_photo_url} alt="" className="h-20 w-20 rounded-full object-cover"/>:<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-xl font-black">{person.first_name?.[0]}{person.last_name?.[0]}</div>}<div><div className="text-xl font-black">{displayName(person)}</div><div className="text-sm text-slate-400">Unit {person.unit_number||'—'} · {person.division||'No division'}</div><Badge className="mt-2 bg-blue-950 text-blue-300">{COMMAND_RANKS.has(person.rank)?'Shared Command':`Platoon ${person.platoon||'—'}`}</Badge></div></div><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Email</div><div className="mt-1 break-all text-sm">{person.email||'—'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Mobile</div><div className="mt-1 text-sm">{person.mobile_phone||'—'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Reports To</div><div className="mt-1 text-sm font-semibold">{supervisor?displayName(supervisor):(person.rank==='Colonel'?'Top of Command':'Awaiting assignment')}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Direct Reports</div><div className="mt-1 text-sm font-semibold">{directReports.length?directReports.map(displayName).join(', '):'None'}</div></div></div><div className="flex flex-wrap gap-2">{person.email&&<a href={`mailto:${person.email}`} className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"><Mail className="mr-2 h-4 w-4"/>Email</a>}{person.mobile_phone&&<a href={`tel:${person.mobile_phone}`} className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"><Phone className="mr-2 h-4 w-4"/>Call</a>}</div></div></DialogContent></Dialog>;
}

function OrgTreeNode({ person, branch, allUsers, onOpen }) {
  const children = branch.filter(user => user.supervisor_id === person.id).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999));
  return <div className="flex min-w-max flex-col items-center">
    <PersonCard person={person} users={allUsers} onOpen={onOpen}/>
    {children.length > 0 && <>
      <div className="h-7 w-px bg-slate-600"/>
      <div className="relative flex items-start justify-center gap-5 px-4">
        {children.length > 1 && <div className="absolute left-[calc(50%/var(--count))] right-[calc(50%/var(--count))] top-0 h-px bg-slate-600" style={{'--count':children.length}}/>}
        {children.map(child=><div key={child.id} className="flex flex-col items-center"><div className="h-7 w-px bg-slate-600"/><OrgTreeNode person={child} branch={branch} allUsers={allUsers} onOpen={onOpen}/></div>)}
      </div>
    </>}
  </div>;
}

function CommandTree({ users, onOpen }) {
  const command = users.filter(u=>COMMAND_RANKS.has(u.rank));
  const commandIds = new Set(command.map(u=>u.id));
  const roots = command.filter(u=>!u.supervisor_id || !commandIds.has(u.supervisor_id)).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank));
  return <div className="overflow-x-auto pb-2"><div className="mx-auto flex min-w-max justify-center px-6">{roots.map(root=><OrgTreeNode key={root.id} person={{...root,platoon:'Command'}} branch={command.map(u=>({...u,platoon:'Command'}))} allUsers={users} onOpen={onOpen}/>)}</div></div>;
}

function PlatoonBranch({ letter, users, allUsers, onOpen }) {
  const branch = users.filter(u=>u.platoon===letter).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999));
  const branchIds = new Set(branch.map(user=>user.id));
  const roots = branch.filter(user => !user.supervisor_id || !branchIds.has(user.supervisor_id));
  return <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80">
    <div className="border-b border-slate-700 bg-gradient-to-r from-blue-950/70 to-slate-950 p-4"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-blue-400"/><h2 className="text-xl font-black">PLATOON {letter}</h2><Badge variant="outline" className="ml-auto border-blue-700 text-blue-300">{branch.length} PERSONNEL</Badge></div></div>
    <div className="min-h-44 overflow-x-auto p-5">{branch.length ? <div className="flex min-w-max justify-center gap-10">{roots.map(person=><OrgTreeNode key={person.id} person={person} branch={branch} allUsers={allUsers} onOpen={onOpen}/>)}</div> : <div className="py-12 text-center text-sm text-slate-600">No personnel assigned to Platoon {letter}.</div>}</div>
  </section>;
}

export default function RankStructure(){
  const [selectedPerson,setSelectedPerson]=useState(null);
  const {data:user}=useQuery({queryKey:['currentUser'],queryFn:()=>base44.auth.me()});
  const {data:users=[]}=useQuery({queryKey:['allUsersRank'],queryFn:()=>base44.entities.User.list()});
  const roles=rolesOf(user);
  const allowed=user?.role==='admin'||roles.has('officer')||roles.has('cad_access')||roles.has('supervisor')||roles.has('full_access');
  const active=useMemo(()=>users.filter(isOperational).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999)),[users]);

  if(!allowed) return <div className="p-8 text-center"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><h2 className="text-xl font-bold">Access Required</h2></div>;
  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><Shield className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black tracking-wide">RANK STRUCTURE & CHAIN OF COMMAND</h1><p className="text-sm text-slate-400">Shared command oversees both platoons. Each branch displays the assigned reporting chain.</p></div></div></div>

    <section className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4"><div className="mb-4 text-center"><div className="text-xs font-black uppercase tracking-[.25em] text-amber-300">Shared Command</div><div className="mt-1 text-sm text-slate-400">Colonel · Lt Colonel · Major — oversight of Platoon A and Platoon B</div></div><CommandTree users={active} onOpen={setSelectedPerson}/></section>

    <div className="relative py-3"><div className="mx-auto h-8 w-px bg-amber-500/50"/><div className="mx-auto h-px w-1/2 bg-amber-500/40"/><div className="grid grid-cols-2"><div className="mx-auto h-7 w-px bg-amber-500/40"/><div className="mx-auto h-7 w-px bg-amber-500/40"/></div></div>

    <div className="grid gap-5 xl:grid-cols-2"><PlatoonBranch letter="A" users={active} allUsers={active} onOpen={setSelectedPerson}/><PlatoonBranch letter="B" users={active} allUsers={active} onOpen={setSelectedPerson}/></div>
    <OfficerDialog person={selectedPerson} users={active} open={!!selectedPerson} onOpenChange={open=>{if(!open)setSelectedPerson(null)}}/>
  </div></div>;
}
