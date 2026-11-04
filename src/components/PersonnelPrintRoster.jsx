import { comparePersonnel, normalizeRank, rankLevel } from '@/utils/rankPolicy';
import { createPortal } from 'react-dom';
import { COMMAND_TIERS, commandRank, reportingLabel, assignmentLabel } from '@/utils/commandReporting';

export const rosterPrintCss = `
#bps-print-roster { display:none }
@media print {
 @page {size:letter portrait;margin:.38in}
 html,body {margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:white!important}
 body > :not(#bps-print-roster) {display:none!important}
 #bps-print-roster {display:block!important;position:static!important;width:100%!important;color:#192539!important;background:white!important;font-family:Arial,Helvetica,sans-serif}
 #bps-print-roster * {box-sizing:border-box;visibility:visible!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 #bps-print-roster .print-document {width:100%;max-width:100%;padding:0}
 #bps-print-roster .print-header {display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid #b29550;padding-bottom:10px}
 #bps-print-roster .print-brand {font-size:17px;font-weight:900;letter-spacing:.5px;color:#162237}
 #bps-print-roster .print-deck {font-size:9px;font-weight:700;color:#596474;letter-spacing:1.2px;margin-top:4px}
 #bps-print-roster .print-meta {text-align:right;font-size:9px;line-height:1.6;color:#425168;white-space:nowrap}
 #bps-print-roster .print-intro {padding:8px 0 4px;text-align:center;font-size:9px;letter-spacing:.7px;font-weight:700;color:#536073}
 #bps-print-roster .org-section {break-inside:auto;margin-top:7px}
 #bps-print-roster .org-section-heading {display:flex;align-items:center;gap:9px;break-after:avoid;page-break-after:avoid;margin:4px 0 8px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.9px;color:#25364d}
 #bps-print-roster .org-section-heading:before,#bps-print-roster .org-section-heading:after {content:'';height:1px;background:#c9d0da;flex:1}
 #bps-print-roster .org-section-heading span {background:#eaf0f5;padding:5px 12px;border-radius:3px;border-top:2px solid #b29550}
 #bps-print-roster .org-level {break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center}
 #bps-print-roster .org-stem {height:12px;width:2px;background:#b29550;margin:0 auto}
 #bps-print-roster .org-rank-title {font-size:8px;text-transform:uppercase;letter-spacing:1.15px;font-weight:900;color:#876b2f;margin:0 0 5px;text-align:center}
 #bps-print-roster .org-cards {width:100%;display:flex;align-items:stretch;justify-content:center;gap:10px}
 #bps-print-roster .org-card {width:3.45in;max-width:calc(50% - 5px);min-width:0;display:flex;gap:10px;align-items:flex-start;padding:9px 10px;background:#f7f8fb;border:1px solid #abb8c8;border-top:3px solid #b29550;border-radius:5px;break-inside:avoid;page-break-inside:avoid}
 #bps-print-roster .org-card:only-child {max-width:3.55in}
 #bps-print-roster .org-photo {height:68px;width:57px;flex-shrink:0;object-fit:cover;object-position:center 20%;border-radius:4px;border:1px solid #cbd3dd;background:#e5e9ee}
 #bps-print-roster .org-placeholder {display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#7e8796}
 #bps-print-roster .org-details {min-width:0;flex:1}
 #bps-print-roster .org-rank {font-size:8px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:#876b2f}
 #bps-print-roster .org-name {font-size:12px;line-height:1.2;font-weight:900;color:#15263b;margin:2px 0 5px}
 #bps-print-roster .org-info {font-size:8.4px;line-height:1.5;color:#29374b;overflow-wrap:anywhere}
 #bps-print-roster .org-info strong {color:#15263b;font-weight:800}
 #bps-print-roster .org-contact {font-size:7.7px;color:#46566b;overflow-wrap:anywhere;line-height:1.4;margin-top:3px}
 #bps-print-roster .org-section + .org-section {margin-top:12px}
 #bps-print-roster .print-footer {margin-top:14px;padding-top:6px;border-top:1px solid #c5cbd3;display:flex;justify-content:space-between;font-size:8px;color:#5b6574}
}
`;

