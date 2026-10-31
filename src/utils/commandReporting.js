import { isOutOfOffice } from './outOfOffice.js';
import { normalizeRank, rankLevel } from './rankPolicy.js';
import { previewAutomaticSupervisor } from './automaticReporting.js';
export const compareCommandPersonnel = (a,b) => {
 const hired = p => Number.isFinite(Date.parse(p?.hire_date)) ? Date.parse(p.hire_date) : Infinity;
 const order = (hired(a)-hired(b)) || (Number.isFinite(a?.command_seniority_order)&&Number.isFinite(b?.command_seniority_order) ? a.command_seniority_order-b.command_seniority_order : 0);
 const unit=p=>Number(p?.unit_number)>0?Number(p.unit_number):999999;
 return rankLevel(a?.rank)-rankLevel(b?.rank) || order || unit(a)-unit(b) || String(a?.id).localeCompare(String(b?.id));
};
const comparePersonnel=compareCommandPersonnel;
export const COMMAND_TIERS = ['Colonel', 'Lt Colonel', 'Major'];
export const commandRank = person => {
  const rank = String(person?.rank || '').trim();
  if (/^(lt\.?\s*colonel|lieutenant colonel)\b/i.test(rank)) return 'Lt Colonel';
  if (/^major\b/i.test(rank)) return 'Major';
  if (/^colonel\b/i.test(rank)) return 'Colonel';
  return rank;
};
export const majorPlatoon = person => ['A','B'].includes(person?.oversight_platoon) ? person.oversight_platoon : ['A','B'].includes(person?.platoon) ? person.platoon : '';
const activePerson = person => !person.termination_date && String(person.employment_status || '').toLowerCase() !== 'terminated';
export function platoonCommander(letter, users = [], region = '') {
  if(!letter||letter==='Command'||!region)return null;
  const selected=activePlatoonCommand(letter,users,region);
  return users.find(person=>String(person.id)===String(selected.id))||null;
}
// Read-only command position. Company command never fills a Platoon seat.
// Highest available operational rank, then smallest issued badge number,
// then unit number. Captains are the permanent Platoon command rank;
// every other qualifying leader is displayed as acting only.
export function activePlatoonCommand(letter, users = [], region = '') {
 const n=v=>String(v||'').trim().toLowerCase();
 const commandRank=person=>rankLevel(person.rank);
 const eligible=users.filter(person=>activePerson(person)&&!isOutOfOffice(person)
   && n(person.platoon)===n(letter)
   && (!region||n(person.division)===n(region))
   && commandRank(person)>=rankLevel('Captain') && commandRank(person)<999);
 const badge=person=>Number.isFinite(Number(person.badge_number))&&Number(person.badge_number)>0?Number(person.badge_number):Number.MAX_SAFE_INTEGER;
 const unit=person=>Number.isFinite(Number(person.unit_number))&&Number(person.unit_number)>0?Number(person.unit_number):Number.MAX_SAFE_INTEGER;
 eligible.sort((a,b)=>commandRank(a)-commandRank(b)||badge(a)-badge(b)||unit(a)-unit(b)||String(a.id).localeCompare(String(b.id)));
 const person=eligible[0];
 if(!person)return {platoon:letter,region,status:'unassigned',name:'No active platoon leader',role:'Platoon Command Vacant'};
 const acting=normalizeRank(person.rank)!=='Captain';
 return {id:person.id,platoon:letter,region,status:acting?'acting':'active',name:[person.rank,person.last_name||person.first_name].filter(Boolean).join(' '),first_name:person.first_name||'',last_name:person.last_name||'',role:acting?'Acting Platoon Commander':'Platoon Commander',rank:person.rank,badge_number:person.badge_number||'',unit_number:person.unit_number||'',profile_photo_url:person.profile_photo_original_url||person.profile_photo_url||'',work_email:person.work_email||person.email||'',mobile_phone:person.mobile_phone||'',subdivision:person.subdivision||'',substation:person.substation||'',assigned_site_name:person.assigned_site_name||''};
}
export function platoonCommandLabel(person, users = []) {
 const platoon=String(person?.platoon||'').trim(),region=String(person?.division||'').trim();
 if(!platoon||platoon==='Command'||!region)return '';
 const commander=platoonCommander(platoon,users,region);
 if(commander?.id!==person?.id)return '';
 return `${platoon.startsWith('Platoon ')?platoon:`Platoon ${platoon}`} Commander${normalizeRank(person.rank)==='Captain'?'':' (Acting)'}`;
}
export const assignmentLabel = (person, users = []) => platoonCommandLabel(person, users)
 || (COMMAND_TIERS.includes(commandRank(person)) ? 'Company Command' : person?.platoon&&person.platoon!=='Command' ? `${String(person.platoon).startsWith('Platoon ')?person.platoon:`Platoon ${person.platoon}`}` : 'Unassigned');
