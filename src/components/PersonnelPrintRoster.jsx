import { comparePersonnel, normalizeRank, RANKS } from '@/utils/rankPolicy';
import { createPortal } from 'react-dom';
import { COMMAND_TIERS, commandRank, reportingLabel, assignmentLabel } from '@/utils/commandReporting';

export const rosterPrintCss = `
#bps-print-roster {display:none}
@media print {
 @page {size:letter portrait;margin:0.38in}
 html,body {margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:#fff!important}
 body > :not(#bps-print-roster) {display:none!important}
 #bps-print-roster {display:block!important;position:static!important;width:100%!important;color:#142239!important;background:#fff!important;font-family:Arial,sans-serif}
 #bps-print-roster * {box-sizing:border-box;visibility:visible!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 #bps-print-roster .roster-sheet {width:100%;padding:0}
 #bps-print-roster .roster-header {display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #b99a49;padding:0 0 8px;margin-bottom:9px}
 #bps-print-roster h1 {font-size:16px;margin:0 0 3px;font-weight:800;letter-spacing:.6px}
 #bps-print-roster .roster-subtitle {font-size:9px;color:#425067}
 #bps-print-roster .roster-section {margin-top:10px}
 #bps-print-roster .roster-section-title {font-size:10px;font-weight:800;letter-spacing:.7px;color:#24364e;background:#edf1f5;border-left:3px solid #b99a49;padding:5px 7px;margin:0 0 6px;break-after:avoid}
 #bps-print-roster .roster-tier {margin:0;break-inside:avoid;page-break-inside:avoid}
 #bps-print-roster .roster-tier-label {text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#715719;margin:5px 0 4px}
 #bps-print-roster .roster-connector {height:9px;width:1px;background:#b99a49;margin:0 auto}
 #bps-print-roster .roster-row {display:flex;justify-content:center;align-items:stretch;gap:8px;width:100%}
 #bps-print-roster .roster-card {width:100%;min-width:0;flex:0 1 3.55in;border:1px solid #c9b47d;border-radius:4px;padding:6px;display:flex;align-items:flex-start;gap:8px;break-inside:avoid;background:#f7f8fa}
 #bps-print-roster .roster-photo {width:39px;height:49px;object-fit:cover;flex-shrink:0;border-radius:3px;background:#e1e7ef}
 #bps-print-roster .roster-copy {min-width:0;flex:1;font-size:8px;line-height:1.25;overflow-wrap:anywhere}
 #bps-print-roster .roster-name {font-size:10px;font-weight:800;line-height:1.2;margin:1px 0 3px}
 #bps-print-roster .roster-rank {font-size:8px;font-weight:800;text-transform:uppercase;color:#725714}
 #bps-print-roster .roster-email {overflow-wrap:anywhere}
 #bps-print-roster .roster-footer {margin-top:10px;border-top:1px solid #ccd3dc;padding-top:5px;font-size:8px;color:#566277}
}
`;

const nameOf = person => `${person.rank || 'Officer'} ${person.last_name || person.first_name || ''}`;
const chunks = (items,size) => Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,index*size+size));
function RosterCard({person,users,contactEmail}) {
 return <article className="roster-card">
  {person.profile_photo_url ? <img className="roster-photo" src={person.profile_photo_url} alt=""/> : <div className="roster-photo"/>}
  <div className="roster-copy">
   <div className="roster-rank">{person.rank}</div><div className="roster-name">{person.first_name} {person.last_name}</div>
   <div>Badge {person.badge_number || '—'} · Unit {person.unit_number || '—'}</div>
   <div>Assignment: {assignmentLabel(person,users)}</div>
   <div>Reports to: {reportingLabel(person,users,nameOf)}</div>
   <div>Phone: {person.mobile_phone || 'Not provided'}</div>
   <div className="roster-email">Email: {contactEmail(person) || 'Not provided'}</div>
  </div>
 </article>;
}

function RankLevels({people,users,contactEmail}) {
 const ranks = [...new Set(people.map(person=>normalizeRank(person.rank)))].sort((a,b)=>RANKS.indexOf(a)-RANKS.indexOf(b));
 const rows = ranks.flatMap(rank=>chunks(people.filter(person=>normalizeRank(person.rank)===rank).sort(comparePersonnel),2).map(members=>({rank,members})));
 return <>{rows.map(({rank,members},index)=><div className="roster-tier" key={`${rank}-${index}`}>
  {index>0 && <div className="roster-connector"/>}
  <div className="roster-tier-label">{rank}</div>
  <div className="roster-row">{members.map(person=><RosterCard key={person.id} person={person} users={users} contactEmail={contactEmail}/>)}</div>
 </div>)}</>;
}

export function RosterPrintContent({users=[],contactEmail=()=>''}) {
 const all=[...users].sort(comparePersonnel);
 const command=all.filter(person=>COMMAND_TIERS.includes(commandRank(person)));
 const operational=all.filter(person=>!COMMAND_TIERS.includes(commandRank(person)));
 const groups=new Map();
 for(const person of operational){
  const region=String(person.division||'Region not assigned').trim();
  const platoon=String(person.platoon||'Platoon not assigned').trim();
  const normalizedPlatoon=/^platoon\b/i.test(platoon)?platoon:`Platoon ${platoon}`;
  const label=`${region} · ${normalizedPlatoon}`;
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label).push(person);
 }
 return <section className="roster-sheet">
  <header className="roster-header">
   <div><h1>BLACK POINT SECURITY</h1><div className="roster-subtitle">PERSONNEL &amp; COMMAND ROSTER · CHAIN OF COMMAND</div></div>
   <div className="roster-subtitle">{new Date().toLocaleDateString('en-US')} · {all.length} active personnel</div>
  </header>
  {command.length>0 && <section className="roster-section">
   <h2 className="roster-section-title">COMPANY COMMAND</h2>
   <RankLevels people={command} users={all} contactEmail={contactEmail}/>
  </section>}
  {[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([label,people])=><section className="roster-section" key={label}>
   <h2 className="roster-section-title">{label.toUpperCase()}</h2>
   <RankLevels people={people} users={all} contactEmail={contactEmail}/>
  </section>)}
  <footer className="roster-footer">Official personnel hierarchy · Ranked from highest to lowest · Current Pathfinder assignments</footer>
 </section>;
}
export default function PersonnelPrintRoster(props) {
 if(typeof document==='undefined')return null;
 return createPortal(<div id="bps-print-roster"><style>{rosterPrintCss}</style><RosterPrintContent {...props}/></div>,document.body);
}
