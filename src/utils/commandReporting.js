import { isOutOfOffice } from './outOfOffice.js';
import { comparePersonnel as stablePersonnelOrder, normalizeRank, rankLevel } from './rankPolicy.js';
export const compareCommandPersonnel = (a,b) => {
 const hired = p => Number.isFinite(Date.parse(p?.hire_date)) ? Date.parse(p.hire_date) : Infinity;
 const order = (hired(a)-hired(b)) || (Number.isFinite(a?.command_seniority_order)&&Number.isFinite(b?.command_seniority_order) ? a.command_seniority_order-b.command_seniority_order : 0);
 return rankLevel(a?.rank)-rankLevel(b?.rank) || order || stablePersonnelOrder(a,b);
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
export function platoonCommander(letter, users = []) {
 const members = users.filter(person => activePerson(person) && !isOutOfOffice(person) && person.platoon === letter && !COMMAND_TIERS.includes(commandRank(person)) && rankLevel(person.rank) < 999).sort(comparePersonnel);
 const chosen = members.find(person => normalizeRank(person.rank) === 'Captain') || members[0];
 if (chosen) return chosen;
 const permanent = users.filter(person => activePerson(person) && person.platoon === letter && !COMMAND_TIERS.includes(commandRank(person))).sort(comparePersonnel)[0];
 const seen = new Set();
 let parent = users.find(user => user.id === permanent?.supervisor_id);
 while (parent && !seen.has(parent.id)) {
  seen.add(parent.id);
  if (activePerson(parent) && !isOutOfOffice(parent) && (parent.platoon === letter || (commandRank(parent) === 'Major' && majorPlatoon(parent) === letter) || ['Lt Colonel','Colonel'].includes(commandRank(parent)))) return parent;
  parent = users.find(user => user.id === parent.supervisor_id);
 }
 return users.filter(user => activePerson(user) && !isOutOfOffice(user) && commandRank(user) === 'Major' && majorPlatoon(user) === letter).sort(comparePersonnel)[0] || null;
}
export function platoonCommandLabel(person, users = []) {
 return ['A','B'].filter(letter => platoonCommander(letter, users)?.id === person?.id).map(letter =>
  `Platoon ${letter} Commander${person.platoon === letter && normalizeRank(person.rank) === 'Captain' && !isOutOfOffice(person) ? '' : ' (Acting)'}`
 ).join(' · ');
}
export const assignmentLabel = (person, users = []) => platoonCommandLabel(person, users) || (COMMAND_TIERS.includes(commandRank(person)) ? 'Command' : ['A','B'].includes(person?.platoon) ? `Platoon ${person.platoon}` : 'Unassigned');
function baseReportingSupervisors(person, users = []) {
  if (commandRank(person) === 'Major') return users.filter(user => user.id !== person.id && commandRank(user) === 'Lt Colonel' && !user.termination_date && user.employment_status !== 'terminated').sort(comparePersonnel);
  const active = users.filter(activePerson);
  const commander = ['A','B'].includes(person?.platoon) ? platoonCommander(person.platoon, active) : null;
  if (commander?.id === person?.id) {
    const majors = active.filter(user => user.id !== person.id && commandRank(user) === 'Major' && majorPlatoon(user) === person.platoon).sort(comparePersonnel);
    if (majors.length) return majors;
    return active.filter(user => user.id === person.supervisor_id && COMMAND_TIERS.includes(commandRank(user)));
  }
  if (commander && !COMMAND_TIERS.includes(commandRank(person))) {
    const assigned = active.find(user => user.id === person.supervisor_id && user.platoon === person.platoon && !COMMAND_TIERS.includes(commandRank(user)) && rankLevel(user.rank) < rankLevel(person.rank));
    return assigned ? [assigned] : [commander];
  }
  return active.filter(user => user.id === person?.supervisor_id);
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
 if(!isOutOfOffice(person))return person;
 const available=users.filter(user=>activePerson(user)&&!isOutOfOffice(user)&&user.id!==person.id&&rankLevel(user.rank)<999);
 const platoon=['A','B'].includes(person.platoon)?person.platoon:majorPlatoon(person);
 const same=available.filter(user=>platoon?user.platoon===platoon:COMMAND_TIERS.includes(commandRank(person))&&COMMAND_TIERS.includes(commandRank(user)));
 const peersOrBelow=same.filter(user=>rankLevel(user.rank)>=rankLevel(person.rank)).sort(comparePersonnel);
 if(peersOrBelow.length)return peersOrBelow[0];
 const above=same.filter(user=>rankLevel(user.rank)<rankLevel(person.rank)).sort(comparePersonnel);
 if(above.length)return above[0];
 const major=available.filter(user=>commandRank(user)==='Major'&&majorPlatoon(user)===platoon).sort(comparePersonnel)[0];
 return major||available.filter(user=>['Lt Colonel','Colonel'].includes(commandRank(user))&&rankLevel(user.rank)<rankLevel(person.rank)).sort(comparePersonnel)[0]||null;
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
export const oversightLabel = person => commandRank(person) === 'Major' ? (majorPlatoon(person) ? `Oversees Platoon ${majorPlatoon(person)}` : 'Platoon oversight unassigned') : 'Shared Command';

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
