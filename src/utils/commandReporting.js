export const COMMAND_TIERS = ['Colonel', 'Lt Colonel', 'Major'];
export const commandRank = person => {
  const rank = String(person?.rank || '').trim();
  if (/^(lt\.?\s*colonel|lieutenant colonel)\b/i.test(rank)) return 'Lt Colonel';
  if (/^major\b/i.test(rank)) return 'Major';
  if (/^colonel\b/i.test(rank)) return 'Colonel';
  return rank;
};
export const majorPlatoon = person => ['A','B'].includes(person?.platoon) ? person.platoon : '';
export function reportingSupervisors(person, users = []) {
  if (commandRank(person) === 'Major') return users.filter(user => user.id !== person.id && commandRank(user) === 'Lt Colonel' && !user.termination_date && user.employment_status !== 'terminated');
  return users.filter(user => user.id === person?.supervisor_id);
}
export const reportingLabel = (person, users, name) => reportingSupervisors(person, users).map(name).join(' & ') || (commandRank(person) === 'Colonel' ? 'Top of Command' : 'Awaiting assignment');
export const oversightLabel = person => commandRank(person) === 'Major' ? (majorPlatoon(person) ? `Oversees Platoon ${majorPlatoon(person)}` : 'Platoon oversight unassigned') : 'Shared Command';
