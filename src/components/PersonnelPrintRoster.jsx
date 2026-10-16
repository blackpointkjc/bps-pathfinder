import { createPortal } from 'react-dom';
import { COMMAND_TIERS, commandRank, reportingLabel, oversightLabel, assignmentLabel } from '@/utils/commandReporting';
export const rosterPrintCss = `
#bps-print-roster {display:none}
@media print {
 @page {size:letter landscape;margin:0.35in}
 html,body {margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:white!important}
 body > :not(#bps-print-roster) {display:none!important}
 #bps-print-roster {display:block!important;color:#142239!important;background:white!important;position:static!important;width:100%!important;font-family:Arial,sans-serif}
 #bps-print-roster * {box-sizing:border-box;visibility:visible!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
 #bps-print-roster .roster-sheet {width:100%;break-after:page;page-break-after:always;padding:0}
 #bps-print-roster .roster-sheet:last-child {break-after:auto;page-break-after:auto}
 #bps-print-roster .roster-header {display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b99a49;padding:6px 0 9px;margin-bottom:10px}
 #bps-print-roster h1 {font-size:18px;margin:0 0 4px;font-weight:800;letter-spacing:1px}
 #bps-print-roster .roster-subtitle {font-size:10px}
 #bps-print-roster .roster-row {display:flex;justify-content:center;align-items:stretch;gap:14px;width:100%;break-inside:avoid}
 #bps-print-roster .roster-tier h2 {font-size:10px;letter-spacing:1px;text-align:center;margin:7px 0}
 #bps-print-roster .roster-connector {height:12px;width:1px;background:#b99a49;margin:0 auto}
 #bps-print-roster .roster-card {width:3.75in;max-width:100%;min-width:0;flex:0 1 3.75in;border:1px solid #b99a49;border-radius:6px;padding:8px;display:flex;align-items:flex-start;gap:10px;break-inside:avoid;background:#f5f7fa}
 #bps-print-roster .roster-photo {width:49px;height:65px;object-fit:cover;flex-shrink:0;border-radius:4px;background:#e1e7ef}
 #bps-print-roster .roster-copy {min-width:0;flex:1;font-size:9px;line-height:1.35;overflow-wrap:anywhere}
 #bps-print-roster .roster-name {font-size:12px;font-weight:800;line-height:1.25;margin-bottom:4px}
 #bps-print-roster .roster-rank {font-size:9px;font-weight:800;text-transform:uppercase;color:#725714}
 #bps-print-roster .roster-email {overflow-wrap:anywhere;word-break:normal}
 #bps-print-roster .roster-grid {display:grid;grid-template-columns:1fr 1fr;gap:12px}
 #bps-print-roster .roster-grid .roster-card {width:100%}
 #bps-print-roster .roster-footer {margin-top:12px;border-top:1px solid #ccd3dc;padding-top:6px;font-size:9px;display:flex;justify-content:space-between}
}
`;
const nameOf = person => `${person.rank || 'Officer'} ${person.last_name || person.first_name || ''}`;
const chunks = (items,size) => Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,index*size+size));
function RosterCard({ person, users, contactEmail }) {
 return <article className="roster-card">
  {person.profile_photo_url ? <img className="roster-photo" src={person.profile_photo_url} alt=""/> : <div className="roster-photo"/>}
  <div className="roster-copy"><div className="roster-rank">{person.rank}</div><div className="roster-name">{person.first_name} {person.last_name}</div>
   <div>Badge {person.badge_number || '—'} · Unit {person.unit_number || '—'}</div>
   <div>Assignment: {assignmentLabel(person)}</div>
   {COMMAND_TIERS.includes(commandRank(person)) && <div>{oversightLabel(person)}</div>}
   <div>Reports to: {reportingLabel(person,users,nameOf)}</div>
   <div>Phone: {person.mobile_phone || 'Not provided'}</div>
   <div className="roster-email">Email: {contactEmail(person) || 'Not provided'}</div>
  </div>
 </article>;
}
export function RosterPrintContent({ users, contactEmail }) {
 const commandRows = COMMAND_TIERS.flatMap(rank=>chunks(users.filter(p=>commandRank(p)===rank),2).map(people=>({rank,people})));
 const pages = chunks(commandRows,3).map(rows=>({title:'COMMAND STRUCTURE',rows}));
 const nonCommand=users.filter(p=>!COMMAND_TIERS.includes(commandRank(p)));
 const inlineRoster=pages.length===1 && commandRows.length<=3 && nonCommand.length<=2;
 for (const letter of ['A','B','']) {
  const people=users.filter(p=>!COMMAND_TIERS.includes(commandRank(p)) && (letter ? p.platoon===letter : !['A','B'].includes(p.platoon)));
  const title=letter ? `PLATOON ${letter}` : 'PENDING PLATOON ASSIGNMENT';
  if(inlineRoster && people.length) { pages[0].extra=[...(pages[0].extra || []),{title,members:people}]; }
  else for (const members of chunks(people,6)) pages.push({title,members});
 }
 return <>{pages.map((page,index)=><section className="roster-sheet" key={index}>
  <header className="roster-header"><div><h1>BLACK POINT SECURITY</h1><div className="roster-subtitle">PERSONNEL &amp; COMMAND ROSTER · {page.title}</div></div><div className="roster-subtitle">{new Date().toLocaleDateString('en-US')}<br/>{users.length} active personnel</div></header>
  {page.rows ? page.rows.map((row,i)=><div className="roster-tier" key={i}>
   {i>0 && <div className="roster-connector"/>}<h2>{row.rank.toUpperCase()}{row.rank==='Major'?' · SHARED REPORTING TO BOTH LT COLONELS':''}</h2>
   <div className="roster-row">{row.people.map(person=><RosterCard key={person.id} person={person} users={users} contactEmail={contactEmail}/>)}</div>
  </div>) : <div className="roster-grid">{page.members.map(person=><RosterCard key={person.id} person={person} users={users} contactEmail={contactEmail}/>)}</div>}
  {page.extra?.map(group=><div className="roster-tier" key={group.title}><h2>{group.title}</h2><div className="roster-row">{group.members.map(person=><RosterCard key={person.id} person={person} users={users} contactEmail={contactEmail}/>)}</div></div>)}
  <footer className="roster-footer"><span>Official personnel hierarchy · Current Pathfinder assignments</span><span>Page {index+1} of {pages.length}</span></footer>
 </section>)}</>;
}
export default function PersonnelPrintRoster(props) {
 if(typeof document==='undefined') return null;
 return createPortal(<div id="bps-print-roster"><style>{rosterPrintCss}</style><RosterPrintContent {...props}/></div>,document.body);
}
