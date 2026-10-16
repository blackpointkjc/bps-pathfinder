import { COMMAND_TIERS, commandRank } from '@/utils/commandReporting';
export default function CommandRankTiers({ users, renderPerson }) {
  return <div className="space-y-3">{COMMAND_TIERS.map((rank,index)=><div key={rank}>
    {index>0 && <div className="mx-auto h-6 w-px bg-amber-500/60"/>}
    <div className="mb-2 text-center text-xs font-bold uppercase tracking-wider">{rank}{rank==='Major'?' — each reports to all Lt Colonels':''}</div>
    <div className="flex flex-wrap items-start justify-center gap-5" data-command-rank={rank}>{users.filter(person=>commandRank(person)===rank).map(person=><div key={person.id} className="w-full min-w-0 max-w-[360px]" style={{flex:"0 1 360px"}}>{renderPerson(person)}</div>)}</div>
  </div>)}</div>;
}