function baseReportingSupervisors(person, users = []) {
 const rank=rankLevel(person.rank),active=users.filter(activePerson);
 if(COMMAND_TIERS.includes(commandRank(person))){
   if(commandRank(person)==='Colonel')return [];
   if(commandRank(person)==='Lt Colonel')return active.filter(p=>commandRank(p)==='Colonel').sort(comparePersonnel).slice(0,1);
   return active.filter(p=>commandRank(p)==='Lt Colonel').sort(comparePersonnel).slice(0,1);
 }
 if(rank<3||rank>=999)return [];
 const supervisor=previewAutomaticSupervisor(person,active);
 return supervisor?[supervisor]:[];
}
export function reportingSupervisors(person, users = []) {
 const seen = new Set([person?.id]);
 const resolve = parent => {
  if (!parent || seen.has(parent.id)) return [];
  seen.add(parent.id);
  if (!isOutOfOffice(parent)) return [parent];
  return baseReportingSupervisors(parent, users).flatMap(resolve);
 };
 return baseReportingSupervisors(person, users).flatMap(resolve);
}
export function actingCoverage(person, users = []) {
 if (!isOutOfOffice(person)) return person;
 const currentRank = rankLevel(person.rank);
 if (currentRank >= 999) return null;
 const platoon = ['A','B'].includes(person.platoon) ? person.platoon : majorPlatoon(person);
 const clean = value => String(value || '').trim().toLowerCase();
 const active = users.filter(candidate => activePerson(candidate) && !isOutOfOffice(candidate)
   && candidate.id !== person.id && rankLevel(candidate.rank) < 999);
 // The nearest supervisory rank must be preferred over the top of command:
 // First Sergeant -> Lieutenant, Captain -> Major. Never begin at Colonel.
 // Keep the existing same-rank/field fallback after searching up the chain.
 const rankPriority = candidate => {
   const delta = rankLevel(candidate.rank) - currentRank;
   return delta < 0 ? [0, -delta] : delta === 0 ? [1, 0] : [2, delta];
 };
 const rankAscending = (a,b) => {
   const x=rankPriority(a), y=rankPriority(b);
   return x[0]-y[0] || x[1]-y[1] || comparePersonnel(a,b);
 };
 const region = clean(person.division);
 const division = clean(person.subdivision);
 const substation = clean(person.substation);
 const sameArea = candidate => !region || (clean(candidate.division) === region
   && (!division || clean(candidate.subdivision) === division));
 // Rank distance is the first priority, so a Lieutenant is not bypassed
 // for Colonel merely because Colonel shares a platoon. Geography/platoon
 // and existing seniority policies choose among equally close ranks.
 const scopePriority = candidate => {
   const inDivision = sameArea(candidate);
   const inPlatoon = platoon && (candidate.platoon === platoon || majorPlatoon(candidate) === platoon);
   return inDivision && inPlatoon ? 0 : inDivision ? 1 : inPlatoon ? 2 : 3;
 };
 const nearest = pool => [...pool].sort((a,b) => {
   const distanceA = Math.abs(rankLevel(a.rank) - currentRank);
   const distanceB = Math.abs(rankLevel(b.rank) - currentRank);
   return distanceA-distanceB || scopePriority(a)-scopePriority(b) || comparePersonnel(a,b);
 })[0];
 // Closest higher rank first. Only if no higher-ranking officer is available
 // anywhere does coverage fall to a peer, then the closest lower rank.
 const superior=nearest(active.filter(candidate => rankLevel(candidate.rank) < currentRank));
 if (superior) return superior;
 const peer=nearest(active.filter(candidate => rankLevel(candidate.rank) === currentRank));
 if (peer) return peer;
 const subordinate=nearest(active.filter(candidate => rankLevel(candidate.rank) > currentRank));
 if (subordinate) return subordinate;
 return null;
}
export const reportingLabel = (person, users, name) => reportingSupervisors(person, users).map(name).join(' & ') || (commandRank(person) === 'Colonel' ? 'Top of Command' : 'Awaiting assignment');
export function siteReportingChains(references = [], users = []) {
 const active=users.filter(p=>!p.termination_date && p.employment_status!=='terminated');
 const clean=v=>String(v || '').trim().toLowerCase();
 return [...new Set(references.map(clean).filter(Boolean))].map(reference=>{
  let root=active.find(p=>clean(p.id)===reference || [p.email,p.work_email,p.pathfinder_email,p.microsoft_email,p.outlook_email,...(Array.isArray(p.email_aliases) ? p.email_aliases : [])].some(v=>clean(v)===reference));
  if(!root) return {reference,levels:[],unresolved:true};
  const permanent = root;
  root = actingCoverage(permanent, active);
  if (!root) return {reference,levels:[],unresolved:true};
  const actingFor = root.id !== permanent.id ? permanent : null;
  const levels=[]; const seen=new Set(); let current=[root]; let incomplete=false;
  while(current.length) {
   const level=current.filter(p=>!seen.has(p.id));
   if(!level.length) {incomplete=true;break;}
   level.sort(comparePersonnel); level.forEach(p=>seen.add(p.id)); levels.push(level);
   const next=new Map();
   for(const person of level) {
    const parents=reportingSupervisors(person,active);
    if(!parents.length && commandRank(person)!=='Colonel') incomplete=true;
    for(const parent of parents) if(!seen.has(parent.id)) next.set(parent.id,parent);
   }
   current=[...next.values()];
  }
  return {reference,levels,incomplete,actingFor};
 });
}
export const oversightLabel = person => COMMAND_TIERS.includes(commandRank(person)) ? 'Company Command' : 'Regional Platoon';

// The site's saved assignment is authoritative; never infer a primary owner.
export function primarySiteReportingChain(references = [], users = []) {
 const selected = [...new Set(references.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
 if (!selected.length) return null;
 if (selected.length !== 1) return { levels: [], assignmentRequired: true };
 const chain = siteReportingChains(selected, users)[0];
 return chain?.unresolved ? { ...chain, assignmentRequired: true } : chain;
}

export function actingCommandLabel(person,users=[]){
 const covers=users.filter(owner=>owner.id!==person?.id&&isOutOfOffice(owner)&&actingCoverage(owner,users)?.id===person?.id);
 return covers.map(owner=>'Acting for '+[owner.rank,owner.last_name].filter(Boolean).join(' ')).join(' · ');
}
