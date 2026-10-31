import { useAvailabilityClock } from '@/hooks/useAvailabilityClock';
import { isOutOfOffice } from '@/utils/outOfOffice';
import { comparePersonnel } from '@/utils/rankPolicy';
import { withinPersonnelOversightScope, orgPathLabel } from '@/lib/orgStructure';
import PersonnelPrintRoster from '@/components/PersonnelPrintRoster';
import CommandRankTiers from '@/components/CommandRankTiers';
import { reportingLabel, reportingSupervisors, oversightLabel, assignmentLabel, actingCommandLabel } from '@/utils/commandReporting';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield, GitBranch, Mail, Phone, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';

const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);
const rolesOf = user => new Set((user?.additional_roles || []).map(r=>String(r).toLowerCase()));
const displayName = user => `${user?.rank || 'Officer'} ${user?.last_name || user?.first_name || user?.email || ''}`.trim();
const isOperational = user => isOperationalOfficer(user) && RANKS.includes(user?.rank);
const isColonelHiers = person => String(person?.id || '') === '6a72bbee2842d6338cbae513' || (
  String(person?.rank || '').toLowerCase() === 'colonel' &&
  String(person?.first_name || '').toLowerCase() === 'kavon' &&
  String(person?.last_name || '').toLowerCase() === 'hiers'
);
const contactEmail = person => {
  if (isColonelHiers(person)) {
    const blackPoint = [
      person?.outlook_email,
      person?.microsoft_email,
      ...(Array.isArray(person?.email_aliases) ? person.email_aliases : []),
    ].find(value => String(value || '').toLowerCase().endsWith('@blackpointkjc.com'));
    return String(blackPoint || 'khiers@blackpointkjc.com').toLowerCase();
  }
  return String(person?.work_email || person?.email || '').toLowerCase();
};
const composeUrl = person => `${createPageUrl('OutlookMail')}?compose=1&to=${encodeURIComponent(contactEmail(person))}`;

