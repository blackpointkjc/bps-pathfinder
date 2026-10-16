import { comparePersonnel } from '@/utils/rankPolicy';
export const COMMAND_TIERS = ['Colonel', 'Lt Colonel', 'Major'];
export const commandRank = person => {
  const rank = String(person?.rank || '').trim();
  if (/^(lt\.?\s*colonel|lieutenant colonel)\b/i.test(rank)) return 'Lt Colonel';
  if (/^major\b/i.test(rank)) return 'Major';
  if (/^colonel\b/i.test(rank)) return 'Colonel';
  return rank;
};
export const majorPlatoon = person => ['A','B'].includes(person?.oversight_platoon) ? person.oversight_platoon : ['A','B'].includes(person?.platoon) ? person.platoon : '';
export const assignmentLabel = person => COMMAND_TIERS.includes(commandRank(person)) ? 'Command' : ['A','B'].includes(person?.platoon) ? `Platoon ${person.platoon}` : 'Unassigned';
export function reportingSupervisors(person, users = []) {
  if (commandRank(person) === 'Major') return users.filter(user => user.id !== person.id && commandRank(user) === 'Lt Colonel' && !user.termination_date && user.employment_status !== 'terminated').sort(comparePersonnel);
  return users.filter(user => user.id === person?.supervisor_id);
}
export const reportingLabel = (person, users, name) => reportingSupervisors(person, users).map(name).join(' & ') || (commandRank(person) === 'Colonel' ? 'Top of Command' : 'Awaiting assignment');
export function siteReportingChains(references = [], users = []) {
 const active=users.filter(p=>!p.termination_date && p.employment_status!=='terminated');
 const clean=v=>String(v || '').trim().toLowerCase();
 return [...new Set(references.map(clean).filter(Boolean))].map(reference=>{
  const root=active.find(p=>p.id===reference || [p.email,p.work_email,p.pathfinder_email,p.microsoft_email,...(p.email_aliases || [])].some(v=>clean(v)===reference));
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
