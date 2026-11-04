import {useEffect,useState} from 'react';
import {psCall} from '@/pages/PublicProfessionalStandards';

const OPTIONS=[['no_action','No disciplinary action'],['counseling','Documented counseling'],['written_warning','Written warning'],['final_warning','Final written warning'],['duty_restriction','Duty restriction'],['training','Required corrective training'],['suspension','Account suspension'],['external_referral','External referral'],['other','Other personnel action']];
const label=value=>OPTIONS.find(([id])=>id===value)?.[1]||String(value||'').replaceAll('_',' ');
const initial={directive_type:'counseling',custom_title:'',reason:'',instructions:'',due_date:'',suspension_until:''};
function parse(row){try{return JSON.parse(row.body||'{}');}catch{return {};}}
export default function CaseRecommendations({caseData:c,records=[],reviewer,onAction}){
 const [officerId,setOfficerId]=useState(c.officer_ids?.[0]||'');
 const [officers,setOfficers]=useState([]);
 const [directoryError,setDirectoryError]=useState('');
 const [draft,setDraft]=useState(initial);
 const [editing,setEditing]=useState({});
 const [decisionReason,setDecisionReason]=useState({});
 const proposals=records.filter(item=>item.kind==='recommendation');
 useEffect(()=>{setOfficerId(c.officer_ids?.[0]||'');setDraft(initial);setEditing({});setDecisionReason({});},[c.id]);
 useEffect(()=>{let active=true;setDirectoryError('');psCall({action:'officer_directory'}).then(data=>{if(active)setOfficers(data.officers||[]);}).catch(()=>{if(active)setDirectoryError('Personnel names could not be loaded. Refresh the investigation and try again.');});return()=>{active=false;};},[c.id]);
 const officerLabel=id=>{const person=officers.find(p=>String(p.id)===String(id));return person?[person.name||[person.rank,person.first_name,person.last_name].filter(Boolean).join(' '),person.unit_number?`Unit ${person.unit_number}`:''].filter(Boolean).join(' · '):'Personnel record unavailable';};
 const set=(key,value)=>setDraft(prev=>({...prev,[key]:value}));
 const onSubmit=async event=>{event.preventDefault();const ok=await onAction({action:'recommend_action',case_id:c.id,officer_id:officerId,...draft});if(ok)setDraft(initial);};
 const approve=async (row,decision)=>{
  const proposed={...parse(row),directive_type:row.action_type};
  const updates={...proposed,...editing[row.id]};
  await onAction({action:'decide_recommendation',case_id:c.id,record_id:row.id,decision,review_reason:decisionReason[row.id]||'',...updates});
 };
 const change=(row,key,value)=>setEditing(old=>({...old,[row.id]:{...old[row.id],[key]:value}}));
 return <section className="portal-card mt-4" aria-label="IA recommendations and disciplinary review">
  <h2>Investigator recommendations & reviewer decisions</h2>
  <p className="text-sm text-slate-300">Investigators may propose an action, but cannot impose punishment. An independent reviewer may reject, change, or approve the recommendation after the investigation findings are approved. Approval of the disciplinary decision issues the linked personnel action and records it in the officer's file.</p>
  {directoryError&&<p role="alert" className="text-xs text-amber-300">{directoryError}</p>}
  {!['approved','closed'].includes(c.status)&&<form className="portal-record mt-4 space-y-3" onSubmit={onSubmit}>
   <h3>Recommend an outcome</h3>
   {(c.officer_ids||[]).length?<label>Officer personnel file<select required value={officerId} onChange={e=>setOfficerId(e.target.value)}>{(c.officer_ids||[]).map(id=><option key={id} value={id}>{officerLabel(id)}</option>)}</select></label>:<p className="text-amber-300">Link the involved employee in People & files before recommending an action.</p>}
   <label>Recommended action<select value={draft.directive_type} onChange={e=>set('directive_type',e.target.value)}>{OPTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   {['other','training'].includes(draft.directive_type)&&<label>{draft.directive_type==='training'?'Training course name':'Custom action title'}<input required minLength={5} maxLength={120} value={draft.custom_title} onChange={e=>set('custom_title',e.target.value)}/></label>}
   <label>Reason and supporting findings<textarea required minLength={20} value={draft.reason} onChange={e=>set('reason',e.target.value)} rows={3}/></label>
   <label>Recommended terms / employee instructions<textarea required minLength={20} value={draft.instructions} onChange={e=>set('instructions',e.target.value)} rows={3}/></label>
   {draft.directive_type==='training'&&<label>Training due date<input required type="date" value={draft.due_date} onChange={e=>set('due_date',e.target.value)}/></label>}
   {draft.directive_type==='suspension'&&<label>Suspension end date (optional; reinstatement requires authorized review)<input type="date" value={draft.suspension_until} onChange={e=>set('suspension_until',e.target.value)}/></label>}
   <button type="submit" disabled={!officerId||!officers.some(person=>String(person.id)===String(officerId))}>Save recommendation for IA reviewer</button>
  </form>}
  <div className="mt-4 space-y-3">
   <h3>Submitted recommendations ({proposals.length})</h3>
   {!proposals.length&&<p className="text-sm text-slate-400">No recommendations submitted.</p>}
   {proposals.map(row=>{const saved=parse(row),details={...saved, directive_type:row.action_type,...editing[row.id]};const pending=row.status==='proposed';return <article className="portal-record" key={row.id}>
    <div className="flex flex-wrap justify-between gap-2"><strong>{label(row.action_type)} · {row.author_name}</strong><span className="portal-pill">{row.status}</span></div>
    <p className="text-xs text-slate-400">Personnel file: {officerLabel(row.officer_id)}</p>
    <p className="whitespace-pre-wrap text-sm">{saved.reason}</p>
    <p className="whitespace-pre-wrap text-sm">Proposed instructions: {saved.instructions}</p>
    {reviewer&&pending&&<div className="mt-3 space-y-3 border-t border-slate-700 pt-3">
     <strong>Independent reviewer decision — revise before approval</strong>
     <label>Final action<select value={details.directive_type} onChange={e=>change(row,'directive_type',e.target.value)}>{OPTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
     {['other','training'].includes(details.directive_type)&&<label>Action / course title<input minLength={5} required value={details.custom_title||''} onChange={e=>change(row,'custom_title',e.target.value)}/></label>}
     <label>Final reason<textarea required minLength={20} rows={3} value={details.reason||''} onChange={e=>change(row,'reason',e.target.value)}/></label>
     <label>Final employee instructions<textarea required minLength={20} rows={3} value={details.instructions||''} onChange={e=>change(row,'instructions',e.target.value)}/></label>
     {details.directive_type==='training'&&<label>Training due date<input required type="date" value={details.due_date||''} onChange={e=>change(row,'due_date',e.target.value)}/></label>}
     {details.directive_type==='suspension'&&<label>Suspension until<input type="date" value={details.suspension_until||''} onChange={e=>change(row,'suspension_until',e.target.value)}/></label>}
     <label>Reason for approval, change or rejection<textarea required minLength={20} value={decisionReason[row.id]||''} onChange={e=>setDecisionReason(prev=>({...prev,[row.id]:e.target.value}))} rows={2}/></label>
     <div className="flex flex-wrap gap-2"><button type="button" disabled={c.status!=='approved'||(decisionReason[row.id]||'').length<20} onClick={()=>approve(row,'approve')}>Approve & execute personnel action</button><button type="button" className="portal-secondary" disabled={(decisionReason[row.id]||'').length<20} onClick={()=>approve(row,'reject')}>Reject recommendation</button></div>
     {c.status!=='approved'&&<p className="text-xs text-amber-300">First approve investigation findings through the case workflow. Only then can the personnel action be executed.</p>}
    </div>}
    {row.status==='execution_needs_review'&&<p className="text-amber-300">Execution requires administrative reconciliation. Do not repeat the action until the linked personnel records are checked.</p>}
   </article>})}
  </div>
 </section>;
}
