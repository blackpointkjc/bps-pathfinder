import {AlertCircle,ArrowUpRight,CalendarClock,CheckCircle2,ClipboardList,Clock3,FolderOpen,Inbox,ShieldCheck,UserRoundCheck} from 'lucide-react';

const titleCase=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const isLate=caseData=>caseData.due_date&&Date.parse(caseData.due_date)<Date.now()&&!['approved','closed'].includes(caseData.status);
const dateString=value=>{if(!value)return 'No due date';const date=new Date(value);return Number.isNaN(date.getTime())?'No due date':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});};

export function IAOverview({area,reviewer,rows,onNavigate}){
 const inbox=rows.filter(c=>!c.investigator_id&&['new','triage'].includes(c.status));
 const reviewing=rows.filter(c=>c.status==='pending_review');
 const active=rows.filter(c=>!['closed','approved'].includes(c.status));
 const overdue=rows.filter(isLate);
 const counts=area==='intake'?[
  {key:'unassigned',title:'Unassigned intake',value:inbox.length,icon:Inbox,description:'Requires initial assignment'},
  {key:'complaints',title:'Complaints',value:rows.filter(c=>c.kind==='complaint').length,icon:AlertCircle,description:'In loaded intake records'},
  {key:'commendations',title:'Commendations',value:rows.filter(c=>c.kind==='commendation').length,icon:ShieldCheck,description:'In loaded intake records'}
 ]:area==='insights'?[
  {key:'total',title:'Cases in view',value:rows.length,icon:FolderOpen,description:'Loaded case records'},
  {key:'closed',title:'Closed investigations',value:rows.filter(c=>c.status==='closed').length,icon:CheckCircle2,description:'Finalized cases'},
  {key:'overdue',title:'Overdue cases',value:overdue.length,icon:CalendarClock,description:'Past assigned due date'}
 ]:[
  {key:'active',title:'Active investigations',value:active.length,icon:FolderOpen,description:'Including review and returned cases'},
  ...(reviewer?[{key:'review',title:'Awaiting your review',value:reviewing.length,icon:UserRoundCheck,description:'Reviewer-only queue',onClick:()=>onNavigate('pending')}]:[]),
  {key:'overdue',title:'Past deadline',value:overdue.length,icon:Clock3,description:'Needs attention'}
 ];
 return <div className="ia-overview" aria-label="Workspace overview">{counts.map(item=>{const Icon=item.icon;const content=<><span className="ia-metric-icon"><Icon size={17}/></span><span className="ia-metric-number">{item.value}</span><span className="ia-metric-title">{item.title}</span><span className="ia-metric-caption">{item.description}</span></>;return item.onClick?<button type="button" key={item.key} onClick={item.onClick} className="ia-metric ia-metric-action">{content}</button>:<div className="ia-metric" key={item.key}>{content}</div>;})}</div>;
}

export function IACaseQueue({rows,people,kind,busy,onOpen,onFilter,filter,search,onSearch}){
 const isIntake=kind==='inbox';const isReview=kind==='pending';
 const title=isIntake?'Complaint & commendation intake':isReview?'Pending independent review':'Investigation caseload';
 const description=isIntake?'Assign a reviewer-approved investigator to each incoming complaint or commendation.':isReview?'Only authorized IA reviewers may review findings, return a case, or approve an outcome.':'Open a case to manage evidence, interviews, recommendations and follow-up work.';
 return <section className="ia-case-board" aria-label={title}>
  <header className="ia-board-heading"><div><h2>{title}</h2><p>{description}</p></div><span className="ia-board-count">{rows.length} shown</span></header>
  <div className="ia-case-filters"><label>Find a case<input type="search" value={search} placeholder="Case number, person, location or details" onChange={e=>onSearch(e.target.value)} /></label><label>Case status<select value={filter} onChange={e=>onFilter(e.target.value)}><option value="all">All statuses</option>{['new','triage','investigating','pending_review','returned','approved','closed'].map(item=><option key={item} value={item}>{titleCase(item)}</option>)}</select></label></div>
  {rows.length?<div className="ia-case-list">{rows.map(c=><article className="ia-case-item" key={c.id}>
   <div className="ia-case-primary"><div className="ia-case-reference"><span>{c.reference}</span><span className="ia-kind">{titleCase(c.kind)}</span></div><h3>{c.officers||'Officer not yet identified'}</h3><p>{c.location||'Location not recorded'}</p></div>
   <div className="ia-case-meta"><span className="portal-pill" data-status={c.status}>{titleCase(c.status)}</span><span className="ia-case-assignee"><UserRoundCheck size={14}/>{people.find(p=>p.id===c.investigator_id)?.name||'Needs investigator'}</span><span className={isLate(c)?'ia-case-overdue':'ia-case-date'}><CalendarClock size={14}/>{dateString(c.due_date)}</span></div>
   <button type="button" className="ia-case-open" disabled={busy} onClick={()=>onOpen(c.id)}>{isIntake?'Review intake':isReview?'Review findings':'Open case'}<ArrowUpRight size={15}/></button>
  </article>)}</div>:<div className="ia-empty"><CheckCircle2 size={25}/><strong>{isIntake?'Intake queue clear':isReview?'Nothing awaiting review':'No matching cases'}</strong><p>{isIntake?'New submissions will appear here as they arrive.':isReview?'Cases appear here after the investigator submits them for independent review.':'Try another status or search to find a case.'}</p></div>}
 </section>;
}

