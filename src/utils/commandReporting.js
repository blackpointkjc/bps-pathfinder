import { comparePersonnel, normalizeRank, rankLevel } from './rankPolicy.js';
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
 const members = users.filter(person => activePerson(person) && person.platoon === letter && !COMMAND_TIERS.includes(commandRank(person)) && rankLevel(person.rank) < 999).sort(comparePersonnel);
 return members.find(person => normalizeRank(person.rank) === 'Captain') || members[0] || null;
}
export function platoonCommandLabel(person, users = []) {
 const commander = ['A','B'].includes(person?.platoon) ? platoonCommander(person.platoon, users) : null;
 if (!commander || commander.id !== person?.id) return '';
 return `Platoon ${person.platoon} Commander${normalizeRank(person.rank) === 'Captain' ? '' : ' (Acting)'}`;
}
export const assignmentLabel = (person, users = []) => platoonCommandLabel(person, users) || (COMMAND_TIERS.includes(commandRank(person)) ? 'Command' : ['A','B'].includes(person?.platoon) ? `Platoon ${person.platoon}` : 'Unassigned');
export function reportingSupervisors(person, users = []) {
  if (commandRank(person) === 'Major') return users.filter(user => user.id !== person.id && commandRank(user) === 'Lt Colonel' && !user.termination_date && user.employment_status !== 'terminated').sort(comparePersonnel);
  const active = users.filter(activePerson);
  const commander = ['A','B'].includes(person?.platoon) ? platoonCommander(person.platoon, active) : null;
  if (commander?.id === person?.id) {
    const majors = active.filter(user => commandRank(user) === 'Major' && majorPlatoon(user) === person.platoon).sort(comparePersonnel);
    if (majors.length) return majors;
    return active.filter(user => user.id === person.supervisor_id && COMMAND_TIERS.includes(commandRank(user)));
  }
  if (commander && !COMMAND_TIERS.includes(commandRank(person))) {
    const assigned = active.find(user => user.id === person.supervisor_id && user.platoon === person.platoon && !COMMAND_TIERS.includes(commandRank(user)) && rankLevel(user.rank) < rankLevel(person.rank));
    return assigned ? [assigned] : [commander];
  }
  return active.filter(user => user.id === person?.supervisor_id);
}
export const reportingLabel = (person, users, name) => reportingSupervisors(person, users).map(name).join(' & ') || (commandRank(person) === 'Colonel' ? 'Top of Command' : 'Awaiting assignment');
export function siteReportingChains(references = [], users = []) {
 const active=users.filter(p=>!p.termination_date && p.employment_status!=='terminated');
 const clean=v=>String(v || '').trim().toLowerCase();
 return [...new Set(references.map(clean).filter(Boolean))].map(reference=>{
  const root=active.find(p=>clean(p.id)===reference || [p.email,p.work_email,p.pathfinder_email,p.microsoft_email,p.outlook_email,...(Array.isArray(p.email_aliases) ? p.email_aliases : [])].some(v=>clean(v)===reference));
  if(!root) return {reference,levels:[],unresolved:true};
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
  return {reference,levels,incomplete};
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
