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

// A focused chain-of-command board. Even with many states, only the chosen
// platoon + region + division + substation is expanded on screen at once.
function FocusedRankFlow({ users, viewer, onOpen }) {
  const roles = new Set([viewer?.role,...(viewer?.additional_roles||[])].map(value => String(value||'').toLowerCase()));
  const companyAccess = roles.has('admin') || roles.has('full_access');
  const fixedSubstation = !companyAccess && ['first sergeant','sergeant','corporal'].includes(String(viewer?.rank||'').toLowerCase());
  const [chosenPlatoon,setChosenPlatoon] = useState(() => viewer?.oversight_platoon || viewer?.platoon || 'A');
  const [chosenRegion,setChosenRegion] = useState(() => viewer?.division || '');
  const [chosenDivision,setChosenDivision] = useState(() => viewer?.subdivision || '');
  const [chosenStation,setChosenStation] = useState(() => viewer?.substation || '');
  const distinct = values => [...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
  const platoons = distinct(users.map(person => person.platoon)).filter(value => ['A','B'].includes(value));
  const platoon = companyAccess ? (platoons.includes(chosenPlatoon)?chosenPlatoon:platoons[0]||'A') : viewer?.oversight_platoon || viewer?.platoon || chosenPlatoon;
  const platoonPeople = users.filter(person => person.platoon === platoon);
  const regions=distinct(platoonPeople.map(person=>person.division));
  const region=regions.includes(chosenRegion)?chosenRegion:(regions.includes(viewer?.division)?viewer.division:regions[0]||'');
  const divisions=distinct(platoonPeople.filter(person=>person.division===region).map(person=>person.subdivision));
  const division=divisions.includes(chosenDivision)?chosenDivision:(divisions.includes(viewer?.subdivision)?viewer.subdivision:divisions[0]||'');
  const divisionPeople=platoonPeople.filter(person=>person.division===region&&person.subdivision===division);
  const substations=distinct(divisionPeople.map(person=>person.substation));
  const selectedStation = fixedSubstation ? viewer?.substation || '' : substations.includes(chosenStation)?chosenStation:(substations[0]||'');
  const divisionLeaders=divisionPeople.filter(person=>!person.substation).sort(comparePersonnel);
  const stationPeople=divisionPeople.filter(person=>person.substation===selectedStation).sort(comparePersonnel);
  const rankSections = [...new Map(stationPeople.map(person=>[person.rank,person.rank])).keys()].sort((a,b)=>RANKS.indexOf(a)-RANKS.indexOf(b));
  const control='h-10 w-full rounded-xl border border-slate-700 bg-[#0d1b2c] px-3 text-sm font-semibold text-white outline-none focus:border-cyan-500';
  return <section className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1625] shadow-2xl">
    <div className="border-b border-slate-700 bg-gradient-to-r from-[#122b40] via-[#101f32] to-[#0b1625] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Organization Navigator</div><h2 className="mt-1 text-xl font-black text-white">Chain of Command</h2></div><span className="rounded-full border border-cyan-800 bg-cyan-950/40 px-3 py-1 text-xs font-bold text-cyan-200">{stationPeople.length} assigned personnel</span></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 text-xs font-bold text-slate-300">Platoon<select className={`mt-1 ${control}`} value={platoon} disabled={!companyAccess} onChange={event=>{setChosenPlatoon(event.target.value);setChosenRegion('');setChosenDivision('');setChosenStation('');}}>{(platoons.length?platoons:[platoon]).map(name=><option key={name} value={name}>Platoon {name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-slate-300">Region / State<select className={`mt-1 ${control}`} value={region} disabled={!companyAccess} onChange={event=>{setChosenRegion(event.target.value);setChosenDivision('');setChosenStation('');}}>{regions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-slate-300">Division<select className={`mt-1 ${control}`} value={division} disabled={!companyAccess} onChange={event=>{setChosenDivision(event.target.value);setChosenStation('');}}>{divisions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-slate-300">Substation<select className={`mt-1 ${control}`} value={selectedStation} disabled={fixedSubstation} onChange={event=>setChosenStation(event.target.value)}>{!substations.length&&<option value="">No assigned substation</option>}{substations.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      </div>
    </div>
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mx-auto max-w-lg rounded-2xl border border-cyan-700/40 bg-[#12283e] px-4 py-4 text-center"><div className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Operating Command</div><div className="mt-1 text-lg font-black text-white">Platoon {platoon}</div><div className="mt-1 text-xs text-slate-400">{region||'Unassigned region'} · {division||'Unassigned division'}</div></div>
      <div className="mx-auto h-7 w-px bg-cyan-700"/>
      {divisionLeaders.length>0&&<div className="rounded-2xl border border-amber-600/25 bg-[#131d2b] p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-black text-amber-200">Division Leadership</h3><span className="text-xs text-slate-400">{divisionLeaders.length}</span></div><div className="grid gap-2 sm:grid-cols-2">{divisionLeaders.map(person=><AreaMember key={person.id} person={person} onOpen={onOpen}/>)}</div></div>}
      {divisionLeaders.length>0&&<div className="mx-auto h-7 w-px bg-cyan-700"/>}
      <div className="rounded-2xl border border-emerald-700/35 bg-[#0c2030] p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Assigned Substation</div><h3 className="mt-1 text-lg font-black text-white">{selectedStation||'No substation assigned'}</h3></div><span className="text-xs font-semibold text-slate-400">{stationPeople.length} personnel</span></div>
        {!stationPeople.length?<p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No lower-ranking personnel assigned to this substation.</p>:
        <div className="space-y-4">{rankSections.map(rank=><div key={rank}><div className="mb-2 flex items-center gap-2"><span className="rounded-md bg-cyan-900/40 px-2 py-1 text-[10px] font-black uppercase text-cyan-200">{rank}</span><div className="h-px flex-1 bg-slate-700"/></div><div className="grid gap-2 sm:grid-cols-2">{stationPeople.filter(person=>person.rank===rank).map(person=><AreaMember key={person.id} person={person} onOpen={onOpen}/>)}</div></div>)}</div>}
      </div>
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
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><Shield className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black tracking-wide">RANK STRUCTURE & CHAIN OF COMMAND</h1><p className="text-sm text-slate-400">Select a platoon and operating area to view one clear command chain. Additional states and substations stay organized in the navigator instead of repeating across the page.</p></div></div></div>

    {hasSupervisorAccess(user) && <div className="flex justify-end"><button type="button" onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-600"><Printer className="h-4 w-4"/>Print Personnel / Command Roster</button></div>}
    {['admin','full_access'].some(role => role===user?.role||roles.has(role)) && <details className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4"><summary className="cursor-pointer text-sm font-black text-amber-200">Company Command Leadership</summary><div className="mt-4"><CommandTree users={active} allUsers={active} onOpen={setSelectedPerson}/></div></details>}
    <FocusedRankFlow users={active} viewer={user} onOpen={setSelectedPerson}/>
    <OfficerDialog person={selectedPerson} users={active} open={!!selectedPerson} onPhotoOpen={person=>setPhotoPerson(person)} onOpenChange={open=>{if(!open)setSelectedPerson(null)}}/>
    <Dialog open={!!photoPerson} onOpenChange={open=>{if(!open)setPhotoPerson(null)}}><DialogContent className="max-w-4xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Full photo — {photoPerson ? displayName(photoPerson) : "Officer"}</DialogTitle></DialogHeader>{photoPerson?.profile_photo_url && <img src={photoPerson.profile_photo_url} alt="Full original officer photograph" className="max-h-[78vh] w-full object-contain" />}</DialogContent></Dialog>
  </div></div>;
}