export function IAAnalytics({rows,outcomes,reviewer,onExport,busy}){
 const statuses=['new','triage','investigating','pending_review','returned','approved','closed'];
 const grouped=Object.entries(rows.reduce((acc,row)=>({...acc,[row.category||'unclassified']:(acc[row.category||'unclassified']||0)+1}),{})).sort((a,b)=>b[1]-a[1]);
 const durations=rows.filter(c=>c.closed_at&&c.created_date).map(c=>(Date.parse(c.closed_at)-Date.parse(c.created_date))/86400000).filter(v=>Number.isFinite(v)&&v>=0);
 const highest=Math.max(1,...statuses.map(status=>rows.filter(c=>c.status===status).length));
 return <section className="ia-analytics" aria-label="Reports and accountability dashboard">
  <div className="ia-analytics-grid">
   <article className="ia-analytics-panel"><header><div><h2>Case progress</h2><p>Investigation stages across the cases currently loaded</p></div><ClipboardList size={19}/></header><div className="ia-progress-list">{statuses.map(status=>{const count=rows.filter(c=>c.status===status).length;return <div className="ia-progress-row" key={status}><span>{titleCase(status)}</span><div className="ia-progress-track"><div style={{width:`${count/highest*100}%`}}/></div><strong>{count}</strong></div>;})}</div></article>
   <article className="ia-analytics-panel"><header><div><h2>Case mix</h2><p>Types, findings and dispositions</p></div><ShieldCheck size={19}/></header><div className="ia-outcome-summary"><div><strong>{rows.filter(c=>c.kind==='complaint').length}</strong><span>Complaints</span></div><div><strong>{rows.filter(c=>c.kind==='commendation').length}</strong><span>Commendations</span></div></div><h3>Allegation findings</h3>{Object.keys(outcomes||{}).length?Object.entries(outcomes).map(([name,count])=><div className="ia-analytics-line" key={name}><span>{titleCase(name)}</span><strong>{count}</strong></div>):<p className="ia-subtle">No findings recorded in this result set.</p>}</article>
   <article className="ia-analytics-panel"><header><div><h2>Classification</h2><p>Cases by complaint or commendation category</p></div><FolderOpen size={19}/></header>{grouped.length?grouped.map(([name,count])=><div className="ia-analytics-line" key={name}><span>{titleCase(name)}</span><strong>{count}</strong></div>):<p className="ia-subtle">No cases in the current view.</p>}</article>
   <article className="ia-analytics-panel"><header><div><h2>Accountability</h2><p>Closure times and private reporting</p></div><CalendarClock size={19}/></header><div className="ia-turnaround"><strong>{durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):'—'}</strong><span>{durations.length?'Average days to close':'No closed cases yet'}</span></div><p className="ia-subtle">Metrics reflect loaded cases, not a company-wide total when more pages remain. Exports are restricted to IA Reviewers and logged.</p>{reviewer&&<button type="button" disabled={busy} onClick={onExport} className="ia-report-export">Export restricted case summary <ArrowUpRight size={15}/></button>}</article>
  </div>
 </section>;
}
