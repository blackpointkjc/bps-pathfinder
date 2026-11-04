import {ArrowLeft,BriefcaseBusiness,CalendarDays,ChevronRight,ClipboardCheck,FileCheck2,FileText,FolderOpen,History,MapPin,MessageSquareText,NotebookPen,Scale,Shield,UserRound,UsersRound} from 'lucide-react';

const names={overview:'Case summary',reporter_messages:'Reporter correspondence',public_releases:'Public disclosures',officers:'People & personnel',evidence:'Evidence vault',interviews:'Interviews & notes',tasks:'Work plan',findings:'Findings & review',corrective_actions:'Orders & discipline',audit:'Activity history'};
const icons={overview:FolderOpen,reporter_messages:MessageSquareText,public_releases:FileText,officers:UsersRound,evidence:FileCheck2,interviews:NotebookPen,tasks:ClipboardCheck,findings:Scale,corrective_actions:Shield,audit:History};
const pretty=text=>String(text||'').replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const formatDate=value=>{if(!value)return 'Not set';const d=new Date(value);return Number.isNaN(d.getTime())?'Not set':d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});};

export function IACaseHero({caseData:c,staff=[],records=[],onBack}){
 const investigator=staff.find(person=>person.id===c.investigator_id);
 const outstanding=records.filter(row=>['task','corrective_action'].includes(row.kind)&&row.status!=='completed').length;
 const evidence=records.filter(row=>row.kind==='evidence').length;
 return <header className="ia-detail-hero">
   <div className="ia-detail-overline"><button className="ia-detail-back" type="button" onClick={onBack}><ArrowLeft size={15}/> All investigations</button><ChevronRight size={13}/><span>Case file</span></div>
   <div className="ia-detail-heading"><div className="ia-detail-title"><span className="ia-detail-type">{pretty(c.kind)} · Professional Standards</span><h1>{c.reference}</h1><p>{c.officers||'Personnel not yet identified'}</p></div><span className="portal-pill ia-detail-status" data-status={c.status}>{pretty(c.status)}</span></div>
   <div className="ia-detail-facts"><div><MapPin size={16}/><span><small>Incident location</small><strong>{c.location||'Not recorded'}</strong></span></div><div><CalendarDays size={16}/><span><small>Incident date</small><strong>{formatDate(c.incident_date)}</strong></span></div><div><UserRound size={16}/><span><small>Assigned investigator</small><strong>{investigator?.name||'Not assigned'}</strong></span></div><div><BriefcaseBusiness size={16}/><span><small>Priority</small><strong>{pretty(c.priority||'normal')}</strong></span></div></div>
   <div className="ia-detail-progress"><span><FileCheck2 size={14}/>{evidence} evidence item{evidence===1?'':'s'}</span><span><ClipboardCheck size={14}/>{outstanding} open follow-up{outstanding===1?'':'s'}</span><span><CalendarDays size={14}/>Due {formatDate(c.due_date)}</span></div>
 </header>;
}

export function IACaseNavigation({sections,active,onSelect,records=[]}){
 const counts={evidence:records.filter(r=>r.kind==='evidence').length,interviews:records.filter(r=>r.kind==='interview').length,tasks:records.filter(r=>r.kind==='task').length,findings:records.filter(r=>['allegation','disposition','policy'].includes(r.kind)).length,corrective_actions:records.filter(r=>['corrective_action','recommendation'].includes(r.kind)).length};
 return <nav className="ia-detail-navigation" aria-label="Case file sections">
   <span className="ia-detail-nav-heading">CASE FILE</span>
   {sections.map(id=>{const Icon=icons[id]||FileText;return <button type="button" key={id} className="ia-detail-nav-button" aria-current={active===id?'page':undefined} onClick={()=>onSelect(id)}><Icon size={17}/><span>{names[id]||pretty(id)}</span>{counts[id]>0&&<small>{counts[id]}</small>}</button>;})}
 </nav>;
}

export function IACaseSectionHeading({section}){
 const Icon=icons[section]||FileText;
 return <header className="ia-detail-section-heading"><span className="ia-detail-section-icon"><Icon size={20}/></span><div><span>CASE DOCUMENTS</span><h2>{names[section]||pretty(section)}</h2></div></header>;
}