function PersonCard({ person, users, onOpen, compact = false }) {
  const supervisorText = reportingLabel(person, users, displayName);
  return <button type="button" onClick={()=>onOpen?.(person)} className={`w-full rounded-xl border border-slate-700 bg-slate-950/95 text-left shadow-lg shadow-black/20 transition hover:border-blue-500/70 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${compact ? 'max-w-[310px] p-3' : 'max-w-[360px] p-4'}`}>
    <div className="flex items-start gap-3">
      {person.profile_photo_url ? <img src={person.profile_photo_url} alt="" className={`${compact?'h-12 w-12':'h-14 w-14'} shrink-0 rounded-full border border-slate-700 object-cover`}/> : <div className={`flex ${compact?'h-12 w-12':'h-14 w-14'} shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-black`}>{person.first_name?.[0]}{person.last_name?.[0]}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><div className="break-words text-base font-black leading-5 text-white">{displayName(person)}</div>{isOutOfOffice(person) && <div className="mt-1 text-xs text-amber-300">Out of office · returns {new Date(person.out_of_office_return).toLocaleString()}</div>}<div className="mt-1 text-xs text-slate-400">Unit {person.unit_number || '—'} · {orgPathLabel(person) || 'Organization unassigned'}</div></div>
          <Badge className="shrink-0 bg-blue-950 text-blue-300">{assignmentLabel(person, users)}</Badge>{actingCommandLabel(person,users)&&<div className="mt-1 text-xs text-cyan-300">{actingCommandLabel(person,users)}</div>}
        </div>
      </div>
    </div>
    {person.rank==='Major' && <div className="mt-2 text-xs font-semibold text-amber-300">{oversightLabel(person)}</div>}
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Supervisor</div><div className="mt-1 text-xs font-semibold text-slate-200">{supervisorText}</div></div>
    {!compact && <div className="mt-2 grid min-w-0 gap-2 text-xs"><div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-500">Email</div><div className="mt-1 whitespace-normal text-xs leading-5 text-slate-300" style={{overflowWrap:"anywhere"}}>{contactEmail(person) || '—'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-500">Mobile</div><div className="mt-1 text-slate-300">{person.mobile_phone || '—'}</div></div></div>}
  </button>;
}

function OfficerDialog({ person, users, open, onOpenChange, onPhotoOpen }) {
  if(!person) return null;
  const directReports=users.filter(u=>reportingSupervisors(u, users).some(s=>s.id===person.id));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Personnel Information</DialogTitle></DialogHeader><div className="space-y-4"><div className="flex items-center gap-4">{person.profile_photo_url?<button type="button" aria-label="Enlarge full officer photograph" onClick={()=>onPhotoOpen(person)}><img src={person.profile_photo_url} alt="" className="h-20 w-20 rounded-full object-cover"/></button>:<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-xl font-black">{person.first_name?.[0]}{person.last_name?.[0]}</div>}<div><div className="text-xl font-black">{displayName(person)}</div>{isOutOfOffice(person) && <div className="mt-1 text-xs text-amber-300">Out of office · returns {new Date(person.out_of_office_return).toLocaleString()}</div>}<div className="text-sm text-slate-400">Unit {person.unit_number||'—'} · {orgPathLabel(person) || 'Organization unassigned'}</div><Badge className="mt-2 bg-blue-950 text-blue-300">{assignmentLabel(person, users)}</Badge>{actingCommandLabel(person,users)&&<div className="mt-1 text-xs text-cyan-300">{actingCommandLabel(person,users)}</div>}{person.rank==='Major' && <div className="mt-2 text-sm text-amber-300">{oversightLabel(person)}</div>}</div></div><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Email</div><div className="mt-1 break-all text-sm">{contactEmail(person)||'—'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Mobile</div><div className="mt-1 text-sm">{person.mobile_phone||'—'}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Reports To</div><div className="mt-1 text-sm font-semibold">{reportingLabel(person, users, displayName)}</div></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Direct Reports</div><div className="mt-1 text-sm font-semibold">{directReports.length?directReports.map(displayName).join(', '):'None'}</div></div></div><div className="flex flex-wrap gap-2">{contactEmail(person)&&<Link to={composeUrl(person)} className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"><Mail className="mr-2 h-4 w-4"/>Email in Pathfinder</Link>}{person.mobile_phone&&<a href={`tel:${person.mobile_phone}`} className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900"><Phone className="mr-2 h-4 w-4"/>Call</a>}</div></div></DialogContent></Dialog>;
}

function OrgTreeNode({ person, branch, allUsers, onOpen }) {
  const children = branch.filter(user => reportingSupervisors(user, allUsers).some(parent => parent.id === person.id)).sort(comparePersonnel);
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

function CommandTree({ users, allUsers, onOpen }) {
  return <CommandRankTiers users={users} renderPerson={person=><PersonCard person={person} users={allUsers} onOpen={onOpen}/>}/>;
}

function AreaMember({ person, onOpen }) {
  const label = [person.rank, person.last_name || person.first_name].filter(Boolean).join(' ');
  return <button type="button" onClick={() => onOpen(person)} className="flex w-full items-center gap-3 rounded-xl border border-slate-700/80 bg-[#091625] px-3 py-2.5 text-left text-slate-100 transition hover:border-cyan-500/70 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
    {person.profile_photo_url ? <img alt="" src={person.profile_photo_url} className="h-10 w-10 shrink-0 rounded-full border border-slate-600 object-cover"/> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-black">{person.first_name?.[0]}{person.last_name?.[0]}</div>}
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{label || person.full_name || 'Officer'}</div><div className="mt-0.5 text-xs text-slate-400">Unit {person.unit_number || '—'}{person.platoon ? ` · Platoon ${person.platoon}` : ''}</div></div>
    <span className="shrink-0 text-xs text-cyan-300">View</span>
  </button>;
}

function PlatoonBranch({ letter, users, onOpen }) {
  const members = users.filter(person => !COMMAND_RANKS.has(person.rank) && (letter === 'Unassigned' ? !['A','B'].includes(person.platoon) : person.platoon === letter)).sort(comparePersonnel);
  const regions = new Map();
  for (const person of members) {
    const regionName = person.division || 'Region not assigned';
    const divisionName = person.subdivision || 'Operating division not assigned';
    const stationName = person.substation || '';
    if (!regions.has(regionName)) regions.set(regionName, new Map());
    const divisions = regions.get(regionName);
    if (!divisions.has(divisionName)) divisions.set(divisionName, { leadership: [], substations: new Map() });
    const division = divisions.get(divisionName);
    if (!stationName) division.leadership.push(person);
    else {
      if (!division.substations.has(stationName)) division.substations.set(stationName, []);
      division.substations.get(stationName).push(person);
    }
  }
  const sorted = entries => [...entries].sort(([a],[b])=>a.localeCompare(b));
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-[#29445f] bg-[#0b1725]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#29445f] bg-gradient-to-r from-[#0b3255] to-[#0a1828] px-4 py-4"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-cyan-300"/><h2 className="text-lg font-black tracking-wide text-white">{letter === 'Unassigned' ? 'Unassigned Platoon' : `PLATOON ${letter}`}</h2></div><span className="rounded-full border border-cyan-800 bg-cyan-950/50 px-3 py-1 text-xs font-bold text-cyan-200">{members.length} personnel</span></div>
    <div className="space-y-3 p-3 sm:p-4">
      {!members.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">No personnel assigned.</p>}
      {sorted(regions).map(([regionName, divisions]) => <details key={regionName} open className="group min-w-0 rounded-xl border border-slate-700 bg-slate-900/55">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-black text-white"><span>REGION · {regionName}</span><span className="text-xs font-semibold text-slate-400">{[...divisions.values()].reduce((sum,division)=>sum+division.leadership.length+[...division.substations.values()].reduce((count,list)=>count+list.length,0),0)} personnel</span></summary>
        <div className="space-y-3 border-t border-slate-700 p-3">{sorted(divisions).map(([divisionName, groups]) => <details key={divisionName} open className="rounded-xl border border-slate-700 bg-[#07111f]/90">
          <summary className="cursor-pointer border-b border-slate-700 px-4 py-3 text-sm font-black text-cyan-200">DIVISION · {divisionName}</summary>
          <div className="space-y-4 p-3">
            {!!groups.leadership.length && <div><h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">Division & Platoon Leadership</h4><div className="grid gap-2 sm:grid-cols-2">{groups.leadership.sort(comparePersonnel).map(person=><AreaMember key={person.id} person={person} onOpen={onOpen}/>)}</div></div>}
            {sorted(groups.substations).map(([stationName, personnel]) => <div key={stationName} className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3"><h4 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-300"><span>SUBSTATION · {stationName}</span><span>{personnel.length}</span></h4><div className="grid gap-2 sm:grid-cols-2">{personnel.sort(comparePersonnel).map(person=><AreaMember key={person.id} person={person} onOpen={onOpen}/>)}</div></div>)}
          </div>
        </details>)}</div>
      </details>)}
    </div>
  </section>;
}

export default function RankStructure(){
  const [selectedPerson,setSelectedPerson]=useState(null);
  const [photoPerson,setPhotoPerson]=useState(null);
  const { user } = useAuth();
  const {data:users=[]}=useQuery({queryKey:['allUsersRank'],queryFn:()=>listDirectoryUsers('last_name',1000),staleTime:10*60*1000,refetchOnWindowFocus:false,placeholderData:previous=>previous});
  const roles=rolesOf(user);
  const allowed=hasSupervisorAccess(user)||roles.has('officer')||roles.has('cad_access');
  const availabilityTick=useAvailabilityClock();
  const active=useMemo(()=>users.filter(person=>isOperational(person)&&!isOutOfOffice(person) && (!hasSupervisorAccess(user) || withinPersonnelOversightScope(user, person))).sort(comparePersonnel),[users,user?.id,user?.division,user?.subdivision,user?.substation,user?.rank,availabilityTick]);

  if(!allowed) return <div className="p-8 text-center"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><h2 className="text-xl font-bold">Access Required</h2></div>;
  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <PersonnelPrintRoster users={active} contactEmail={contactEmail}/>
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><Shield className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black tracking-wide">RANK STRUCTURE & CHAIN OF COMMAND</h1><p className="text-sm text-slate-400">Command leadership above. Personnel are organized by Platoon → Region → Division → Substation, with division leadership shown separately.</p></div></div></div>

    {hasSupervisorAccess(user) && <div className="flex justify-end"><button type="button" onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-600"><Printer className="h-4 w-4"/>Print Personnel / Command Roster</button></div>}
    <section className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4"><div className="mb-4 text-center"><div className="text-xs font-black uppercase tracking-[.25em] text-amber-300">Shared Command</div><div className="mt-1 text-sm text-slate-400">Colonel → Lt Colonels → Majors. Majors share reporting to both Lt Colonels and oversee an assigned platoon.</div></div><CommandTree users={active} allUsers={active} onOpen={setSelectedPerson}/></section>

    <div className="relative py-3"><div className="mx-auto h-8 w-px bg-amber-500/50"/><div className="mx-auto h-px w-1/2 bg-amber-500/40"/><div className="grid grid-cols-2"><div className="mx-auto h-7 w-px bg-amber-500/40"/><div className="mx-auto h-7 w-px bg-amber-500/40"/></div></div>

    <div className="grid items-start gap-5 xl:grid-cols-2"><PlatoonBranch letter="A" users={active} onOpen={setSelectedPerson}/><PlatoonBranch letter="B" users={active} onOpen={setSelectedPerson}/></div>
    {active.some(person => !COMMAND_RANKS.has(person.rank) && !['A','B'].includes(person.platoon)) && <PlatoonBranch letter="Unassigned" users={active} onOpen={setSelectedPerson}/>}
    <OfficerDialog person={selectedPerson} users={active} open={!!selectedPerson} onPhotoOpen={person=>setPhotoPerson(person)} onOpenChange={open=>{if(!open)setSelectedPerson(null)}}/>
    <Dialog open={!!photoPerson} onOpenChange={open=>{if(!open)setPhotoPerson(null)}}><DialogContent className="max-w-4xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Full photo — {photoPerson ? displayName(photoPerson) : "Officer"}</DialogTitle></DialogHeader>{photoPerson?.profile_photo_url && <img src={photoPerson.profile_photo_url} alt="Full original officer photograph" className="max-h-[78vh] w-full object-contain" />}</DialogContent></Dialog>
  </div></div>;
}
