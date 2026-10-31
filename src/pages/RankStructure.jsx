import { useAvailabilityClock } from '@/hooks/useAvailabilityClock';
import { isOutOfOffice } from '@/utils/outOfOffice';
import { comparePersonnel } from '@/utils/rankPolicy';
import { withinPersonnelOversightScope, orgPathLabel, officerOrgContext } from '@/lib/orgStructure';
import PersonnelPrintRoster from '@/components/PersonnelPrintRoster';
import CommandRankTiers from '@/components/CommandRankTiers';
import { reportingLabel, reportingSupervisors, oversightLabel, assignmentLabel, actingCommandLabel, platoonCommander, majorPlatoon } from '@/utils/commandReporting';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield, GitBranch, Mail, Phone, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { listDirectoryUsers, listDirectoryLocations } from '@/lib/appDirectory';
import { base44 } from '@/api/base44Client';
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
function FocusedRankFlow({ users, viewer, commands = [], onOpen }) {
  const roles = new Set([viewer?.role,...(viewer?.additional_roles||[])].map(value=>String(value||'').toLowerCase()));
  const companyAccess = roles.has('admin') || roles.has('full_access');
  const viewerSenior = ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant'].includes(String(viewer?.rank||'').toLowerCase());
  const [chosenPlatoon,setChosenPlatoon]=useState(()=>viewer?.oversight_platoon||viewer?.platoon||'A');
  const [chosenRegion,setChosenRegion]=useState(()=>viewer?.division||'');
  const [chosenDivision,setChosenDivision]=useState(()=>viewer?.subdivision||'');
  const distinct=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
  const platoons=distinct([...users.map(person=>person.platoon||'Unassigned'),...commands.map(command=>command.platoon)]).filter(name=>['A','B','Unassigned'].includes(name));
  const fixedPlatoon=viewer?.oversight_platoon||viewer?.platoon||'';
  const platoon=companyAccess?(platoons.includes(chosenPlatoon)?chosenPlatoon:platoons[0]||'A'):fixedPlatoon;
  const platoonPeople=users.filter(person=>(person.platoon||'Unassigned')===platoon);
  const regions=distinct([...platoonPeople.map(person=>person.division||'Region not assigned'),...(!companyAccess&&viewer?.division?[viewer.division]:[])]);
  const region=companyAccess?(regions.includes(chosenRegion)?chosenRegion:regions[0]||''):viewer?.division||'';
  const divisions=distinct([...platoonPeople.filter(person=>(person.division||'Region not assigned')===region).map(person=>person.subdivision||'Division not assigned'),...(!companyAccess&&viewer?.subdivision?[viewer.subdivision]:[])]);
  const division=companyAccess?(divisions.includes(chosenDivision)?chosenDivision:divisions[0]||''):viewer?.subdivision||'';
  const divisionPeople=platoonPeople.filter(person=>(person.division||'Region not assigned')===region&&(person.subdivision||'Division not assigned')===division);
  const substations=distinct([...divisionPeople.map(person=>person.substation||'Not assigned to a substation'),...(!companyAccess&&!viewerSenior&&viewer?.substation?[viewer.substation]:[])]);
  const visibleStations=companyAccess||viewerSenior?substations:substations.filter(name=>name===viewer?.substation);
  const leadership=divisionPeople.filter(person=>!person.substation).sort(comparePersonnel);
  const commander=commands.find(entry=>entry.platoon===platoon)||null;
  const fieldControl='mt-1 h-10 w-full rounded-lg border border-slate-700 bg-[#071726] px-3 text-sm font-semibold text-white outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-80';
  return <section className="overflow-hidden rounded-3xl border border-[#2a4459] bg-[#081625] shadow-2xl shadow-black/30">
    <div className="border-b border-slate-700/70 bg-gradient-to-r from-[#112d44] via-[#0c2237] to-[#081625] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-400">Operational command chart</div><h2 className="mt-1 text-xl font-black text-white">Platoon Leadership & Substations</h2></div><span className="rounded-lg border border-cyan-900/70 bg-cyan-950/30 px-3 py-1.5 text-xs font-bold text-cyan-200">Platoon {platoon||'Unassigned'}</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="min-w-0 text-xs font-bold text-slate-300">Platoon<select aria-label="Select platoon" className={fieldControl} disabled={!companyAccess} value={platoon} onChange={e=>{setChosenPlatoon(e.target.value);setChosenRegion('');setChosenDivision('');}}>{(platoons.length?platoons:[platoon||'']).map(name=><option key={name} value={name}>Platoon {name||'Unassigned'}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-slate-300">Region / State<select aria-label="Select region" className={fieldControl} disabled={!companyAccess} value={region} onChange={e=>{setChosenRegion(e.target.value);setChosenDivision('');}}>{!regions.length&&<option value="">Unassigned region</option>}{regions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-slate-300">Division<select aria-label="Select division" className={fieldControl} disabled={!companyAccess} value={division} onChange={e=>setChosenDivision(e.target.value)}>{!divisions.length&&<option value="">Unassigned division</option>}{divisions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      </div>
    </div>
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-b from-[#3b2b16] to-[#161f2c] shadow-lg shadow-amber-950/20" data-platoon-command={platoon}>
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 px-4 py-2.5"><span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-200"><Shield className="h-4 w-4"/>Active Platoon Command</span><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${commander?.status==='active'?'border-emerald-600/50 bg-emerald-950/30 text-emerald-300':'border-amber-500/30 bg-amber-950/40 text-amber-200'}`}>{commander?.status==='active'?'COMMAND ASSIGNED':commander?.status==='acting'?'ACTING COMMAND':'UNASSIGNED'}</span></div>
        <div className="px-5 py-5 text-center"><div className="text-2xl font-black leading-tight text-white">{commander?.name||'No active commander assigned'}</div><div className="mt-1 text-sm font-semibold text-amber-200">{commander?.role||'Platoon Command Vacant'}{commander?.unit_number?` · Unit ${commander.unit_number}`:''}</div><div className="mt-2 text-xs text-slate-400">Direct command oversight for Platoon {platoon||'—'}</div></div>
      </div>
      <div className="mx-auto h-7 w-px bg-amber-500/60"/>
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-600 bg-[#10283b] px-4 py-3 text-center"><div className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Operating Division</div><div className="mt-1 text-base font-bold text-white">{division||'Division unassigned'}</div><div className="mt-0.5 text-xs text-slate-400">{region||'Region not assigned'} · Platoon {platoon||'—'}</div></div>
      {!!leadership.length&&<><div className="mx-auto h-5 w-px bg-slate-600"/><div className="mx-auto max-w-3xl rounded-xl border border-slate-700 bg-[#101e30] p-3"><h3 className="mb-2 text-center text-xs font-black uppercase tracking-wider text-cyan-200">Division Leadership · Subordinate Ranks</h3><div className="grid gap-2 sm:grid-cols-2">{leadership.map(person=><AreaMember key={person.id} person={person} onOpen={onOpen}/>)}</div></div></>}
      <div className="mx-auto h-7 w-px bg-cyan-700/70"/>
      <div className="mb-4 text-center"><h3 className="text-sm font-black uppercase tracking-widest text-emerald-300">Substation Branches</h3><p className="mt-1 text-xs text-slate-400">Reporting under the active Platoon Commander · officers shown by rank</p></div>
      {!visibleStations.length?<div className="mx-auto max-w-lg rounded-xl border border-dashed border-slate-700 p-7 text-center text-sm text-slate-400">No substations with authorized personnel are assigned to this Division.</div>:
      <div className={`grid items-start gap-4 ${visibleStations.length>1?'lg:grid-cols-2':''}`}>
        {visibleStations.map(station=>{
          const members=divisionPeople.filter(person=>(person.substation||'Not assigned to a substation')===station).sort(comparePersonnel);
          const ranks=distinct(members.map(person=>person.rank)).sort((a,b)=>RANKS.indexOf(a)-RANKS.indexOf(b));
          return <div key={station} className="min-w-0 overflow-hidden rounded-2xl border border-emerald-700/40 bg-[#0b2031]" data-substation={station}>
            <div className="flex items-center justify-between gap-2 border-b border-emerald-700/30 bg-emerald-950/20 px-4 py-3"><div><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Substation</div><h4 className="mt-0.5 text-lg font-black text-white">{station}</h4></div><span className="rounded-full border border-emerald-800 px-2 py-1 text-xs font-bold text-emerald-200">{members.length} officers</span></div>
            <div className="space-y-4 p-3 md:p-4">{ranks.map(rank=><div key={rank}><div className="mb-2 flex items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-300">{rank}</span><div className="h-px flex-1 bg-slate-700"/></div><div className="space-y-2">{members.filter(person=>person.rank===rank).map(person=><AreaMember key={person.id} person={person} onOpen={onOpen}/>)}</div></div>)}</div>
          </div>;
        })}
      </div>}
    </div>
  </section>;
}

export default function RankStructure(){
  const [selectedPerson,setSelectedPerson]=useState(null);
  const [photoPerson,setPhotoPerson]=useState(null);
  const { user } = useAuth();
  const {data:rosterData={officers:[],commands:[]},isLoading:rosterLoading,isFetching:rosterFetching,error:rosterError,refetch:refetchRoster}=useQuery({queryKey:['allUsersRank',user?.id,user?.rank,user?.platoon,user?.oversight_platoon,user?.division,user?.subdivision,user?.substation],queryFn:async()=>{
    if (!hasSupervisorAccess(user)) {
      const [all,locations]=await Promise.all([listDirectoryUsers('last_name',1000),listDirectoryLocations('site_name',1000).catch(()=>[])]);
      // The old chart only read personnel.substation, although a large part
      // of the operational roster is assigned through client site locations.
      // Resolve missing fields using the already authorized site's hierarchy;
      // never make a site-derived inference for supervisor accounts.
      const officers=all.map(person=>{
        const org=officerOrgContext(person,locations);
        return {...person,division:org.division||person.division,subdivision:org.subdivision||person.subdivision,substation:org.substation||person.substation,assigned_site_name:org.site_name};
      });
      const commands=['A','B'].map(platoon=>{
        const person=platoonCommander(platoon,all);
        return person?{platoon,status:person.rank==='Captain'?'active':'acting',name:displayName(person),role:person.rank==='Captain'?'Platoon Commander':'Acting Platoon Commander',unit_number:person.unit_number||''}:{platoon,status:'unassigned',name:'No active commander assigned'};
      });
      return {officers,commands};
    }
    const response=await base44.functions.invoke('getSupervisorWorkspaceRecords',{kind:'personnel'});
    const data=response?.data||response||{};
    if(data.error||data.success!==true)throw new Error(data.error||'Scoped rank directory unavailable');
    return {officers:data.officers||[],commands:data.platoon_commands||[]};
  },enabled:!!user?.id,staleTime:60000,refetchOnWindowFocus:false});
  const users=rosterData.officers||[];
  const commands=rosterData.commands||[];
  const roles=rolesOf(user);
  const allowed=hasSupervisorAccess(user)||roles.has('officer')||roles.has('cad_access');
  const availabilityTick=useAvailabilityClock();
  // An officer on approved leave is still assigned to their substation.
  // The command card uses availability, but assignment rosters must not
  // silently remove people merely because they're off duty or on leave.
  const active=useMemo(()=>users.filter(person=>isOperational(person) && (!hasSupervisorAccess(user) || withinPersonnelOversightScope(user, person))).sort(comparePersonnel),[users,user?.id,user?.platoon,user?.oversight_platoon,user?.division,user?.subdivision,user?.substation,user?.rank,availabilityTick]);

  if(!allowed) return <div className="p-8 text-center"><Shield className="mx-auto mb-3 h-12 w-12 text-slate-500"/><h2 className="text-xl font-bold">Access Required</h2></div>;
  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    {rosterError && <div role="alert" className="rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-sm text-red-100">Officer assignments could not load: {rosterError.message}. <button type="button" className="ml-2 underline font-bold" onClick={()=>refetchRoster()}>Retry roster</button></div>}
    {!rosterError && (rosterLoading || rosterFetching && !users.length) && <div role="status" className="rounded-xl border border-cyan-800 bg-slate-900 p-4 text-sm text-cyan-200">Loading assigned personnel and active platoon command…</div>}
    {!rosterLoading && !rosterError && !active.length && <div role="status" className="rounded-xl border border-amber-700 bg-amber-950/25 p-4 text-sm text-amber-100">No assigned lower-ranking officers are currently visible in your authorized platoon and area. Check officer Region, Division, Platoon and Substation assignments in Manage Officers.</div>}
    <PersonnelPrintRoster users={active} contactEmail={contactEmail}/>
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-5"><div className="flex items-center gap-3"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><Shield className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black tracking-wide">RANK STRUCTURE & CHAIN OF COMMAND</h1><p className="text-sm text-slate-400">Active Platoon Command is displayed first, directly above the operating Division and its Substation branches. Select a state or Division without crowding the chart.</p></div></div></div>

    {hasSupervisorAccess(user) && <div className="flex justify-end"><button type="button" onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-600"><Printer className="h-4 w-4"/>Print Personnel / Command Roster</button></div>}
    {['admin','full_access'].some(role => role===user?.role||roles.has(role)) && <details className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4"><summary className="cursor-pointer text-sm font-black text-amber-200">Company Command Leadership</summary><div className="mt-4"><CommandTree users={active} allUsers={active} onOpen={setSelectedPerson}/></div></details>}
    <FocusedRankFlow users={active} commands={commands} viewer={user} onOpen={setSelectedPerson}/>
    <OfficerDialog person={selectedPerson} users={active} open={!!selectedPerson} onPhotoOpen={person=>setPhotoPerson(person)} onOpenChange={open=>{if(!open)setSelectedPerson(null)}}/>
    <Dialog open={!!photoPerson} onOpenChange={open=>{if(!open)setPhotoPerson(null)}}><DialogContent className="max-w-4xl border-slate-700 bg-slate-950 text-white"><DialogHeader><DialogTitle>Full photo — {photoPerson ? displayName(photoPerson) : "Officer"}</DialogTitle></DialogHeader>{photoPerson?.profile_photo_url && <img src={photoPerson.profile_photo_url} alt="Full original officer photograph" className="max-h-[78vh] w-full object-contain" />}</DialogContent></Dialog>
  </div></div>;
}