const personName = p => [p.first_name,p.last_name].filter(Boolean).join(' ') || p.full_name || 'Unnamed employee';
const reportingName = p => `${p.rank || 'Officer'} ${p.last_name || p.first_name || ''}`;
const groupInto = (people,max=2) => Array.from({length:Math.ceil(people.length/max)},(_,i)=>people.slice(i*max,i*max+max));
const photoOf = person => person.profile_photo_original_url || person.profile_photo_url || '';

function OfficerCard({person,all,contactEmail}) {
 const photo=photoOf(person);
 return <article className="org-card">
  {photo ? <img className="org-photo" src={photo} alt={`${personName(person)} portrait`}/> :
   <div className="org-photo org-placeholder">{person.first_name?.[0]}{person.last_name?.[0]}</div>}
  <div className="org-details">
   <div className="org-rank">{normalizeRank(person.rank)}</div>
   <div className="org-name">{personName(person)}</div>
   <div className="org-info"><strong>Badge</strong> {person.badge_number || '—'} <span> · </span> <strong>Unit</strong> {person.unit_number || '—'}</div>
   <div className="org-info"><strong>Assignment:</strong> {assignmentLabel(person,all)}</div>
   <div className="org-info"><strong>Reports to:</strong> {reportingLabel(person,all,reportingName)}</div>
   <div className="org-contact">{person.mobile_phone || 'No phone listed'}{contactEmail(person) ? <><span> · </span>{contactEmail(person)}</> : null}</div>
  </div>
 </article>;
}
function RankedChain({people,all,contactEmail}) {
 const byRank = [...new Set(people.map(p=>normalizeRank(p.rank)))].sort((a,b)=>rankLevel(a)-rankLevel(b));
 let levelIndex=0;
 return <div className="org-chain">{byRank.flatMap(rank=>{
  const groups=groupInto(people.filter(p=>normalizeRank(p.rank)===rank).sort(comparePersonnel));
  return groups.map((group,i)=>{
   const key=`${rank}-${i}`;
   const preceding=levelIndex++;
   return <div className="org-level" key={key}>
    {preceding>0 && <div className="org-stem"/>}
    <div className="org-rank-title">{rank}</div>
    <div className="org-cards">{group.map(person=><OfficerCard key={person.id} person={person} all={all} contactEmail={contactEmail}/>)}</div>
   </div>;
  });
 })}</div>;
}
export function RosterPrintContent({users=[],contactEmail=()=>''}) {
 const all=[...users].sort(comparePersonnel);
 const command=all.filter(p=>COMMAND_TIERS.includes(commandRank(p)));
 const fields=all.filter(p=>!COMMAND_TIERS.includes(commandRank(p)));
 const platoons=new Map();
 for(const person of fields){
  const region=String(person.division||'Unassigned region').trim();
  const assigned=String(person.platoon||'Unassigned platoon').trim();
  const platoon=/^platoon\b/i.test(assigned)?assigned:assigned==='Unassigned platoon'?assigned:`Platoon ${assigned}`;
  const key=`${region} · ${platoon}`;
  if(!platoons.has(key))platoons.set(key,[]);
  platoons.get(key).push(person);
 }
 return <div className="print-document">
  <header className="print-header">
   <div><div className="print-brand">BLACK POINT SECURITY</div><div className="print-deck">OFFICIAL ORGANIZATIONAL CHART · CHAIN OF COMMAND</div></div>
   <div className="print-meta">{new Date().toLocaleDateString('en-US')}<div>{all.length} active personnel</div></div>
  </header>
  <div className="print-intro">COMMAND AUTHORITY FLOWS FROM TOP TO BOTTOM</div>
  {!!command.length && <section className="org-section">
   <h2 className="org-section-heading"><span>Company Command</span></h2>
   <RankedChain people={command} all={all} contactEmail={contactEmail}/>
  </section>}
  {[...platoons.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,people])=><section className="org-section" key={name}>
   <h2 className="org-section-heading"><span>{name}</span></h2>
   <RankedChain people={people} all={all} contactEmail={contactEmail}/>
  </section>)}
  <footer className="print-footer"><span>Pathfinder · Current personnel assignments</span><span>Higher ranks appear above subordinate ranks</span></footer>
 </div>;
}
export default function PersonnelPrintRoster(props) {
 if(typeof document==='undefined')return null;
 return createPortal(<div id="bps-print-roster"><style>{rosterPrintCss}</style><RosterPrintContent {...props}/></div>,document.body);
}
